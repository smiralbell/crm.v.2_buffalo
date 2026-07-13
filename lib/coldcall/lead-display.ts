import {
  INTERNAL_FIELDS,
  type ColumnMapping,
  type InternalFieldKey,
} from '@/lib/coldcall/field-mapping'
import { stageLabel } from '@/lib/coldcall/lead-table'
import { formatPhoneForDisplay } from '@/lib/coldcall/whatsapp'

export interface LeadFieldRow {
  label: string
  value: string
}

export interface LeadDisplayInput {
  nombre: string
  telefono?: string | null
  email?: string | null
  empresa?: string | null
  cargo?: string | null
  sector?: string | null
  zona?: string | null
  linkedin?: string | null
  web?: string | null
  cif?: string | null
  direccion?: string | null
  stage?: string
  call_attempts?: number
  notas?: string | null
  raw_data?: Record<string, string>
  callsCount?: number
}

const DB_FIELD_GETTERS: Partial<Record<InternalFieldKey, (lead: LeadDisplayInput) => string | null>> = {
  nombre: (l) => l.nombre,
  apellidos: () => null,
  telefono: (l) => l.telefono ?? null,
  correo: (l) => l.email ?? null,
  denominacion_social: (l) => l.empresa ?? null,
  posicion: (l) => l.cargo ?? null,
  sector: (l) => l.sector ?? null,
  ciudad: (l) => l.zona ?? null,
  linkedin: (l) => l.linkedin ?? null,
  web: (l) => l.web ?? null,
  cif: (l) => l.cif ?? null,
  direccion: (l) => l.direccion ?? null,
}

const FALLBACK_PRIMARY: { label: string; get: (l: LeadDisplayInput) => string | null }[] = [
  { label: 'Nombre', get: (l) => l.nombre },
  { label: 'Teléfono', get: (l) => l.telefono ?? null },
  { label: 'Correo', get: (l) => l.email ?? null },
  { label: 'Empresa', get: (l) => l.empresa ?? null },
  { label: 'Cargo', get: (l) => l.cargo ?? null },
  { label: 'Sector', get: (l) => l.sector ?? null },
  { label: 'Ciudad', get: (l) => l.zona ?? null },
  { label: 'CIF', get: (l) => l.cif ?? null },
  { label: 'Dirección', get: (l) => l.direccion ?? null },
  { label: 'LinkedIn', get: (l) => l.linkedin ?? null },
  { label: 'Web', get: (l) => l.web ?? null },
]

export function splitLeadDisplayFields(
  lead: LeadDisplayInput,
  columnMapping?: ColumnMapping | null,
  options?: { includeMeta?: boolean }
): { primary: LeadFieldRow[]; extra: LeadFieldRow[] } {
  const mapping = columnMapping || {}
  const hasMapping = Object.values(mapping).some(Boolean)
  const primary: LeadFieldRow[] = []
  const usedCsvCols = new Set<string>()
  const usedValues = new Set<string>()

  const pushPrimary = (label: string, value: string | null | undefined) => {
    let v = value?.trim()
    if (!v || usedValues.has(v)) return
    if (/tel[eé]fono|phone|movil|móvil|mobile/i.test(label)) {
      v = formatPhoneForDisplay(v) || v
    }
    usedValues.add(v)
    primary.push({ label, value: v })
  }

  if (hasMapping) {
    for (const field of INTERNAL_FIELDS) {
      if (field.key === 'do_not_call') continue
      const csvCol = mapping[field.key]
      let value: string | null = null
      if (csvCol) {
        usedCsvCols.add(csvCol)
        value = lead.raw_data?.[csvCol]?.trim() || DB_FIELD_GETTERS[field.key]?.(lead)?.trim() || null
      } else {
        value = DB_FIELD_GETTERS[field.key]?.(lead)?.trim() || null
      }
      pushPrimary(field.label, value)
    }
  } else {
    for (const item of FALLBACK_PRIMARY) {
      pushPrimary(item.label, item.get(lead))
    }
  }

  if (options?.includeMeta !== false) {
    if (lead.stage) pushPrimary('Estado', stageLabel(lead.stage))
    if (lead.callsCount != null) pushPrimary('Llamadas', String(lead.callsCount))
    if (lead.call_attempts != null) {
      pushPrimary('Intentos sin respuesta', String(lead.call_attempts))
    }
  }

  const extra: LeadFieldRow[] = []
  const extraValues = new Set<string>()

  for (const [key, raw] of Object.entries(lead.raw_data || {})) {
    const v = raw?.trim()
    if (!v) continue
    if (usedCsvCols.has(key) && usedValues.has(v)) continue
    if (usedValues.has(v) && hasMapping) continue
    if (extraValues.has(`${key}:${v}`)) continue
    extraValues.add(`${key}:${v}`)
    const displayValue = /tel[eé]fono|phone|movil|móvil|mobile/i.test(key)
      ? formatPhoneForDisplay(v) || v
      : v
    extra.push({ label: key, value: displayValue })
  }

  if (lead.notas?.trim()) {
    extra.push({ label: 'Notas internas', value: lead.notas.trim() })
  }

  extra.sort((a, b) => a.label.localeCompare(b.label, 'es'))

  return { primary, extra }
}

export function allLeadDisplayFields(
  lead: LeadDisplayInput,
  columnMapping?: ColumnMapping | null,
  options?: { includeMeta?: boolean }
): LeadFieldRow[] {
  const { primary, extra } = splitLeadDisplayFields(lead, columnMapping, options)
  return [...primary, ...extra]
}
