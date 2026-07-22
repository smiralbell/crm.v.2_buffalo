import { prisma } from '@/lib/prisma'
import { encryptDbUrl, decryptDbUrl, maskDbUrl } from './db-url-crypto'
import {
  DEFAULT_RETENCION_REPORT_PROMPT,
  DEFAULT_RETENCION_REPORT_PROMPT_BUFFALO,
  type RetencionAuditStatus,
  type RetencionChatMessage,
} from './report-prompt'
import type { RetencionAgentConfigPublic } from './types'
import { evaluateAuditChecklist, type AuditChecklist } from './knowledge/checklist'

export type { RetencionAgentConfigPublic }

export type RetencionAgentConfigRow = {
  proyecto_id: string
  client_db_url_enc: string | null
  client_db_host: string | null
  client_db_name: string | null
  client_db_connected_at: Date | null
  audit_status: string
  audit_knowledge: string | null
  audit_messages: unknown
  schema_summary: string | null
  report_prompt: string | null
  report_prompt_buffalo?: string | null
  audit_checklist?: unknown
  created_at: Date
  updated_at: Date
}

/** Columnas explícitas (evita "cached plan must not change result type" tras ALTER). */
const SELECT_CONFIG_BASE = `
  proyecto_id::text AS proyecto_id,
  client_db_url_enc,
  client_db_host,
  client_db_name,
  client_db_connected_at,
  audit_status,
  audit_knowledge,
  audit_messages,
  schema_summary,
  report_prompt,
  created_at,
  updated_at
`

const SELECT_CONFIG_FULL = `
  ${SELECT_CONFIG_BASE},
  report_prompt_buffalo,
  COALESCE(audit_checklist, '{}'::jsonb) AS audit_checklist
`

function parseMessages(raw: unknown): RetencionChatMessage[] {
  if (!Array.isArray(raw)) return []
  const out: RetencionChatMessage[] = []
  for (const m of raw) {
    const o = m as Record<string, unknown>
    if (o.role !== 'user' && o.role !== 'assistant' && o.role !== 'system') continue
    if (typeof o.content !== 'string') continue
    out.push({
      role: o.role,
      content: o.content,
      at: typeof o.at === 'string' ? o.at : undefined,
    })
  }
  return out
}

export function toPublicConfig(row: RetencionAgentConfigRow): RetencionAgentConfigPublic {
  const knowledge = row.audit_knowledge || ''
  const schema = row.schema_summary || ''
  const dbConnected = Boolean(row.client_db_url_enc)
  return {
    proyecto_id: row.proyecto_id,
    audit_status: (row.audit_status as RetencionAuditStatus) || 'pending',
    audit_knowledge: knowledge,
    audit_messages: parseMessages(row.audit_messages),
    schema_summary: schema,
    report_prompt: row.report_prompt?.trim() || DEFAULT_RETENCION_REPORT_PROMPT,
    report_prompt_buffalo:
      row.report_prompt_buffalo?.trim() || DEFAULT_RETENCION_REPORT_PROMPT_BUFFALO,
    audit_checklist: evaluateAuditChecklist({
      knowledge,
      schemaSummary: schema,
      dbConnected,
      stored: row.audit_checklist,
    }),
    db_connected: dbConnected,
    db_host: row.client_db_host,
    db_name: row.client_db_name,
    db_connected_at: row.client_db_connected_at
      ? row.client_db_connected_at.toISOString()
      : null,
    updated_at: row.updated_at.toISOString(),
  }
}

function isCachedPlanError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return (
    msg.includes('cached plan must not change result type') ||
    msg.includes('0A000') ||
    msg.includes('audit_checklist') ||
    msg.includes('report_prompt_buffalo')
  )
}

async function bustPgPlanCache(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('DEALLOCATE ALL')
  } catch {
    // ignore — algunos pools no permiten DEALLOCATE
  }
}

async function selectConfigRow(proyectoId: string): Promise<RetencionAgentConfigRow | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<RetencionAgentConfigRow[]>(
      `SELECT ${SELECT_CONFIG_FULL}
       FROM retencion_agent_configs
       WHERE proyecto_id = $1::uuid
       LIMIT 1`,
      proyectoId
    )
    return rows[0] ?? null
  } catch (e) {
    if (!isCachedPlanError(e)) throw e
    await bustPgPlanCache()
    try {
      const rows = await prisma.$queryRawUnsafe<RetencionAgentConfigRow[]>(
        `SELECT ${SELECT_CONFIG_FULL}
         FROM retencion_agent_configs
         WHERE proyecto_id = $1::uuid
         LIMIT 1`,
        proyectoId
      )
      return rows[0] ?? null
    } catch {
      // Columnas nuevas ausentes o plan aún roto
      const rows = await prisma.$queryRawUnsafe<RetencionAgentConfigRow[]>(
        `SELECT ${SELECT_CONFIG_BASE}
         FROM retencion_agent_configs
         WHERE proyecto_id = $1::uuid
         LIMIT 1`,
        proyectoId
      )
      return rows[0] ? { ...rows[0], audit_checklist: {}, report_prompt_buffalo: null } : null
    }
  }
}

export async function getOrCreateAgentConfig(proyectoId: string): Promise<RetencionAgentConfigRow> {
  const existing = await selectConfigRow(proyectoId)
  if (existing) return existing

  try {
    await prisma.$executeRaw`
      INSERT INTO retencion_agent_configs (proyecto_id, report_prompt, report_prompt_buffalo, audit_status)
      VALUES (
        ${proyectoId}::uuid,
        ${DEFAULT_RETENCION_REPORT_PROMPT},
        ${DEFAULT_RETENCION_REPORT_PROMPT_BUFFALO},
        'pending'
      )
      ON CONFLICT (proyecto_id) DO NOTHING
    `
  } catch {
    await prisma.$executeRaw`
      INSERT INTO retencion_agent_configs (proyecto_id, report_prompt, audit_status)
      VALUES (${proyectoId}::uuid, ${DEFAULT_RETENCION_REPORT_PROMPT}, 'pending')
      ON CONFLICT (proyecto_id) DO NOTHING
    `
  }

  const created = await selectConfigRow(proyectoId)
  if (!created) throw new Error('No se pudo crear la configuración del agente')
  return created
}

export async function saveDbUrl(proyectoId: string, url: string): Promise<RetencionAgentConfigRow> {
  await getOrCreateAgentConfig(proyectoId)
  const enc = encryptDbUrl(url)
  const masked = maskDbUrl(url)
  await prisma.$executeRaw`
    UPDATE retencion_agent_configs SET
      client_db_url_enc = ${enc},
      client_db_host = ${masked.host},
      client_db_name = ${masked.database},
      client_db_connected_at = NOW(),
      audit_status = CASE
        WHEN audit_status IN ('pending', 'discovery', 'db_needed') THEN 'schema_audit'
        ELSE audit_status
      END,
      updated_at = NOW()
    WHERE proyecto_id = ${proyectoId}::uuid
  `
  return getOrCreateAgentConfig(proyectoId)
}

export async function getDecryptedDbUrl(proyectoId: string): Promise<string | null> {
  const row = await getOrCreateAgentConfig(proyectoId)
  if (!row.client_db_url_enc) return null
  return decryptDbUrl(row.client_db_url_enc)
}

export async function updateAgentConfig(
  proyectoId: string,
  patch: {
    audit_status?: RetencionAuditStatus
    audit_knowledge?: string
    audit_messages?: RetencionChatMessage[]
    schema_summary?: string
    report_prompt?: string
    report_prompt_buffalo?: string
    audit_checklist?: AuditChecklist | Record<string, unknown>
  }
): Promise<RetencionAgentConfigRow> {
  await getOrCreateAgentConfig(proyectoId)
  const messagesJson = patch.audit_messages != null ? JSON.stringify(patch.audit_messages) : null
  const checklistJson =
    patch.audit_checklist != null ? JSON.stringify(patch.audit_checklist) : null

  try {
    await prisma.$executeRaw`
      UPDATE retencion_agent_configs SET
        audit_status = COALESCE(${patch.audit_status ?? null}, audit_status),
        audit_knowledge = COALESCE(${patch.audit_knowledge ?? null}, audit_knowledge),
        audit_messages = CASE
          WHEN ${messagesJson}::text IS NOT NULL THEN ${messagesJson}::jsonb
          ELSE audit_messages
        END,
        schema_summary = COALESCE(${patch.schema_summary ?? null}, schema_summary),
        report_prompt = COALESCE(${patch.report_prompt ?? null}, report_prompt),
        report_prompt_buffalo = COALESCE(${patch.report_prompt_buffalo ?? null}, report_prompt_buffalo),
        audit_checklist = CASE
          WHEN ${checklistJson}::text IS NOT NULL THEN ${checklistJson}::jsonb
          ELSE audit_checklist
        END,
        updated_at = NOW()
      WHERE proyecto_id = ${proyectoId}::uuid
    `
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('audit_checklist') || msg.includes('report_prompt_buffalo') || msg.includes('does not exist') || isCachedPlanError(e)) {
      await bustPgPlanCache()
      await prisma.$executeRaw`
        UPDATE retencion_agent_configs SET
          audit_status = COALESCE(${patch.audit_status ?? null}, audit_status),
          audit_knowledge = COALESCE(${patch.audit_knowledge ?? null}, audit_knowledge),
          audit_messages = CASE
            WHEN ${messagesJson}::text IS NOT NULL THEN ${messagesJson}::jsonb
            ELSE audit_messages
          END,
          schema_summary = COALESCE(${patch.schema_summary ?? null}, schema_summary),
          report_prompt = COALESCE(${patch.report_prompt ?? null}, report_prompt),
          updated_at = NOW()
        WHERE proyecto_id = ${proyectoId}::uuid
      `
      // Reintento parcial buffalo si la columna existe
      if (patch.report_prompt_buffalo != null) {
        try {
          await prisma.$executeRaw`
            UPDATE retencion_agent_configs SET
              report_prompt_buffalo = ${patch.report_prompt_buffalo},
              updated_at = NOW()
            WHERE proyecto_id = ${proyectoId}::uuid
          `
        } catch {
          // columna ausente — ignorar
        }
      }
    } else {
      throw e
    }
  }
  return getOrCreateAgentConfig(proyectoId)
}

/* --- Métricas descubiertas (cache de definiciones SQL) --------------------- */

let metricColumnEnsured = false
async function ensureMetricQueriesColumn(): Promise<void> {
  if (metricColumnEnsured) return
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE retencion_agent_configs ADD COLUMN IF NOT EXISTS metric_queries JSONB`
    )
    metricColumnEnsured = true
  } catch {
    // ignora: sin permisos DDL o ya existe
  }
}

export async function getMetricQueries(
  proyectoId: string
): Promise<import('./metrics/types').MetricDef[] | null> {
  await getOrCreateAgentConfig(proyectoId)
  try {
    const rows = await prisma.$queryRawUnsafe<{ metric_queries: unknown }[]>(
      `SELECT metric_queries FROM retencion_agent_configs WHERE proyecto_id = $1::uuid LIMIT 1`,
      proyectoId
    )
    const raw = rows[0]?.metric_queries
    if (Array.isArray(raw)) return raw as import('./metrics/types').MetricDef[]
    return null
  } catch {
    await ensureMetricQueriesColumn()
    return null
  }
}

export async function saveMetricQueries(
  proyectoId: string,
  defs: import('./metrics/types').MetricDef[]
): Promise<void> {
  await getOrCreateAgentConfig(proyectoId)
  await ensureMetricQueriesColumn()
  const json = JSON.stringify(defs)
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE retencion_agent_configs SET metric_queries = $1::jsonb, updated_at = NOW() WHERE proyecto_id = $2::uuid`,
      json,
      proyectoId
    )
  } catch {
    await bustPgPlanCache()
    await prisma.$executeRawUnsafe(
      `UPDATE retencion_agent_configs SET metric_queries = $1::jsonb, updated_at = NOW() WHERE proyecto_id = $2::uuid`,
      json,
      proyectoId
    )
  }
}

export async function clearDbUrl(proyectoId: string): Promise<RetencionAgentConfigRow> {
  await prisma.$executeRaw`
    UPDATE retencion_agent_configs SET
      client_db_url_enc = NULL,
      client_db_host = NULL,
      client_db_name = NULL,
      client_db_connected_at = NULL,
      audit_status = 'db_needed',
      updated_at = NOW()
    WHERE proyecto_id = ${proyectoId}::uuid
  `
  return getOrCreateAgentConfig(proyectoId)
}
