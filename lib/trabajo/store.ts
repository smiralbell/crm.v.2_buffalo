import { prisma } from '@/lib/prisma'
import type { WorkEntry, WorkItemInput, WorkReport } from '@/lib/trabajo/types'

let schemaReady: Promise<void> | null = null

/** Crea las tablas del Trabajo diario la primera vez que se usan. */
export function ensureWorkLogSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS crm_work_reports (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id INTEGER NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
          raw_text TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'manual',
          created_by_name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS crm_work_entries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id INTEGER NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
          work_date DATE NOT NULL,
          title TEXT NOT NULL,
          detail TEXT,
          project_id UUID REFERENCES proyectos(id) ON DELETE SET NULL,
          hours DOUBLE PRECISION,
          report_id UUID REFERENCES crm_work_reports(id) ON DELETE SET NULL,
          source TEXT NOT NULL DEFAULT 'manual',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_crm_work_entries_user_date ON crm_work_entries(user_id, work_date)`
      )
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_crm_work_entries_date ON crm_work_entries(work_date)`)
    })().catch((e) => {
      schemaReady = null
      throw e
    })
  }
  return schemaReady
}

type Row = Record<string, unknown>

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ''))
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10))

function mapEntry(r: Row): WorkEntry {
  return {
    id: String(r.id),
    user_id: Number(r.user_id),
    user_name: String(r.user_name ?? ''),
    work_date: day(r.work_date),
    title: String(r.title),
    detail: (r.detail as string | null) ?? null,
    project_id: (r.project_id as string | null) ?? null,
    project_name: (r.project_name as string | null) ?? null,
    hours: r.hours == null ? null : Number(r.hours),
    report_id: (r.report_id as string | null) ?? null,
    source: r.source === 'whatsapp' ? 'whatsapp' : 'manual',
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  }
}

function mapReport(r: Row): WorkReport {
  return {
    id: String(r.id),
    user_id: Number(r.user_id),
    raw_text: String(r.raw_text ?? ''),
    source: r.source === 'whatsapp' ? 'whatsapp' : 'manual',
    created_by_name: (r.created_by_name as string | null) ?? null,
    created_at: iso(r.created_at),
  }
}

const ENTRY_SELECT = `
  SELECT e.id::text AS id, e.user_id, u.name AS user_name, e.work_date, e.title, e.detail,
         e.project_id::text AS project_id, p.name AS project_name, e.hours,
         e.report_id::text AS report_id, e.source, e.created_at, e.updated_at
  FROM crm_work_entries e
  JOIN crm_users u ON u.id = e.user_id
  LEFT JOIN proyectos p ON p.id = e.project_id
`

/** Trabajo entre dos fechas (incluidas). userIds null = de todos. */
export async function listWorkEntries(params: {
  userIds: number[] | null
  from: string
  to: string
  projectId?: string | null
}): Promise<WorkEntry[]> {
  await ensureWorkLogSchema()
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `${ENTRY_SELECT}
     WHERE e.work_date BETWEEN $1::date AND $2::date
       AND ($3::int[] IS NULL OR e.user_id = ANY($3::int[]))
       AND ($4::uuid IS NULL OR e.project_id = $4::uuid)
     ORDER BY e.work_date DESC, e.created_at ASC
     LIMIT 5000`,
    params.from,
    params.to,
    params.userIds,
    params.projectId ?? null
  )
  return rows.map(mapEntry)
}

export async function getWorkEntry(id: string): Promise<WorkEntry | null> {
  await ensureWorkLogSchema()
  const rows = await prisma.$queryRawUnsafe<Row[]>(`${ENTRY_SELECT} WHERE e.id = $1::uuid`, id)
  return rows[0] ? mapEntry(rows[0]) : null
}

export async function listWorkReports(ids: string[]): Promise<WorkReport[]> {
  if (!ids.length) return []
  await ensureWorkLogSchema()
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id::text AS id, user_id, raw_text, source, created_by_name, created_at
    FROM crm_work_reports WHERE id = ANY(${ids}::uuid[])
  `
  return rows.map(mapReport)
}

/**
 * Guarda de una vez lo que alguien contó: el mensaje original (si lo hay) y
 * cada trabajo separado. Todo o nada.
 */
export async function createWorkLog(input: {
  userId: number
  items: WorkItemInput[]
  rawText?: string | null
  source: 'manual' | 'whatsapp'
  createdByName: string
}): Promise<{ reportId: string | null; entries: WorkEntry[] }> {
  await ensureWorkLogSchema()
  const ids = await prisma.$transaction(async (tx) => {
    let reportId: string | null = null
    const raw = (input.rawText ?? '').trim()
    if (raw) {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO crm_work_reports (user_id, raw_text, source, created_by_name)
        VALUES (${input.userId}, ${raw.slice(0, 60_000)}, ${input.source}, ${input.createdByName})
        RETURNING id::text AS id
      `
      reportId = rows[0].id
    }
    const created: string[] = []
    for (const it of input.items) {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO crm_work_entries (user_id, work_date, title, detail, project_id, hours, report_id, source)
        VALUES (${input.userId}, ${it.work_date}::date, ${it.title}, ${it.detail}, ${it.project_id}::uuid,
                ${it.hours}, ${reportId}::uuid, ${input.source})
        RETURNING id::text AS id
      `
      created.push(rows[0].id)
    }
    return { reportId, created }
  })
  const entries = await prisma.$queryRawUnsafe<Row[]>(
    `${ENTRY_SELECT} WHERE e.id = ANY($1::uuid[]) ORDER BY e.work_date DESC, e.created_at ASC`,
    ids.created
  )
  return { reportId: ids.reportId, entries: entries.map(mapEntry) }
}

export async function updateWorkEntry(
  current: WorkEntry,
  patch: Partial<Pick<WorkItemInput, 'work_date' | 'title' | 'detail' | 'project_id' | 'hours'>>
): Promise<WorkEntry | null> {
  await prisma.$executeRaw`
    UPDATE crm_work_entries SET
      work_date = ${patch.work_date ?? current.work_date}::date,
      title = ${patch.title ?? current.title},
      detail = ${patch.detail !== undefined ? patch.detail : current.detail},
      project_id = ${patch.project_id !== undefined ? patch.project_id : current.project_id}::uuid,
      hours = ${patch.hours !== undefined ? patch.hours : current.hours},
      updated_at = NOW()
    WHERE id = ${current.id}::uuid
  `
  return getWorkEntry(current.id)
}

export async function deleteWorkEntry(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM crm_work_entries WHERE id = ${id}::uuid`
}
