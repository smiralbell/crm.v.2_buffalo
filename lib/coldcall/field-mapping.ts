import { buildDedupeKey } from './apollo-csv'

/** Variables del sistema que el usuario relaciona con columnas del CSV */
export const INTERNAL_FIELDS = [
  { key: 'nombre', label: 'Nombre', required: true },
  { key: 'apellidos', label: 'Apellidos', required: false },
  { key: 'denominacion_social', label: 'Denominación social', required: false },
  { key: 'telefono', label: 'Teléfono (móvil)', required: false },
  { key: 'telefono_empresa', label: 'Teléfono empresa', required: false },
  { key: 'cif', label: 'CIF', required: false },
  { key: 'correo', label: 'Correo', required: false },
  { key: 'direccion', label: 'Dirección', required: false },
  { key: 'web', label: 'Web', required: false },
  { key: 'posicion', label: 'Posición / Cargo', required: false },
  { key: 'linkedin', label: 'LinkedIn', required: false },
  { key: 'ciudad', label: 'Ciudad', required: false },
  { key: 'sector', label: 'Sector', required: false },
  { key: 'do_not_call', label: 'No llamar', required: false },
] as const

export type InternalFieldKey = (typeof INTERNAL_FIELDS)[number]['key']
export type ColumnMapping = Partial<Record<InternalFieldKey, string>>

export interface MappedLeadFields {
  nombre: string
  firstName: string | null
  lastName: string | null
  telefono: string | null
  /** Número de empresa (si el mapping lo trae). El `telefono` final ya prioriza móvil. */
  telefonoEmpresa: string | null
  email: string | null
  empresa: string | null
  cargo: string | null
  sector: string | null
  ciudad: string | null
  linkedin: string | null
  web: string | null
  cif: string | null
  direccion: string | null
  doNotCall: boolean
  dedupeKey: string
}

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const GUESS_RULES: { field: InternalFieldKey; patterns: string[] }[] = [
  { field: 'nombre', patterns: ['nombre', 'first name', 'firstname', 'contact name'] },
  { field: 'apellidos', patterns: ['apellidos', 'apellido', 'last name', 'lastname', 'surname'] },
  {
    field: 'denominacion_social',
    patterns: ['denominacion social', 'denominacion', 'razon social', 'empresa', 'company name', 'company'],
  },
  // Empresa antes que móvil genérico, para que "Company Phone" no se asigne a Teléfono
  {
    field: 'telefono_empresa',
    patterns: [
      'company phone',
      'corporate phone',
      'telefono empresa',
      'tel empresa',
      'office phone',
      'telefono oficina',
      'telefono de empresa',
    ],
  },
  {
    field: 'telefono',
    patterns: [
      'mobile phone',
      'work direct phone',
      'work phone',
      'mobile',
      'movil',
      'celular',
      'telefono',
      'tel',
      'phone',
      'number',
    ],
  },
  { field: 'cif', patterns: ['cif', 'nif', 'tax id', 'vat', 'nif cif'] },
  { field: 'correo', patterns: ['correo', 'email', 'e mail', 'mail'] },
  { field: 'direccion', patterns: ['direccion', 'address', 'domicilio', 'calle'] },
  { field: 'web', patterns: ['web', 'website', 'sitio', 'url'] },
  { field: 'posicion', patterns: ['posicion', 'cargo', 'title', 'puesto', 'job title'] },
  { field: 'linkedin', patterns: ['linkedin'] },
  { field: 'ciudad', patterns: ['ciudad', 'city', 'poblacion', 'localidad'] },
  { field: 'sector', patterns: ['sector', 'industry', 'industria'] },
  { field: 'do_not_call', patterns: ['do not call', 'no llamar', 'dnc'] },
]

export function guessColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const usedFields = new Set<InternalFieldKey>()
  const usedHeaders = new Set<string>()

  // Preferir coincidencias exactas / patrones más largos primero
  const scored: { header: string; field: InternalFieldKey; score: number }[] = []
  for (const header of headers) {
    const n = normHeader(header)
    for (const rule of GUESS_RULES) {
      let best = 0
      for (const p of rule.patterns) {
        if (n === p) best = Math.max(best, 100 + p.length)
        else if (n.includes(p)) best = Math.max(best, 50 + p.length)
      }
      if (best > 0) scored.push({ header, field: rule.field, score: best })
    }
  }
  scored.sort((a, b) => b.score - a.score)

  for (const hit of scored) {
    if (usedFields.has(hit.field) || usedHeaders.has(hit.header)) continue
    mapping[hit.field] = hit.header
    usedFields.add(hit.field)
    usedHeaders.add(hit.header)
  }

  return mapping
}

function cell(row: Record<string, string>, csvColumn?: string): string | undefined {
  if (!csvColumn) return undefined
  const v = row[csvColumn]
  return v?.trim() || undefined
}

function parseBool(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return ['true', '1', 'yes', 'si', 'sí'].includes(s)
}

export function applyColumnMapping(
  row: Record<string, string>,
  mapping: ColumnMapping
): MappedLeadFields {
  const nombrePart = cell(row, mapping.nombre)
  const apellidosPart = cell(row, mapping.apellidos)
  const empresa = cell(row, mapping.denominacion_social) || null
  const email = cell(row, mapping.correo)?.toLowerCase() || null
  const linkedin = cell(row, mapping.linkedin) || null
  const mobile = cell(row, mapping.telefono) || null
  const telefonoEmpresa = cell(row, mapping.telefono_empresa) || null
  // Móvil primero; si no hay, teléfono de empresa (se puede llamar igual)
  const telefono = mobile || telefonoEmpresa

  const nombre =
    [nombrePart, apellidosPart].filter(Boolean).join(' ').trim() || 'Sin nombre'

  return {
    nombre,
    firstName: nombrePart || null,
    lastName: apellidosPart || null,
    telefono,
    telefonoEmpresa,
    email,
    empresa,
    cargo: cell(row, mapping.posicion) || null,
    sector: cell(row, mapping.sector) || null,
    ciudad: cell(row, mapping.ciudad) || null,
    linkedin,
    web: cell(row, mapping.web) || null,
    cif: cell(row, mapping.cif) || null,
    direccion: cell(row, mapping.direccion) || null,
    doNotCall: parseBool(cell(row, mapping.do_not_call)),
    dedupeKey: buildDedupeKey({
      email,
      personLinkedinUrl: linkedin,
      firstName: nombrePart || null,
      lastName: apellidosPart || null,
      nombre,
      empresa,
      telefono,
    }),
  }
}

export function validateMapping(mapping: ColumnMapping): string | null {
  if (!mapping.telefono && !mapping.telefono_empresa) {
    return 'Relaciona Teléfono (móvil) o Teléfono empresa con una columna del CSV'
  }
  if (!mapping.nombre && !mapping.apellidos) {
    return 'Relaciona al menos Nombre o Apellidos con una columna del CSV'
  }
  return null
}

/** Migra mapeos guardados con claves antiguas */
export function normalizeStoredMapping(raw: Record<string, string> | null): ColumnMapping {
  if (!raw) return {}
  const legacy: Record<string, InternalFieldKey> = {
    email: 'correo',
    empresa: 'denominacion_social',
    cargo: 'posicion',
    first_name: 'nombre',
    last_name: 'apellidos',
    company_phone: 'telefono_empresa',
  }
  const out: ColumnMapping = {}
  for (const [k, v] of Object.entries(raw)) {
    const key = (legacy[k] || k) as InternalFieldKey
    if (INTERNAL_FIELDS.some((f) => f.key === key)) out[key] = v
  }
  return out
}
