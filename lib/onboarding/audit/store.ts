import { query } from '@/lib/db'
import {
  emptyContext,
  emptyAuditCollections,
  type AuditAnswer,
  type AuditAreaId,
  type AuditContextPanel,
  type AuditConversationTurn,
  type AuditGap,
  type AuditMeta,
  type AuditMode,
  type AuditProgressMap,
  type AuditProjectType,
  type AuditQuestion,
  type AuditReport,
  type AuditStructured,
  type ProjectAudit,
} from './types'

type Row = {
  id: string
  lead_id: number
  project_types: string[] | null
  active_mode: string
  active_area: string
  active_question_id?: string | null
  structured: AuditStructured | string
  conversation: AuditConversationTurn[] | string
  questions?: AuditQuestion[] | string
  answers?: AuditAnswer[] | string
  gaps?: AuditGap[] | string
  progress?: AuditProgressMap | string
  context: AuditContextPanel | string
  status: string
  started_at?: Date | string | null
  completed_at?: Date | string | null
  created_at: Date | string
  updated_at: Date | string
  meta?: AuditMeta | string | null
  report?: AuditReport | string | null
}

function parseJson<T>(v: T | string | null | undefined, fallback: T): T {
  if (v == null) return fallback
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T
    } catch {
      return fallback
    }
  }
  return v
}

function iso(v: Date | string | null | undefined): string | null {
  if (v == null) return null
  return v instanceof Date ? v.toISOString() : String(v)
}

function mapRow(r: Row): ProjectAudit {
  const empty = emptyAuditCollections()
  const context = parseJson(r.context, emptyContext())
  if (!context.sections) context.sections = {}
  return {
    id: r.id,
    lead_id: Number(r.lead_id),
    project_types: (r.project_types || []) as AuditProjectType[],
    active_mode: (r.active_mode || 'descubrimiento') as AuditMode,
    active_area: (r.active_area || 'negocio') as AuditAreaId,
    active_question_id: r.active_question_id || null,
    structured: parseJson(r.structured, {}),
    conversation: parseJson(r.conversation, []),
    questions: parseJson(r.questions, empty.questions),
    answers: parseJson(r.answers, empty.answers),
    gaps: parseJson(r.gaps, empty.gaps),
    progress: parseJson(r.progress, empty.progress),
    context,
    status: (r.status || 'in_progress') as ProjectAudit['status'],
    started_at: iso(r.started_at),
    completed_at: iso(r.completed_at),
    created_at: iso(r.created_at) || new Date().toISOString(),
    updated_at: iso(r.updated_at) || new Date().toISOString(),
    meta: parseJson(r.meta, {}),
    report: r.report == null ? null : parseJson(r.report, null as AuditReport | null),
  }
}

const SELECT_COLS = `id, lead_id, project_types, active_mode, active_area,
  active_question_id, structured, conversation, questions, answers, gaps, progress,
  context, status, started_at, completed_at, created_at, updated_at, meta, report`

export async function getAuditByLeadId(leadId: number): Promise<ProjectAudit | null> {
  try {
    const { rows } = await query<Row>(
      `SELECT ${SELECT_COLS} FROM project_audits WHERE lead_id = $1 LIMIT 1`,
      [leadId]
    )
    return rows[0] ? mapRow(rows[0]) : null
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (!/questions|active_question_id|progress|gaps|meta|report/i.test(msg)) throw e
    try {
      const { rows } = await query<Row>(
        `SELECT id, lead_id, project_types, active_mode, active_area,
                active_question_id, structured, conversation, questions, answers, gaps, progress,
                context, status, started_at, completed_at, created_at, updated_at
         FROM project_audits WHERE lead_id = $1 LIMIT 1`,
        [leadId]
      )
      return rows[0] ? mapRow(rows[0]) : null
    } catch (e2: unknown) {
      const msg2 = e2 instanceof Error ? e2.message : ''
      if (!/questions|active_question_id|progress|gaps/i.test(msg2)) throw e2
      const { rows } = await query<Row>(
        `SELECT id, lead_id, project_types, active_mode, active_area,
                structured, conversation, context, status, created_at, updated_at
         FROM project_audits WHERE lead_id = $1 LIMIT 1`,
        [leadId]
      )
      return rows[0] ? mapRow(rows[0]) : null
    }
  }
}

export async function getAuditById(id: string): Promise<ProjectAudit | null> {
  try {
    const { rows } = await query<Row>(
      `SELECT ${SELECT_COLS} FROM project_audits WHERE id = $1 LIMIT 1`,
      [id]
    )
    return rows[0] ? mapRow(rows[0]) : null
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (!/questions|active_question_id|progress|gaps|meta|report/i.test(msg)) throw e
    try {
      const { rows } = await query<Row>(
        `SELECT id, lead_id, project_types, active_mode, active_area,
                active_question_id, structured, conversation, questions, answers, gaps, progress,
                context, status, started_at, completed_at, created_at, updated_at
         FROM project_audits WHERE id = $1 LIMIT 1`,
        [id]
      )
      return rows[0] ? mapRow(rows[0]) : null
    } catch (e2: unknown) {
      const msg2 = e2 instanceof Error ? e2.message : ''
      if (!/questions|active_question_id|progress|gaps/i.test(msg2)) throw e2
      const { rows } = await query<Row>(
        `SELECT id, lead_id, project_types, active_mode, active_area,
                structured, conversation, context, status, created_at, updated_at
         FROM project_audits WHERE id = $1 LIMIT 1`,
        [id]
      )
      return rows[0] ? mapRow(rows[0]) : null
    }
  }
}

export async function createAudit(input: {
  lead_id: number
  project_types?: AuditProjectType[]
}): Promise<ProjectAudit> {
  const existing = await getAuditByLeadId(input.lead_id)
  if (existing) return existing

  const types = input.project_types?.length ? input.project_types : (['unclear'] as AuditProjectType[])
  try {
    const { rows } = await query<Row>(
      `INSERT INTO project_audits (
         lead_id, project_types, structured, conversation, context,
         questions, answers, gaps, progress
       ) VALUES (
         $1, $2, '{}'::jsonb, '[]'::jsonb, $3::jsonb,
         '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
       )
       RETURNING ${SELECT_COLS}`,
      [input.lead_id, types, JSON.stringify(emptyContext())]
    )
    return mapRow(rows[0])
  } catch {
    const { rows } = await query<Row>(
      `INSERT INTO project_audits (lead_id, project_types, structured, conversation, context)
       VALUES ($1, $2, '{}'::jsonb, '[]'::jsonb, $3::jsonb)
       RETURNING id, lead_id, project_types, active_mode, active_area,
                 structured, conversation, context, status, created_at, updated_at`,
      [input.lead_id, types, JSON.stringify(emptyContext())]
    )
    return mapRow(rows[0])
  }
}

export async function saveAudit(audit: ProjectAudit): Promise<ProjectAudit> {
  try {
    const { rows } = await query<Row>(
      `UPDATE project_audits SET
         project_types = $2,
         active_mode = $3,
         active_area = $4,
         active_question_id = $5,
         structured = $6::jsonb,
         conversation = $7::jsonb,
         questions = $8::jsonb,
         answers = $9::jsonb,
         gaps = $10::jsonb,
         progress = $11::jsonb,
         context = $12::jsonb,
         status = $13,
         started_at = $14,
         completed_at = $15,
         meta = $16::jsonb,
         report = $17::jsonb,
         updated_at = NOW()
       WHERE id = $1
       RETURNING ${SELECT_COLS}`,
      [
        audit.id,
        audit.project_types,
        audit.active_mode,
        audit.active_area,
        audit.active_question_id,
        JSON.stringify(audit.structured || {}),
        JSON.stringify(audit.conversation || []),
        JSON.stringify(audit.questions || []),
        JSON.stringify(audit.answers || []),
        JSON.stringify(audit.gaps || []),
        JSON.stringify(audit.progress || {}),
        JSON.stringify(audit.context || emptyContext()),
        audit.status,
        audit.started_at,
        audit.completed_at,
        JSON.stringify(audit.meta || {}),
        audit.report ? JSON.stringify(audit.report) : null,
      ]
    )
    return mapRow(rows[0])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (!/questions|active_question_id|progress|gaps|started_at|meta|report/i.test(msg)) throw e
    try {
      const { rows } = await query<Row>(
        `UPDATE project_audits SET
           project_types = $2,
           active_mode = $3,
           active_area = $4,
           active_question_id = $5,
           structured = $6::jsonb,
           conversation = $7::jsonb,
           questions = $8::jsonb,
           answers = $9::jsonb,
           gaps = $10::jsonb,
           progress = $11::jsonb,
           context = $12::jsonb,
           status = $13,
           started_at = $14,
           completed_at = $15,
           updated_at = NOW()
         WHERE id = $1
         RETURNING id, lead_id, project_types, active_mode, active_area,
                   active_question_id, structured, conversation, questions, answers, gaps, progress,
                   context, status, started_at, completed_at, created_at, updated_at`,
        [
          audit.id,
          audit.project_types,
          audit.active_mode,
          audit.active_area,
          audit.active_question_id,
          JSON.stringify(audit.structured || {}),
          JSON.stringify(audit.conversation || []),
          JSON.stringify(audit.questions || []),
          JSON.stringify(audit.answers || []),
          JSON.stringify(audit.gaps || []),
          JSON.stringify(audit.progress || {}),
          JSON.stringify(audit.context || emptyContext()),
          audit.status,
          audit.started_at,
          audit.completed_at,
        ]
      )
      return {
        ...mapRow(rows[0]),
        meta: audit.meta,
        report: audit.report,
      }
    } catch (e2: unknown) {
      const msg2 = e2 instanceof Error ? e2.message : ''
      if (!/questions|active_question_id|progress|gaps|started_at/i.test(msg2)) throw e2
      const { rows } = await query<Row>(
        `UPDATE project_audits SET
           project_types = $2,
           active_mode = $3,
           active_area = $4,
           structured = $5::jsonb,
           conversation = $6::jsonb,
           context = $7::jsonb,
           status = $8,
           updated_at = NOW()
         WHERE id = $1
         RETURNING id, lead_id, project_types, active_mode, active_area,
                   structured, conversation, context, status, created_at, updated_at`,
        [
          audit.id,
          audit.project_types,
          audit.active_mode,
          audit.active_area,
          JSON.stringify(audit.structured || {}),
          JSON.stringify(audit.conversation || []),
          JSON.stringify(audit.context || emptyContext()),
          audit.status,
        ]
      )
      const mapped = mapRow(rows[0])
      return {
        ...mapped,
        questions: audit.questions,
        answers: audit.answers,
        gaps: audit.gaps,
        progress: audit.progress,
        active_question_id: audit.active_question_id,
        meta: audit.meta,
        report: audit.report,
      }
    }
  }
}
