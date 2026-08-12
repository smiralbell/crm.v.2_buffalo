/**
 * Persistencia del cuaderno de reuniones (SQL directo).
 */

import { query } from '@/lib/db'
import type {
  NoteType,
  ProjectNote,
  ProjectResearch,
  ProjectResearchData,
} from '@/lib/onboarding/notes/types'

export type {
  NoteType,
  ProjectNote,
  ProjectResearch,
  ProjectResearchData,
} from '@/lib/onboarding/notes/types'

type NoteRow = {
  id: string
  lead_id: number | string
  note_date: Date | string
  type: string
  title: string
  body: string
  created_by: string | null
  created_at: Date | string
  updated_at: Date | string
}

function isoDate(v: Date | string): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

function iso(v: Date | string): string {
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

function mapNote(r: NoteRow): ProjectNote {
  const t = r.type === 'libre' || r.type === 'definicion' ? r.type : 'reunion'
  return {
    id: r.id,
    lead_id: Number(r.lead_id),
    note_date: isoDate(r.note_date),
    type: t,
    title: r.title || '',
    body: r.body || '',
    created_by: r.created_by,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  }
}

export async function listNotes(leadId: number): Promise<ProjectNote[]> {
  const { rows } = await query<NoteRow>(
    `SELECT id, lead_id, note_date, type, title, body, created_by, created_at, updated_at
     FROM project_notes
     WHERE lead_id = $1
     ORDER BY note_date DESC, updated_at DESC`,
    [leadId]
  )
  return rows.map(mapNote)
}

export async function getNote(id: string): Promise<ProjectNote | null> {
  const { rows } = await query<NoteRow>(
    `SELECT id, lead_id, note_date, type, title, body, created_by, created_at, updated_at
     FROM project_notes WHERE id = $1 LIMIT 1`,
    [id]
  )
  return rows[0] ? mapNote(rows[0]) : null
}

export async function createNote(input: {
  lead_id: number
  note_date?: string
  type?: NoteType
  title?: string
  body?: string
  created_by?: string | null
}): Promise<ProjectNote> {
  const { rows } = await query<NoteRow>(
    `INSERT INTO project_notes (lead_id, note_date, type, title, body, created_by)
     VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6)
     RETURNING id, lead_id, note_date, type, title, body, created_by, created_at, updated_at`,
    [
      input.lead_id,
      input.note_date || null,
      input.type || 'reunion',
      input.title || '',
      input.body || '',
      input.created_by ?? null,
    ]
  )
  return mapNote(rows[0])
}

export async function updateNote(
  id: string,
  patch: Partial<{
    note_date: string
    type: NoteType
    title: string
    body: string
  }>
): Promise<ProjectNote | null> {
  const existing = await getNote(id)
  if (!existing) return null
  const next = {
    note_date: patch.note_date ?? existing.note_date,
    type: patch.type ?? existing.type,
    title: patch.title ?? existing.title,
    body: patch.body ?? existing.body,
  }
  const { rows } = await query<NoteRow>(
    `UPDATE project_notes
     SET note_date = $2::date,
         type = $3,
         title = $4,
         body = $5,
         updated_at = now()
     WHERE id = $1
     RETURNING id, lead_id, note_date, type, title, body, created_by, created_at, updated_at`,
    [id, next.note_date, next.type, next.title, next.body]
  )
  return rows[0] ? mapNote(rows[0]) : null
}

export async function deleteNote(id: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM project_notes WHERE id = $1`, [id])
  return rowCount > 0
}

type ResearchRow = {
  lead_id: number | string
  url: string
  data: ProjectResearchData | string
  created_at: Date | string
  updated_at: Date | string
}

function mapResearch(r: ResearchRow): ProjectResearch {
  const data =
    typeof r.data === 'string'
      ? (JSON.parse(r.data) as ProjectResearchData)
      : r.data
  return {
    lead_id: Number(r.lead_id),
    url: r.url,
    data,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  }
}

export async function getResearch(leadId: number): Promise<ProjectResearch | null> {
  const { rows } = await query<ResearchRow>(
    `SELECT lead_id, url, data, created_at, updated_at
     FROM project_research WHERE lead_id = $1 LIMIT 1`,
    [leadId]
  )
  return rows[0] ? mapResearch(rows[0]) : null
}

export async function saveResearch(
  leadId: number,
  url: string,
  data: ProjectResearchData
): Promise<ProjectResearch> {
  const { rows } = await query<ResearchRow>(
    `INSERT INTO project_research (lead_id, url, data)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (lead_id) DO UPDATE
       SET url = EXCLUDED.url,
           data = EXCLUDED.data,
           updated_at = now()
     RETURNING lead_id, url, data, created_at, updated_at`,
    [leadId, url, JSON.stringify(data)]
  )
  return mapResearch(rows[0])
}

export async function deleteResearch(leadId: number): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM project_research WHERE lead_id = $1`, [
    leadId,
  ])
  return rowCount > 0
}

/** Texto plano de todas las notas (para contexto de propuesta / copiloto). */
export function notesToContextBlock(notes: ProjectNote[]): string {
  const usable = notes.filter((n) => n.body.trim())
  if (!usable.length) return ''
  return (
    '## Notas del cuaderno\n' +
    usable
      .map(
        (n) =>
          `### ${n.title || 'Sin título'} (${n.note_date} · ${n.type})\n${n.body.trim()}`
      )
      .join('\n\n')
  )
}

export function researchToContextBlock(research: ProjectResearch | null): string {
  if (!research?.data) return ''
  const d = research.data
  const lines = [
    `## Investigación web (${d.origen || 'scraping'})`,
    `Empresa: ${d.nombre || ''}`,
    `URL: ${research.url}`,
    d.sector ? `Sector: ${d.sector}` : null,
    d.hace ? `Qué hacen: ${d.hace}` : null,
    d.servicios?.length ? `Servicios: ${d.servicios.join(', ')}` : null,
    d.senales?.length ? `Señales: ${d.senales.join(' · ')}` : null,
    d.ganchos?.length
      ? `Ganchos reunión:\n${d.ganchos.map((g) => `- ${g}`).join('\n')}`
      : null,
  ].filter(Boolean)
  return lines.join('\n')
}
