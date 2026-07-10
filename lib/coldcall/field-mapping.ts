import { buildDedupeKey } from './apollo-csv'

/** Variables del sistema que el usuario relaciona con columnas del CSV */
export const INTERNAL_FIELDS = [
  { key: 'nombre', label: 'Nombre', required: true },
  { key: 'apellidos', label: 'Apellidos' },
  { key: 'denominacion_social', label: 'Denominación social' },
  { key: 'telefono', label: 'Teléfono', required: true },
  { key: 'cif', label: 'CIF' },
  { key: 'correo', label: 'Correo' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'web', label: 'Web' },
  { key: 'posicion', label: 'Posición / Cargo' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'sector', label: 'Sector' },
  { key: 'do_not_call', label: 'No llamar' },
] as const

export type InternalFieldKey = (typeof INTERNAL_FIELDS)[number]['key']
export type ColumnMapping = Partial<Record<InternalFieldKey, string>>

export interface MappedLeadFields {
  nombre: string
  firstName: string | null
  lastName: string | null
  telefono: string | null
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
  { field: 'nombre', patterns: ['nombre', 'name', 'first name', 'firstname', 'contact name'] },
  { field: 'apellidos', patterns: ['apellidos', 'apellido', 'last name', 'lastname', 'surname'] },
  {
    field: 'denominacion_social',
    patterns: ['denominacion social', 'denominacion', 'razon social', 'empresa', 'company', 'company name'],
  },
  { field: 'telefono', patterns: ['telefono', 'tel', 'phone', 'number', 'mobile', 'movil', 'work phone'] },
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

  for (const header of headers) {
    const n = normHeader(header)
    for (const rule of GUESS_RULES) {
      if (usedFields.has(rule.field)) continue
      if (rule.patterns.some((p) => n === p || n.includes(p))) {
        mapping[rule.field] = header
        usedFields.add(rule.field)
        break
      }
    }
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

  const nombre =
    [nombrePart, apellidosPart].filter(Boolean).join(' ').trim() || 'Sin nombre'

  return {
    nombre,
    firstName: nombrePart || null,
    lastName: apellidosPart || null,
    telefono: cell(row, mapping.telefono) || null,
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
      telefono: cell(row, mapping.telefono) || null,
    }),
  }
}

export function validateMapping(mapping: ColumnMapping): string | null {
  if (!mapping.telefono) return 'Relaciona la variable Teléfono con una columna del CSV'
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
  }
  const out: ColumnMapping = {}
  for (const [k, v] of Object.entries(raw)) {
    const key = (legacy[k] || k) as InternalFieldKey
    if (INTERNAL_FIELDS.some((f) => f.key === key)) out[key] = v
  }
  return out
}
