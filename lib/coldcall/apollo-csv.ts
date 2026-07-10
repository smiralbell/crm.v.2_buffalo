function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildDedupeKey(input: {
  email?: string | null
  personLinkedinUrl?: string | null
  firstName?: string | null
  lastName?: string | null
  nombre?: string | null
  companyName?: string | null
  empresa?: string | null
  telefono?: string | null
}): string {
  const email = input.email?.trim().toLowerCase()
  if (email) return `email:${email}`

  const linkedin = input.personLinkedinUrl?.trim().toLowerCase()
  if (linkedin) return `linkedin:${linkedin}`

  const phone = input.telefono?.replace(/\D/g, '')
  if (phone) return `phone:${phone}`

  const name = (input.firstName && input.lastName
    ? `${input.firstName} ${input.lastName}`
    : input.nombre || ''
  ).trim()
  const company = (input.companyName || input.empresa || '').trim()
  return `name:${slugify(name)}@${slugify(company || 'sin-empresa')}`
}

export function pickPhone(row: {
  mobilePhone?: string | null
  workPhone?: string | null
  corporatePhone?: string | null
  homePhone?: string | null
  otherPhone?: string | null
}): string | null {
  for (const p of [
    row.mobilePhone,
    row.workPhone,
    row.corporatePhone,
    row.homePhone,
    row.otherPhone,
  ]) {
    const v = p?.trim()
    if (v) return v
  }
  return null
}

function cell(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()]
    if (v?.trim()) return v.trim()
  }
  return undefined
}

function parseBool(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return ['true', '1', 'yes', 'si', 'sí'].includes(s)
}

function parseIntSafe(v: string | undefined): number | null {
  if (!v) return null
  const n = parseInt(v.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

const MAPPED_KEYS = new Set([
  'first name', 'firstname', 'last name', 'lastname', 'title', 'company', 'company name',
  'email', 'primary email', 'email status', 'work direct phone', 'work phone', 'home phone',
  'mobile phone', 'corporate phone', 'other phone', 'do not call', '# employees', 'employees',
  'industry', 'keywords', 'person linkedin url', 'linkedin url', 'company linkedin url',
  'website', 'city', 'state', 'country', 'apollo contact id', 'contact id', 'apollo account id',
  'account id', 'nombre', 'name', 'empresa', 'telefono', 'phone', 'sector', 'zona', 'cargo',
])

export function parseApolloCsvRow(row: Record<string, string>) {
  const firstName = cell(row, 'First Name', 'FirstName', 'first_name', 'nombre') || ''
  const lastName = cell(row, 'Last Name', 'LastName', 'last_name') || ''
  const companyName = cell(row, 'Company', 'Company Name', 'company', 'empresa') || null
  const email = cell(row, 'Email', 'Primary Email', 'email', 'correo') || null
  const personLinkedinUrl =
    cell(row, 'Person Linkedin Url', 'LinkedIn Url', 'linkedin', 'Person LinkedIn URL') || null

  const nombre =
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    cell(row, 'Name', 'Nombre') ||
    'Sin nombre'

  const workPhone = cell(row, 'Work Direct Phone', 'Work Phone', 'work_phone') || null
  const mobilePhone = cell(row, 'Mobile Phone', 'mobile_phone') || null
  const corporatePhone = cell(row, 'Corporate Phone') || null
  const homePhone = cell(row, 'Home Phone') || null
  const otherPhone = cell(row, 'Other Phone') || null
  const telefono =
    pickPhone({ workPhone, mobilePhone, corporatePhone, homePhone, otherPhone }) ||
    cell(row, 'telefono', 'teléfono', 'phone', 'Phone') ||
    null

  const doNotCall = parseBool(cell(row, 'Do Not Call', 'do_not_call'))
  const employeeCount = parseIntSafe(cell(row, '# Employees', 'Employees', 'employee_count'))

  const apolloData: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) {
    if (!v?.trim()) continue
    const norm = k.trim().toLowerCase()
    if (!MAPPED_KEYS.has(norm) && !norm.startsWith('apollo')) {
      apolloData[k] = v.trim()
    }
  }

  return {
    firstName,
    lastName,
    title: cell(row, 'Title', 'title', 'cargo') || null,
    companyName,
    email,
    emailStatus: cell(row, 'Email Status', 'email_status') || null,
    workPhone,
    homePhone,
    mobilePhone,
    corporatePhone,
    otherPhone,
    doNotCall,
    employeeCount,
    industry: cell(row, 'Industry', 'industry', 'sector') || null,
    keywords: cell(row, 'Keywords', 'keywords') || null,
    personLinkedinUrl,
    companyLinkedinUrl: cell(row, 'Company Linkedin Url', 'Company LinkedIn URL') || null,
    website: cell(row, 'Website', 'website', 'web') || null,
    city: cell(row, 'City', 'city', 'ciudad', 'zona') || null,
    state: cell(row, 'State', 'state') || null,
    country: cell(row, 'Country', 'country') || null,
    apolloContactId: cell(row, 'Apollo Contact Id', 'Contact Id', 'apollo_contact_id') || null,
    apolloAccountId: cell(row, 'Apollo Account Id', 'Account Id') || null,
    apolloData,
    dedupeKey: buildDedupeKey({ email, personLinkedinUrl, firstName, lastName, companyName }),
    nombre,
    telefono,
  }
}

export function parseCsvText(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ','
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ''))

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep).map((p) => p.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = parts[idx] || ''
    })
    if (Object.values(row).some((v) => v.trim())) rows.push(row)
  }
  return rows
}
