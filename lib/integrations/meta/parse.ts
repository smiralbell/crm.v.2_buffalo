export type MetaLeadgenChange = {
  leadgen_id: string
  page_id: string
  form_id: string | null
  ad_id: string | null
  adgroup_id: string | null
  created_time: string | null
}

export type MetaFieldAnswer = { name: string; values: string[] }

export type ParsedMetaLead = {
  leadgen_id: string
  created_time: string | null
  ad_id: string | null
  ad_name: string | null
  adset_id: string | null
  adset_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  form_id: string | null
  platform: string | null
  nombre: string | null
  email: string | null
  telefono: string | null
  empresa: string | null
  answers: MetaFieldAnswer[]
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

function firstField(answers: MetaFieldAnswer[], names: string[]): string | null {
  const set = new Set(names.map((n) => n.toLowerCase()))
  for (const a of answers) {
    if (!set.has(a.name.toLowerCase())) continue
    const v = a.values.find((x) => x.trim())
    if (v) return v.trim()
  }
  return null
}

export function parseMetaFieldData(fieldData: unknown): MetaFieldAnswer[] {
  if (!Array.isArray(fieldData)) return []
  const out: MetaFieldAnswer[] = []
  for (const row of fieldData) {
    const rec = asRecord(row)
    if (!rec) continue
    const name = str(rec.name)
    if (!name) continue
    const raw = rec.values
    const values = Array.isArray(raw)
      ? raw.map((v) => String(v ?? '').trim()).filter(Boolean)
      : str(raw)
        ? [str(raw)!]
        : []
    out.push({ name, values })
  }
  return out
}

export function parseGraphLead(leadgenId: string, json: unknown): ParsedMetaLead {
  const rec = asRecord(json) || {}
  const answers = parseMetaFieldData(rec.field_data)
  const first = firstField(answers, ['first_name', 'nombre'])
  const last = firstField(answers, ['last_name', 'apellido', 'apellidos'])
  const full =
    firstField(answers, ['full_name', 'fullname', 'nombre_completo', 'name', 'nombre_y_apellidos']) ||
    [first, last].filter(Boolean).join(' ') ||
    null
  const email = firstField(answers, ['email', 'e-mail', 'work_email', 'correo', 'correo_electronico'])
  const telefono = firstField(answers, [
    'phone_number',
    'phone',
    'telefono',
    'teléfono',
    'mobile',
    'movil',
    'móvil',
  ])
  const empresa = firstField(answers, ['company_name', 'company', 'empresa', 'business_name'])

  return {
    leadgen_id: str(rec.id) || leadgenId,
    created_time: str(rec.created_time),
    ad_id: str(rec.ad_id),
    ad_name: str(rec.ad_name),
    adset_id: str(rec.adset_id),
    adset_name: str(rec.adset_name),
    campaign_id: str(rec.campaign_id),
    campaign_name: str(rec.campaign_name),
    form_id: str(rec.form_id),
    platform: str(rec.platform),
    nombre: full,
    email: email ? email.toLowerCase() : null,
    telefono,
    empresa,
    answers,
  }
}

export function extractLeadgenEvents(body: unknown): MetaLeadgenChange[] {
  const rec = asRecord(body)
  if (!rec) return []
  const object = str(rec.object)?.toLowerCase()
  if (object && object !== 'page') return []

  const seen = new Set<string>()
  const out: MetaLeadgenChange[] = []
  const entries = Array.isArray(rec.entry) ? rec.entry : []

  for (const entry of entries) {
    const e = asRecord(entry)
    if (!e) continue
    const entryPage = str(e.id)
    const changes = Array.isArray(e.changes) ? e.changes : []
    for (const change of changes) {
      const c = asRecord(change)
      if (!c) continue
      if (str(c.field) !== 'leadgen') continue
      const value = asRecord(c.value) || {}
      const leadgen_id = str(value.leadgen_id)
      if (!leadgen_id || seen.has(leadgen_id)) continue
      seen.add(leadgen_id)
      out.push({
        leadgen_id,
        page_id: str(value.page_id) || entryPage || '',
        form_id: str(value.form_id),
        ad_id: str(value.ad_id),
        adgroup_id: str(value.adgroup_id),
        created_time: str(value.created_time),
      })
    }
  }
  return out
}

export type MetaEventAction = 'insert' | 'skip_processed' | 'retry'

export function nextMetaEventAction(
  existing: { status: string } | null
): MetaEventAction {
  if (!existing) return 'insert'
  if (existing.status === 'processed' || existing.status === 'ignored') return 'skip_processed'
  return 'retry'
}

export function formatMetaAnswers(answers: MetaFieldAnswer[]): string {
  return answers
    .map((a) => `${a.name}: ${a.values.join(', ')}`)
    .filter(Boolean)
    .join('\n')
}
