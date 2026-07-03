/** Claves fijas enviadas a Retell como retell_llm_dynamic_variables */
export const RETELL_OUTBOUND_VAR_KEYS = [
  'nombre',
  'apellidos',
  'telefono',
  'email',
  'notas',
] as const

export type RetellOutboundVarKey = (typeof RETELL_OUTBOUND_VAR_KEYS)[number]

export function retellVarPlaceholder(key: RetellOutboundVarKey): string {
  return `{{${key}}}`
}

export const RETELL_DYNAMIC_VARS_HELP =
  'Variables del formulario outbound. Retell las sustituye al llamar desde el formulario público ({{nombre}}, {{telefono}}, etc.).'

export interface OutboundFormFieldConfig {
  key: RetellOutboundVarKey
  label: string
  enabled: boolean
  required: boolean
  placeholder?: string
}

export const DEFAULT_OUTBOUND_FORM_FIELDS: OutboundFormFieldConfig[] = [
  { key: 'nombre', label: 'Nombre', enabled: true, required: true, placeholder: 'María' },
  {
    key: 'apellidos',
    label: 'Apellidos',
    enabled: true,
    required: false,
    placeholder: 'García López',
  },
  {
    key: 'telefono',
    label: 'Teléfono',
    enabled: true,
    required: true,
    placeholder: '+34612345678',
  },
  {
    key: 'email',
    label: 'Email',
    enabled: true,
    required: false,
    placeholder: 'maria@email.com',
  },
  {
    key: 'notas',
    label: 'Notas / contexto',
    enabled: true,
    required: false,
    placeholder: 'Información adicional para el agente',
  },
]

export type RetellOutboundVariables = Partial<Record<RetellOutboundVarKey, string>>

export function normalizeOutboundFormConfig(raw: unknown): OutboundFormFieldConfig[] {
  if (!Array.isArray(raw)) return DEFAULT_OUTBOUND_FORM_FIELDS

  const byKey = new Map<RetellOutboundVarKey, OutboundFormFieldConfig>()
  for (const def of DEFAULT_OUTBOUND_FORM_FIELDS) {
    byKey.set(def.key, { ...def })
  }

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const key = row.key
    if (typeof key !== 'string' || !RETELL_OUTBOUND_VAR_KEYS.includes(key as RetellOutboundVarKey)) {
      continue
    }
    const def = byKey.get(key as RetellOutboundVarKey)!
    byKey.set(key as RetellOutboundVarKey, {
      key: key as RetellOutboundVarKey,
      label: typeof row.label === 'string' && row.label.trim() ? row.label.trim() : def.label,
      enabled: typeof row.enabled === 'boolean' ? row.enabled : def.enabled,
      required: typeof row.required === 'boolean' ? row.required : def.required,
      placeholder:
        typeof row.placeholder === 'string' ? row.placeholder : def.placeholder,
    })
  }

  return RETELL_OUTBOUND_VAR_KEYS.map((k) => byKey.get(k)!)
}

export function buildRetellVariablesFromForm(
  fields: OutboundFormFieldConfig[],
  values: Record<string, string>
): RetellOutboundVariables {
  const out: RetellOutboundVariables = {}
  for (const field of fields) {
    if (!field.enabled) continue
    const raw = values[field.key]
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    out[field.key] = trimmed
  }
  return out
}

export function validateOutboundForm(
  fields: OutboundFormFieldConfig[],
  values: Record<string, string>
): string | null {
  for (const field of fields) {
    if (!field.enabled || !field.required) continue
    const v = values[field.key]?.trim()
    if (!v) return `El campo «${field.label}» es obligatorio`
  }

  const telefonoField = fields.find((f) => f.key === 'telefono' && f.enabled)
  if (telefonoField?.required) {
    const tel = values.telefono?.trim()
    if (!tel) return 'El teléfono es obligatorio'
  }

  return null
}
