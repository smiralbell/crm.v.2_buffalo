import { prisma } from '@/lib/prisma'
import type { ColumnMapping } from './field-mapping'
import { applyColumnMapping, normalizeStoredMapping } from './field-mapping'
import {
  findOtherCampaignMatchesForLeads,
  resolveOtherCampaignMatch,
  summarizeOtherCampaignMatches,
} from './import-duplicate-check'
import type { ColdCallScope } from './scope'
import { getScopeFilterParams } from './scope'
import type { ColdCallCampaign, CsvLeadInput, ImportBatchResult } from './types'
import { LEAD_STAGES } from './types'
import { syncProspectPipelineCard } from '@/lib/pipelines/cold-calling'

export async function listCampaigns(scope: ColdCallScope): Promise<ColdCallCampaign[]> {
  const { userId: scopeUserId, teamIds: scopeTeamIds, legacyAdmin } = getScopeFilterParams(scope)
  const rows = await prisma.$queryRaw<
    {
      id: number
      name: string
      description: string | null
      status: string
      assigned_to_user_id: number | null
      created_by_user_id: number | null
      created_at: Date
      updated_at: Date
      assignee_name: string | null
      total_leads: string | number
      in_queue: string | number
      contacted: string | number
      interested: string | number
      meetings: string | number
      dnc: string | number
    }[]
  >`
    SELECT
      c.*,
      u.name AS assignee_name,
      COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL)::int AS total_leads,
      COUNT(p.id) FILTER (
        WHERE p.deleted_at IS NULL AND p.do_not_call = FALSE
          AND p.stage IN ('nuevo', 'en_cola', 'volver_a_llamar')
      )::int AS in_queue,
      COUNT(p.id) FILTER (
        WHERE p.deleted_at IS NULL AND p.call_attempts > 0
      )::int AS contacted,
      COUNT(p.id) FILTER (
        WHERE p.deleted_at IS NULL AND p.stage IN ('interesado_info_enviada', 'reunion_agendada')
      )::int AS interested,
      COUNT(p.id) FILTER (
        WHERE p.deleted_at IS NULL AND p.stage = 'reunion_agendada'
      )::int AS meetings,
      COUNT(p.id) FILTER (
        WHERE p.deleted_at IS NULL AND p.do_not_call = TRUE
      )::int AS dnc
    FROM coldcall_campaigns c
    LEFT JOIN crm_users u ON u.id = c.assigned_to_user_id
    LEFT JOIN coldcall_prospects p ON p.campaign_id = c.id
    WHERE (
      (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
      OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
      OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
        c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
        OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
        OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
      ))
    )
    GROUP BY c.id, u.name
    ORDER BY c.created_at DESC
  `

  return rows.map((r) => mapCampaignRow(r))
}

function mapCampaignRow(r: {
  id: number
  name: string
  description: string | null
  status: string
  assigned_to_user_id: number | null
  created_by_user_id: number | null
  created_at: Date
  updated_at: Date
  assignee_name?: string | null
  total_leads?: string | number
  in_queue?: string | number
  contacted?: string | number
  interested?: string | number
  meetings?: string | number
  dnc?: string | number
  import_columns?: unknown
  column_mapping?: unknown
  script_markdown_es?: string | null
  script_markdown_ca?: string | null
  presentation_url?: string | null
}): ColdCallCampaign {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status as ColdCallCampaign['status'],
    assigned_to_user_id: r.assigned_to_user_id,
    created_by_user_id: r.created_by_user_id,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
    assignee_name: r.assignee_name ?? null,
    import_columns: parseJsonArray(r.import_columns),
    column_mapping: normalizeStoredMapping(parseJsonObject(r.column_mapping)),
    script_markdown_es: r.script_markdown_es ?? null,
    script_markdown_ca: r.script_markdown_ca ?? null,
    presentation_url: r.presentation_url ?? null,
    stats: r.total_leads != null ? {
      total_leads: Number(r.total_leads),
      in_queue: Number(r.in_queue),
      contacted: Number(r.contacted),
      interested: Number(r.interested),
      meetings: Number(r.meetings),
      dnc: Number(r.dnc),
    } : undefined,
  }
}

function parseJsonArray(v: unknown): string[] | null {
  if (!v) return null
  if (Array.isArray(v)) return v.map(String)
  return null
}

function parseJsonObject(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string') out[k] = val
  }
  return Object.keys(out).length ? out : null
}

export async function getCampaignById(id: number): Promise<ColdCallCampaign | null> {
  const rows = await prisma.$queryRaw<
    {
      id: number
      name: string
      description: string | null
      status: string
      assigned_to_user_id: number | null
      created_by_user_id: number | null
      created_at: Date
      updated_at: Date
      import_columns: unknown
      column_mapping: unknown
      assignee_name: string | null
      total_leads: string | number
      in_queue: string | number
      contacted: string | number
      interested: string | number
      meetings: string | number
      dnc: string | number
    }[]
  >`
    SELECT
      c.*,
      u.name AS assignee_name,
      COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL)::int AS total_leads,
      COUNT(p.id) FILTER (
        WHERE p.deleted_at IS NULL AND p.do_not_call = FALSE
          AND p.stage IN ('nuevo', 'en_cola', 'volver_a_llamar')
      )::int AS in_queue,
      COUNT(p.id) FILTER (
        WHERE p.deleted_at IS NULL AND p.call_attempts > 0
      )::int AS contacted,
      COUNT(p.id) FILTER (
        WHERE p.deleted_at IS NULL AND p.stage IN ('interesado_info_enviada', 'reunion_agendada')
      )::int AS interested,
      COUNT(p.id) FILTER (
        WHERE p.deleted_at IS NULL AND p.stage = 'reunion_agendada'
      )::int AS meetings,
      COUNT(p.id) FILTER (
        WHERE p.deleted_at IS NULL AND p.do_not_call = TRUE
      )::int AS dnc
    FROM coldcall_campaigns c
    LEFT JOIN crm_users u ON u.id = c.assigned_to_user_id
    LEFT JOIN coldcall_prospects p ON p.campaign_id = c.id
    WHERE c.id = ${id}
    GROUP BY c.id, u.name
    LIMIT 1
  `
  return rows[0] ? mapCampaignRow(rows[0]) : null
}

/** Asigna la campaña a un comercial y propaga a todos sus leads. */
export async function updateCampaignAssignee(
  campaignId: number,
  assignedToUserId: number | null
): Promise<ColdCallCampaign | null> {
  await prisma.$executeRaw`
    UPDATE coldcall_campaigns
    SET assigned_to_user_id = ${assignedToUserId}, updated_at = NOW()
    WHERE id = ${campaignId}
  `
  await prisma.$executeRaw`
    UPDATE coldcall_prospects
    SET assigned_user_id = ${assignedToUserId}, updated_at = NOW()
    WHERE campaign_id = ${campaignId} AND deleted_at IS NULL
  `
  return getCampaignById(campaignId)
}

export async function createCampaign(input: {
  name: string
  description?: string
  assigned_to_user_id?: number | null
  created_by_user_id?: number | null
}): Promise<ColdCallCampaign> {
  const rows = await prisma.$queryRaw<
    {
      id: number
      name: string
      description: string | null
      status: string
      assigned_to_user_id: number | null
      created_by_user_id: number | null
      created_at: Date
      updated_at: Date
    }[]
  >`
    INSERT INTO coldcall_campaigns (name, description, assigned_to_user_id, created_by_user_id)
    VALUES (
      ${input.name.trim()},
      ${input.description?.trim() || null},
      ${input.assigned_to_user_id ?? null},
      ${input.created_by_user_id ?? null}
    )
    RETURNING *
  `
  const c = rows[0]
  return {
    ...c,
    status: c.status as ColdCallCampaign['status'],
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
    stats: {
      total_leads: 0,
      in_queue: 0,
      contacted: 0,
      interested: 0,
      meetings: 0,
      dnc: 0,
    },
  }
}

export async function importLeadsToCampaign(input: {
  campaignId: number
  fileName: string
  importedByUserId: number | null
  leads: CsvLeadInput[]
  importColumns: string[]
  columnMapping: ColumnMapping
}): Promise<ImportBatchResult> {
  await prisma.$executeRaw`
    UPDATE coldcall_campaigns SET
      import_columns = ${JSON.stringify(input.importColumns)}::jsonb,
      column_mapping = ${JSON.stringify(input.columnMapping)}::jsonb,
      updated_at = NOW()
    WHERE id = ${input.campaignId}
  `

  const batchRows = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO coldcall_import_batches (
      campaign_id, file_name, imported_by_user_id, rows_total
    ) VALUES (
      ${input.campaignId},
      ${input.fileName},
      ${input.importedByUserId},
      ${input.leads.length}
    )
    RETURNING id
  `
  const batchId = batchRows[0].id

  let rowsImported = 0
  let rowsUpdated = 0
  let rowsSkippedDuplicate = 0
  let rowsSkippedDnc = 0
  let rowsSkippedOtherCampaign = 0

  const otherCampaignIndex = await findOtherCampaignMatchesForLeads(
    input.campaignId,
    input.leads.map((lead) => ({
      dedupeKey: lead.dedupeKey,
      telefono: lead.telefono,
      nombre: lead.nombre,
    }))
  )

  const campaign = await prisma.$queryRaw<{ assigned_to_user_id: number | null }[]>`
    SELECT assigned_to_user_id FROM coldcall_campaigns WHERE id = ${input.campaignId} LIMIT 1
  `
  const defaultAssignee = campaign[0]?.assigned_to_user_id ?? null

  for (const lead of input.leads) {
    if (lead.doNotCall) {
      rowsSkippedDnc++
      continue
    }

    if (resolveOtherCampaignMatch(lead, otherCampaignIndex)) {
      rowsSkippedOtherCampaign++
      continue
    }

    const existing = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM coldcall_prospects
      WHERE dedupe_key = ${lead.dedupeKey}
        AND campaign_id = ${input.campaignId}
        AND deleted_at IS NULL
      LIMIT 1
    `
    if (existing[0]) {
      await prisma.$executeRaw`
        UPDATE coldcall_prospects SET
          nombre = ${lead.nombre},
          first_name = ${lead.firstName || null},
          last_name = ${lead.lastName || null},
          empresa = ${lead.empresa},
          telefono = ${lead.telefono},
          email = ${lead.email},
          zona = ${lead.ciudad},
          sector = ${lead.sector},
          cargo = ${lead.cargo},
          linkedin = ${lead.linkedin},
          web = ${lead.web},
          cif = ${lead.cif},
          direccion = ${lead.direccion},
          do_not_call = ${lead.doNotCall},
          apollo_data = ${JSON.stringify(lead.rawData)}::jsonb,
          updated_at = NOW()
        WHERE id = ${existing[0].id}
      `
      rowsUpdated++
      continue
    }

    await prisma.$executeRaw`
      INSERT INTO coldcall_prospects (
        nombre, first_name, last_name, empresa, telefono, email, zona, sector, cargo,
        linkedin, web, cif, direccion, notas, estado, stage, dedupe_key, campaign_id, import_batch_id,
        do_not_call, apollo_data, assigned_user_id,
        call_attempts, created_at, updated_at
      ) VALUES (
        ${lead.nombre},
        ${lead.firstName || null},
        ${lead.lastName || null},
        ${lead.empresa},
        ${lead.telefono},
        ${lead.email},
        ${lead.ciudad},
        ${lead.sector},
        ${lead.cargo},
        ${lead.linkedin},
        ${lead.web},
        ${lead.cif},
        ${lead.direccion},
        NULL,
        'pendiente',
        'en_cola',
        ${lead.dedupeKey},
        ${input.campaignId},
        ${batchId},
        ${lead.doNotCall},
        ${JSON.stringify(lead.rawData)}::jsonb,
        ${defaultAssignee},
        0,
        NOW(),
        NOW()
      )
    `

    const inserted = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM coldcall_prospects
      WHERE dedupe_key = ${lead.dedupeKey}
        AND campaign_id = ${input.campaignId}
        AND deleted_at IS NULL
      ORDER BY id DESC LIMIT 1
    `
    if (inserted[0]) {
      await prisma.$executeRaw`
        INSERT INTO coldcall_activities (prospect_id, activity_type, content, auto)
        VALUES (
          ${inserted[0].id},
          'imported',
          ${`Importado desde ${input.fileName}`},
          TRUE
        )
      `
      await syncProspectPipelineCard(inserted[0].id)
    }

    rowsImported++
  }

  await prisma.$executeRaw`
    UPDATE coldcall_import_batches SET
      rows_imported = ${rowsImported},
      rows_skipped_duplicate = ${rowsSkippedDuplicate},
      rows_skipped_dnc = ${rowsSkippedDnc}
    WHERE id = ${batchId}
  `

  const otherCampaignSummary = summarizeOtherCampaignMatches(
    input.leads.map((lead) => ({
      dedupeKey: lead.dedupeKey,
      telefono: lead.telefono,
      nombre: lead.nombre,
    })),
    otherCampaignIndex
  )

  return {
    batch_id: batchId,
    rows_total: input.leads.length,
    rows_imported: rowsImported,
    rows_updated: rowsUpdated,
    rows_skipped_duplicate: rowsSkippedDuplicate,
    rows_skipped_dnc: rowsSkippedDnc,
    rows_skipped_other_campaign: rowsSkippedOtherCampaign,
    other_campaign_samples: otherCampaignSummary.samples,
  }
}

export async function getNextQueueLead(campaignId: number) {
  const rows = await prisma.$queryRaw<
    {
      id: number
      nombre: string
      empresa: string | null
      telefono: string | null
      email: string | null
      zona: string | null
      sector: string | null
      cargo: string | null
      linkedin: string | null
      web: string | null
      estado: string
      stage: string
      notas: string | null
      call_attempts: number
      employee_count: number | null
      do_not_call: boolean
    }[]
  >`
    SELECT
      id, nombre, empresa, telefono, email, zona, sector, cargo, linkedin, web,
      estado, stage, notas, call_attempts, employee_count, do_not_call
    FROM coldcall_prospects
    WHERE campaign_id = ${campaignId}
      AND deleted_at IS NULL
      AND do_not_call = FALSE
      AND stage IN ('nuevo', 'en_cola', 'volver_a_llamar')
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY
      CASE stage WHEN 'volver_a_llamar' THEN 0 WHEN 'en_cola' THEN 1 ELSE 2 END,
      call_attempts ASC,
      created_at ASC
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getQueueCount(campaignId: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: string | number }[]>`
    SELECT COUNT(*)::int AS count
    FROM coldcall_prospects
    WHERE campaign_id = ${campaignId}
      AND deleted_at IS NULL
      AND do_not_call = FALSE
      AND stage IN ('nuevo', 'en_cola', 'volver_a_llamar')
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
  `
  return Number(rows[0]?.count ?? 0)
}

export function isValidStage(s: string): boolean {
  return (LEAD_STAGES as readonly string[]).includes(s)
}

export interface CampaignLeadListRow {
  id: number
  nombre: string
  telefono: string | null
  email: string | null
  stage: string
  call_attempts: number
  call_count: number
  raw_data: Record<string, string> | null
  created_at: Date
}

export async function saveCampaignMapping(
  campaignId: number,
  importColumns: string[],
  columnMapping: ColumnMapping
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE coldcall_campaigns SET
      import_columns = ${JSON.stringify(importColumns)}::jsonb,
      column_mapping = ${JSON.stringify(columnMapping)}::jsonb,
      updated_at = NOW()
    WHERE id = ${campaignId}
  `
}

export async function applyCampaignMappingToLeads(campaignId: number): Promise<number> {
  const camp = await getCampaignById(campaignId)
  if (!camp?.column_mapping) return 0

  const mapping = normalizeStoredMapping(camp.column_mapping as Record<string, string> | null)
  const rows = await prisma.$queryRaw<{ id: number; apollo_data: unknown }[]>`
    SELECT id, apollo_data FROM coldcall_prospects
    WHERE campaign_id = ${campaignId} AND deleted_at IS NULL
  `

  let updated = 0
  for (const row of rows) {
    const raw =
      row.apollo_data && typeof row.apollo_data === 'object' && !Array.isArray(row.apollo_data)
        ? (row.apollo_data as Record<string, string>)
        : null
    if (!raw) continue

    const f = applyColumnMapping(raw, mapping)
    await prisma.$executeRaw`
      UPDATE coldcall_prospects SET
        nombre = ${f.nombre},
        first_name = ${f.firstName},
        last_name = ${f.lastName},
        empresa = ${f.empresa},
        telefono = ${f.telefono},
        email = ${f.email},
        zona = ${f.ciudad},
        sector = ${f.sector},
        cargo = ${f.cargo},
        linkedin = ${f.linkedin},
        web = ${f.web},
        cif = ${f.cif},
        direccion = ${f.direccion},
        do_not_call = ${f.doNotCall},
        dedupe_key = ${f.dedupeKey},
        updated_at = NOW()
      WHERE id = ${row.id}
    `
    updated++
  }
  return updated
}

export async function listCampaignLeads(
  campaignId: number,
  opts: { page?: number; limit?: number; q?: string } = {}
): Promise<{ leads: CampaignLeadListRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1)
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50))
  const offset = (page - 1) * limit
  const q = opts.q?.trim()

  if (q) {
    const pattern = `%${q}%`
    const [countRows, leads] = await Promise.all([
      prisma.$queryRaw<{ count: string | number }[]>`
        SELECT COUNT(*)::int AS count FROM coldcall_prospects
        WHERE campaign_id = ${campaignId}
          AND deleted_at IS NULL
          AND (
            nombre ILIKE ${pattern}
            OR empresa ILIKE ${pattern}
            OR email ILIKE ${pattern}
            OR telefono ILIKE ${pattern}
            OR apollo_data::text ILIKE ${pattern}
          )
      `,
      prisma.$queryRaw<CampaignLeadListRow[]>`
        SELECT
          id,
          nombre,
          telefono,
          email,
          CASE
            WHEN stage IN (
              'interesado_info_enviada', 'reunion_agendada', 'no_interesado',
              'volver_a_llamar', 'descartado_numero_erroneo'
            ) THEN stage
            WHEN estado IS NOT NULL AND estado NOT IN ('pendiente', 'nuevo') THEN estado
            ELSE COALESCE(NULLIF(stage, ''), 'nuevo')
          END AS stage,
          COALESCE(call_attempts, 0)::int AS call_attempts,
          (SELECT COUNT(*)::int FROM coldcall_calls WHERE prospect_id = coldcall_prospects.id) AS call_count,
          apollo_data AS raw_data,
          created_at
        FROM coldcall_prospects
        WHERE campaign_id = ${campaignId}
          AND deleted_at IS NULL
          AND (
            nombre ILIKE ${pattern}
            OR empresa ILIKE ${pattern}
            OR email ILIKE ${pattern}
            OR telefono ILIKE ${pattern}
            OR apollo_data::text ILIKE ${pattern}
          )
        ORDER BY created_at ASC, id ASC
        LIMIT ${limit} OFFSET ${offset}
      `,
    ])
    return { leads: normalizeLeadRows(leads), total: Number(countRows[0]?.count ?? 0) }
  }

  const [countRows, leads] = await Promise.all([
    prisma.$queryRaw<{ count: string | number }[]>`
      SELECT COUNT(*)::int AS count FROM coldcall_prospects
      WHERE campaign_id = ${campaignId} AND deleted_at IS NULL
    `,
    prisma.$queryRaw<CampaignLeadListRow[]>`
      SELECT
        id,
        nombre,
        telefono,
        email,
        CASE
          WHEN stage IN (
            'interesado_info_enviada', 'reunion_agendada', 'no_interesado',
            'volver_a_llamar', 'descartado_numero_erroneo'
          ) THEN stage
          WHEN estado IS NOT NULL AND estado NOT IN ('pendiente', 'nuevo') THEN estado
          ELSE COALESCE(NULLIF(stage, ''), 'nuevo')
        END AS stage,
        COALESCE(call_attempts, 0)::int AS call_attempts,
        (SELECT COUNT(*)::int FROM coldcall_calls WHERE prospect_id = coldcall_prospects.id) AS call_count,
        apollo_data AS raw_data,
        created_at
      FROM coldcall_prospects
      WHERE campaign_id = ${campaignId} AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `,
  ])
  return { leads: normalizeLeadRows(leads), total: Number(countRows[0]?.count ?? 0) }
}

function normalizeLeadRows(rows: CampaignLeadListRow[]): CampaignLeadListRow[] {
  return rows.map((r) => ({
    ...r,
    raw_data:
      r.raw_data && typeof r.raw_data === 'object' && !Array.isArray(r.raw_data)
        ? (r.raw_data as Record<string, string>)
        : null,
  }))
}

export async function deleteCampaign(id: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE coldcall_prospects SET deleted_at = NOW(), updated_at = NOW()
    WHERE campaign_id = ${id} AND deleted_at IS NULL
  `
  await prisma.$executeRaw`DELETE FROM coldcall_campaigns WHERE id = ${id}`
}

export interface CampaignLeadDetail {
  id: number
  campaign_id: number
  nombre: string
  first_name: string | null
  last_name: string | null
  telefono: string | null
  email: string | null
  empresa: string | null
  cargo: string | null
  sector: string | null
  zona: string | null
  linkedin: string | null
  web: string | null
  cif: string | null
  direccion: string | null
  stage: string
  estado: string
  call_attempts: number
  notas: string | null
  raw_data: Record<string, string> | null
  created_at: Date
  calls: { id: number; fecha: Date; resultado: string; duracion: number | null; notas: string | null }[]
  activities: { id: number; activity_type: string; content: string | null; outcome: string | null; created_at: Date }[]
}

export async function getCampaignLeadById(
  campaignId: number,
  leadId: number
): Promise<CampaignLeadDetail | null> {
  const rows = await prisma.$queryRaw<
    {
      id: number
      campaign_id: number
      nombre: string
      first_name: string | null
      last_name: string | null
      telefono: string | null
      email: string | null
      empresa: string | null
      cargo: string | null
      sector: string | null
      zona: string | null
      linkedin: string | null
      web: string | null
      cif: string | null
      direccion: string | null
      stage: string
      estado: string
      call_attempts: number
      notas: string | null
      apollo_data: unknown
      created_at: Date
    }[]
  >`
    SELECT
      id, campaign_id, nombre, first_name, last_name, telefono, email,
      empresa, cargo, sector, zona, linkedin, web, cif, direccion,
      CASE
        WHEN stage IN (
          'interesado_info_enviada', 'reunion_agendada', 'no_interesado',
          'volver_a_llamar', 'descartado_numero_erroneo'
        ) THEN stage
        WHEN estado IS NOT NULL AND estado NOT IN ('pendiente', 'nuevo') THEN estado
        ELSE COALESCE(NULLIF(stage, ''), 'nuevo')
      END AS stage,
      estado,
      COALESCE(call_attempts, 0)::int AS call_attempts,
      notas, apollo_data, created_at
    FROM coldcall_prospects
    WHERE id = ${leadId} AND campaign_id = ${campaignId} AND deleted_at IS NULL
    LIMIT 1
  `
  const lead = rows[0]
  if (!lead) return null

  const [calls, activities] = await Promise.all([
    prisma.$queryRaw<
      { id: number; fecha: Date; resultado: string; duracion: number | null; notas: string | null }[]
    >`
      SELECT id, fecha, resultado, duracion, notas
      FROM coldcall_calls WHERE prospect_id = ${leadId}
      ORDER BY fecha DESC
    `,
    prisma.$queryRaw<
      { id: number; activity_type: string; content: string | null; outcome: string | null; created_at: Date }[]
    >`
      SELECT id, activity_type, content, outcome, created_at
      FROM coldcall_activities WHERE prospect_id = ${leadId}
      ORDER BY created_at DESC
    `,
  ])

  const raw =
    lead.apollo_data && typeof lead.apollo_data === 'object' && !Array.isArray(lead.apollo_data)
      ? (lead.apollo_data as Record<string, string>)
      : null

  return { ...lead, raw_data: raw, calls, activities }
}

export async function saveCampaignScript(
  campaignId: number,
  script: { script_markdown_es?: string; script_markdown_ca?: string }
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE coldcall_campaigns SET
      script_markdown_es = ${script.script_markdown_es ?? null},
      script_markdown_ca = ${script.script_markdown_ca ?? null},
      updated_at = NOW()
    WHERE id = ${campaignId}
  `
}

export async function saveCampaignPresentation(
  campaignId: number,
  presentationUrl: string | null
): Promise<void> {
  const normalized = presentationUrl?.trim() || null
  await prisma.$executeRaw`
    UPDATE coldcall_campaigns SET
      presentation_url = ${normalized},
      updated_at = NOW()
    WHERE id = ${campaignId}
  `
}

export async function listCampaignLeadIds(campaignId: number): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM coldcall_prospects
    WHERE campaign_id = ${campaignId} AND deleted_at IS NULL
    ORDER BY created_at ASC, id ASC
  `
  return rows.map((r) => r.id)
}

export async function getLastCalledLeadId(campaignId: number): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ prospect_id: number }[]>`
    SELECT c.prospect_id
    FROM coldcall_calls c
    INNER JOIN coldcall_prospects p ON p.id = c.prospect_id
    WHERE p.campaign_id = ${campaignId} AND p.deleted_at IS NULL
    ORDER BY c.fecha DESC
    LIMIT 1
  `
  return rows[0]?.prospect_id ?? null
}

export async function getCallSession(campaignId: number, leadId?: number) {
  const campaign = await getCampaignById(campaignId)
  if (!campaign) return null

  const leadIds = await listCampaignLeadIds(campaignId)
  if (leadIds.length === 0) {
    return { campaign, leadIds, index: -1, lead: null, prevId: null, nextId: null }
  }

  let resolvedLeadId = leadId
  if (!resolvedLeadId) {
    resolvedLeadId = (await getLastCalledLeadId(campaignId)) ?? leadIds[0]
  }

  let index = leadIds.indexOf(resolvedLeadId)
  if (index < 0) index = 0

  const currentId = leadIds[index]
  const lead = currentId ? await getCampaignLeadById(campaignId, currentId) : null

  return {
    campaign,
    leadIds,
    index,
    lead,
    prevId: index > 0 ? leadIds[index - 1] : null,
    nextId: index < leadIds.length - 1 ? leadIds[index + 1] : null,
  }
}
