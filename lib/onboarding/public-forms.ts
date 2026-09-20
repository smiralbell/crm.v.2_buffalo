import { query } from '@/lib/db'

export type OnboardingPublicForm = {
  id: string
  lead_id: number
  title: string
  slug: string
  html: string
  is_active: boolean
  created_at: string
  updated_at: string
  submission_count?: number
}

export type OnboardingFormSubmission = {
  id: string
  form_id: string
  lead_id: number
  payload: Record<string, unknown>
  ip: string | null
  user_agent: string | null
  created_at: string
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export function normalizeFormSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function isValidFormSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 64 && SLUG_RE.test(slug)
}

function mapForm(row: Record<string, unknown>): OnboardingPublicForm {
  return {
    id: String(row.id),
    lead_id: Number(row.lead_id),
    title: String(row.title || 'Formulario'),
    slug: String(row.slug),
    html: String(row.html || ''),
    is_active: Boolean(row.is_active),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
    submission_count:
      row.submission_count != null ? Number(row.submission_count) : undefined,
  }
}

export async function listFormsByLead(leadId: number): Promise<OnboardingPublicForm[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT f.*,
            (SELECT COUNT(*)::int FROM onboarding_form_submissions s WHERE s.form_id = f.id) AS submission_count
       FROM onboarding_public_forms f
      WHERE f.lead_id = $1
      ORDER BY f.created_at DESC`,
    [leadId]
  )
  return rows.map(mapForm)
}

export async function getFormById(formId: string, leadId?: number): Promise<OnboardingPublicForm | null> {
  const { rows } = await query<Record<string, unknown>>(
    leadId != null
      ? `SELECT * FROM onboarding_public_forms WHERE id = $1::uuid AND lead_id = $2 LIMIT 1`
      : `SELECT * FROM onboarding_public_forms WHERE id = $1::uuid LIMIT 1`,
    leadId != null ? [formId, leadId] : [formId]
  )
  return rows[0] ? mapForm(rows[0]) : null
}

export async function getActiveFormBySlug(slug: string): Promise<OnboardingPublicForm | null> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT * FROM onboarding_public_forms
      WHERE slug = $1 AND is_active = TRUE
      LIMIT 1`,
    [slug]
  )
  return rows[0] ? mapForm(rows[0]) : null
}

export async function createForm(input: {
  leadId: number
  title: string
  slug: string
  html: string
}): Promise<OnboardingPublicForm> {
  const slug = normalizeFormSlug(input.slug)
  if (!isValidFormSlug(slug)) {
    throw new Error('Slug inválido. Usa solo minúsculas, números y guiones (2–64 caracteres).')
  }
  if (!input.html.trim()) {
    throw new Error('El HTML del formulario es obligatorio')
  }
  try {
    const { rows } = await query<Record<string, unknown>>(
      `INSERT INTO onboarding_public_forms (lead_id, title, slug, html)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.leadId, input.title.trim() || 'Formulario', slug, input.html]
    )
    return mapForm(rows[0])
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('onboarding_public_forms_slug_unique') || msg.includes('duplicate key')) {
      throw new Error('Ese nombre de link ya está en uso. Elige otro.')
    }
    throw e
  }
}

export async function updateForm(
  formId: string,
  leadId: number,
  patch: Partial<{ title: string; slug: string; html: string; is_active: boolean }>
): Promise<OnboardingPublicForm> {
  const current = await getFormById(formId, leadId)
  if (!current) throw new Error('Formulario no encontrado')

  const title = patch.title !== undefined ? patch.title.trim() || 'Formulario' : current.title
  const html = patch.html !== undefined ? patch.html : current.html
  const isActive = patch.is_active !== undefined ? patch.is_active : current.is_active
  let slug = current.slug
  if (patch.slug !== undefined) {
    slug = normalizeFormSlug(patch.slug)
    if (!isValidFormSlug(slug)) {
      throw new Error('Slug inválido. Usa solo minúsculas, números y guiones (2–64 caracteres).')
    }
  }
  if (!html.trim()) throw new Error('El HTML del formulario es obligatorio')

  try {
    const { rows } = await query<Record<string, unknown>>(
      `UPDATE onboarding_public_forms SET
         title = $1,
         slug = $2,
         html = $3,
         is_active = $4,
         updated_at = NOW()
       WHERE id = $5::uuid AND lead_id = $6
       RETURNING *`,
      [title, slug, html, isActive, formId, leadId]
    )
    if (!rows[0]) throw new Error('Formulario no encontrado')
    return mapForm(rows[0])
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('onboarding_public_forms_slug_unique') || msg.includes('duplicate key')) {
      throw new Error('Ese nombre de link ya está en uso. Elige otro.')
    }
    throw e
  }
}

export async function deleteForm(formId: string, leadId: number): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM onboarding_public_forms WHERE id = $1::uuid AND lead_id = $2`,
    [formId, leadId]
  )
  return rowCount > 0
}

export async function listSubmissions(
  formId: string,
  leadId: number,
  limit = 50
): Promise<OnboardingFormSubmission[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT s.*
       FROM onboarding_form_submissions s
       JOIN onboarding_public_forms f ON f.id = s.form_id
      WHERE s.form_id = $1::uuid AND f.lead_id = $2
      ORDER BY s.created_at DESC
      LIMIT $3`,
    [formId, leadId, Math.min(Math.max(limit, 1), 200)]
  )
  return rows.map((row) => ({
    id: String(row.id),
    form_id: String(row.form_id),
    lead_id: Number(row.lead_id),
    payload:
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {},
    ip: row.ip != null ? String(row.ip) : null,
    user_agent: row.user_agent != null ? String(row.user_agent) : null,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }))
}

export async function saveSubmission(input: {
  formId: string
  leadId: number
  payload: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}): Promise<OnboardingFormSubmission> {
  const { rows } = await query<Record<string, unknown>>(
    `INSERT INTO onboarding_form_submissions (form_id, lead_id, payload, ip, user_agent)
     VALUES ($1::uuid, $2, $3::jsonb, $4, $5)
     RETURNING *`,
    [
      input.formId,
      input.leadId,
      JSON.stringify(input.payload || {}),
      input.ip || null,
      input.userAgent || null,
    ]
  )
  const row = rows[0]
  return {
    id: String(row.id),
    form_id: String(row.form_id),
    lead_id: Number(row.lead_id),
    payload:
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {},
    ip: row.ip != null ? String(row.ip) : null,
    user_agent: row.user_agent != null ? String(row.user_agent) : null,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }
}
