/**
 * Convención de conceptos bancarios Buffalo IA
 *
 * Formato recomendado en transferencias (mayúsculas, sin tildes):
 * - NOMINA {MES} {APELLIDO}     → nóminas
 * - DEV {NOMBRE} {PROYECTO-ID}  → pagos a developers por proyecto
 * - MKT {CANAL} {DETALLE}       → marketing (EMAIL, ADS, SEO…)
 * - PLT {SERVICIO}              → plataformas/SaaS por transferencia
 * - GTO {CONCEPTO}              → otros gastos operativos
 * - FAC {CLIENTE} {NUM-FACTURA} → cobros (opcional en ingresos)
 *
 * Los cargos de tarjeta (TWILIO, CURSOR…) se clasifican automáticamente.
 */

export type PaymentBucket =
  | 'platform'
  | 'payroll'
  | 'marketing'
  | 'developer'
  | 'professional'
  | 'tax'
  | 'other'

export const PAYMENT_BUCKET_LABELS: Record<PaymentBucket, string> = {
  platform: 'Plataformas y SaaS',
  payroll: 'Nóminas',
  marketing: 'Marketing',
  developer: 'Developers / proyectos',
  professional: 'Servicios profesionales',
  tax: 'Impuestos y tasas',
  other: 'Otros gastos',
}

export interface ParsedPaymentConcept {
  raw: string
  bucket: PaymentBucket
  bucket_label: string
  display_label: string
  developer_name?: string
  project_id?: string
  payroll_label?: string
  marketing_channel?: string
  platform_name?: string
  grouping_key: string
  detection_source: 'concept' | 'pattern' | 'none'
}

const PLATFORM_PATTERNS: Array<{ key: string; label: string; patterns: RegExp[] }> = [
  { key: 'twilio', label: 'Twilio', patterns: [/twilio/i, /^plt\s+twilio/i] },
  { key: 'retell', label: 'Retell AI', patterns: [/retell/i, /^plt\s+retell/i] },
  { key: 'openai', label: 'OpenAI', patterns: [/openai|chatgpt/i, /^plt\s+openai/i] },
  { key: 'anthropic', label: 'Anthropic / Claude', patterns: [/anthropic|claude/i] },
  { key: 'elevenlabs', label: 'ElevenLabs', patterns: [/elevenlabs/i] },
  { key: 'cursor', label: 'Cursor', patterns: [/cursor/i, /^plt\s+cursor/i] },
  { key: 'contabo', label: 'Contabo', patterns: [/contabo/i, /^plt\s+contabo/i] },
  { key: 'easypanel', label: 'EasyPanel', patterns: [/easypanel|lemsqzy/i] },
  { key: 'raiola', label: 'Raiola Networks', patterns: [/raiola/i] },
  { key: 'fireflies', label: 'Fireflies.ai', patterns: [/fireflies/i] },
  { key: 'nexiaia', label: 'NexiaIA', patterns: [/nexiaia/i, /^plt\s+nexia/i] },
  { key: 'manus', label: 'Manus AI', patterns: [/manus\s*ai/i] },
]

export const PAYMENT_CONCEPT_EXAMPLES = [
  { category: 'Nóminas', format: 'NOMINA JUNIO MIRALBELL', example: 'NOMINA JUNIO SERGI' },
  { category: 'Developers', format: 'DEV {nombre} {proyecto-id}', example: 'DEV LAURA BUF-2026-0042' },
  { category: 'Marketing', format: 'MKT {canal} {detalle}', example: 'MKT ADS META CAMPANA-Q2' },
  { category: 'Plataformas', format: 'PLT {servicio}', example: 'PLT CONTABO SERVIDOR-01' },
  { category: 'Cobros cliente', format: 'FAC {cliente} {nº factura}', example: 'FAC CBD BUF-2026-00115' },
  { category: 'Gastos varios', format: 'GTO {concepto}', example: 'GTO GESTORIA TRIMESTRE' },
] as const

function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

/** Clave estable para agrupar cargos de tarjeta / conceptos repetidos */
export function normalizeConceptKey(description: string): string {
  let d = description.trim().toUpperCase()
  d = d.replace(/\*[A-Z0-9]+$/i, '')
  d = d.replace(/\s+\d{2}\/\d{2}(\/\d{2,4})?/g, '')
  d = d.replace(/\s+EUR?\s*[\d.,]+/gi, '')
  d = d.replace(/\s+/g, ' ').trim()
  const key = d.slice(0, 48).toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'otro'
  return `other_${key}`
}

/** Etiqueta legible para plataforma detectada por recurrencia */
export function platformLabelFromDescription(description: string): string {
  const raw = norm(description)
  const cleaned = raw.replace(/\*[A-Z0-9]+$/i, '').trim()
  const word = cleaned.split(/\s+/)[0] || cleaned
  if (word.length <= 2) return cleaned.slice(0, 32)
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

function withSource(
  parsed: Omit<ParsedPaymentConcept, 'detection_source'>,
  detection_source: 'concept' | 'pattern' | 'none'
): ParsedPaymentConcept {
  return { ...parsed, detection_source }
}

export function parsePaymentConcept(description: string): ParsedPaymentConcept {
  const raw = norm(description)
  const upper = raw.toUpperCase()

  const nominaMatch = upper.match(/^NOMINA(?:\s+DE)?\s+(.+)$/i) || upper.match(/NOMINA\s+(\w+)/i)
  if (/nomina|nómina|nominas/i.test(upper) && !upper.startsWith('DEV ')) {
    const payroll_label = nominaMatch?.[1]?.trim() || raw
    const key = `payroll_${payroll_label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`
    return withSource(
      {
        raw,
        bucket: 'payroll',
        bucket_label: PAYMENT_BUCKET_LABELS.payroll,
        display_label: `Nómina · ${payroll_label}`,
        payroll_label,
        grouping_key: key,
      },
      'concept'
    )
  }

  const devMatch = upper.match(/^DEV\s+([A-ZÁÉÍÓÚÑ\s]+?)\s+([A-Z0-9][\w-]{2,})$/i)
  if (devMatch) {
    const developer_name = norm(devMatch[1])
    const project_id = devMatch[2]
    return withSource(
      {
        raw,
        bucket: 'developer',
        bucket_label: PAYMENT_BUCKET_LABELS.developer,
        display_label: `${developer_name} · ${project_id}`,
        developer_name,
        project_id,
        grouping_key: `dev_${developer_name.toLowerCase()}_${project_id.toLowerCase()}`,
      },
      'concept'
    )
  }

  const mktMatch = upper.match(/^(?:MKT|MARKETING)\s+(\w+)(?:\s+(.+))?$/i)
  if (mktMatch) {
    const marketing_channel = mktMatch[1]
    const detail = mktMatch[2]?.trim()
    return withSource(
      {
        raw,
        bucket: 'marketing',
        bucket_label: PAYMENT_BUCKET_LABELS.marketing,
        display_label: detail ? `Marketing ${marketing_channel} · ${detail}` : `Marketing ${marketing_channel}`,
        marketing_channel,
        grouping_key: `mkt_${marketing_channel.toLowerCase()}`,
      },
      'concept'
    )
  }

  if (/facebk|facebook|meta\b|google\s*ads|linkedin\s*ads/i.test(upper)) {
    return withSource(
      {
        raw,
        bucket: 'marketing',
        bucket_label: PAYMENT_BUCKET_LABELS.marketing,
        display_label: raw.slice(0, 48),
        marketing_channel: 'ADS',
        grouping_key: `mkt_ads_${raw.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      },
      'pattern'
    )
  }

  if (/hacienda|aeat|\biva\b|irpf|modelo\s*303|modelo\s*111|impuesto/i.test(upper)) {
    return withSource(
      {
        raw,
        bucket: 'tax',
        bucket_label: PAYMENT_BUCKET_LABELS.tax,
        display_label: raw.slice(0, 48),
        grouping_key: `tax_${raw.slice(0, 24).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      },
      'pattern'
    )
  }

  if (/qualitas|gestor|asesor|contable|notari|honorari/i.test(upper)) {
    return withSource(
      {
        raw,
        bucket: 'professional',
        bucket_label: PAYMENT_BUCKET_LABELS.professional,
        display_label: raw.slice(0, 48),
        grouping_key: `pro_${raw.slice(0, 24).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      },
      'pattern'
    )
  }

  const pltMatch = upper.match(/^PLT\s+(\w+)(?:\s+(.+))?$/i)
  if (pltMatch) {
    const platform_name = pltMatch[1]
    return withSource(
      {
        raw,
        bucket: 'platform',
        bucket_label: PAYMENT_BUCKET_LABELS.platform,
        display_label: `Plataforma · ${platform_name}${pltMatch[2] ? ` ${pltMatch[2]}` : ''}`,
        platform_name,
        grouping_key: `plt_${platform_name.toLowerCase()}`,
      },
      'concept'
    )
  }

  for (const p of PLATFORM_PATTERNS) {
    if (p.patterns.some((rx) => rx.test(raw))) {
      return withSource(
        {
          raw,
          bucket: 'platform',
          bucket_label: PAYMENT_BUCKET_LABELS.platform,
          display_label: p.label,
          platform_name: p.label,
          grouping_key: `platform_${p.key}`,
        },
        'pattern'
      )
    }
  }

  if (/^gastos$/i.test(upper)) {
    return withSource(
      {
        raw,
        bucket: 'other',
        bucket_label: PAYMENT_BUCKET_LABELS.other,
        display_label: 'Gastos (sin detalle)',
        grouping_key: 'other_gastos',
      },
      'none'
    )
  }

  const short = upper.replace(/\*[A-Z0-9]+$/i, '').trim()

  return withSource(
    {
      raw,
      bucket: 'other',
      bucket_label: PAYMENT_BUCKET_LABELS.other,
      display_label: short.slice(0, 48) || 'Sin concepto',
      grouping_key: normalizeConceptKey(description),
    },
    'none'
  )
}
