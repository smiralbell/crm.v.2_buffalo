/**
 * Convención de conceptos bancarios Buffalo IA
 *
 * Formato en transferencias (mayúsculas, sin tildes):
 * - NOMINA {MES} {APELLIDO}           → nóminas del equipo interno
 * - DEV {ID} {NOMBRE} {PROYECTO-ID}    → pago a developer (ID = crm_users.id)
 * - MKT {CANAL} {TIPO} […]            → marketing (ver MARKETING_PAYMENT_RULES)
 * - PLT {SERVICIO}                    → plataformas/SaaS por transferencia
 * - FAC {CLIENTE} {NUM-FACTURA}       → cobros (opcional en ingresos)
 *
 * Los cargos de tarjeta (TWILIO, CURSOR…) se clasifican automáticamente.
 * No uses conceptos “GTO / gastos varios”: no se catalogan.
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

export const PAYMENT_BUCKETS = Object.keys(PAYMENT_BUCKET_LABELS) as PaymentBucket[]

export function isPaymentBucket(value: unknown): value is PaymentBucket {
  return typeof value === 'string' && value in PAYMENT_BUCKET_LABELS
}

/** Canales de coste que alimentan KPIs de leads (dashboard) */
export type LeadCostChannel = 'email' | 'web' | 'cold_calling'

export type MarketingPaymentRule = {
  /** Token exacto tras MKT (META, GOOGLE, EMAIL, COLDCALL) */
  token: string
  /** Canal de leads al que suma el gasto */
  lead_channel: LeadCostChannel | null
  label: string
  model: string
  concepts: Array<{ example: string; detail: string }>
}

/**
 * Cómo poner el concepto del banco para que el dashboard asocie el gasto al canal.
 * Web orgánica: no se invierte → no hay concepto.
 */
export const MARKETING_PAYMENT_RULES: MarketingPaymentRule[] = [
  {
    token: 'META',
    lead_channel: 'web',
    label: 'Meta Ads',
    model: 'Setup + mensualidad',
    concepts: [
      { example: 'MKT META SETUP', detail: 'Pago inicial / configuración de la cuenta' },
      { example: 'MKT META MENSUAL', detail: 'Cuota o recarga mensual de anuncios' },
    ],
  },
  {
    token: 'GOOGLE',
    lead_channel: 'web',
    label: 'Google Ads',
    model: 'Setup + mensualidad',
    concepts: [
      { example: 'MKT GOOGLE SETUP', detail: 'Pago inicial / configuración' },
      { example: 'MKT GOOGLE MENSUAL', detail: 'Cuota o recarga mensual de anuncios' },
    ],
  },
  {
    token: 'EMAIL',
    lead_channel: 'email',
    label: 'Email marketing',
    model: 'Setup + mensualidad',
    concepts: [
      { example: 'MKT EMAIL SETUP', detail: 'Setup / onboarding (Instantly, etc.)' },
      { example: 'MKT EMAIL MENSUAL', detail: 'Cuota mensual de la herramienta o gestión' },
    ],
  },
  {
    token: 'COLDCALL',
    lead_channel: 'cold_calling',
    label: 'Cold calling',
    model: 'Comisión % cuando se cierra un lead',
    concepts: [
      {
        example: 'MKT COLDCALL COMISION NOMBRE',
        detail: 'Comisión al comercial cuando el lead se gana/cierra',
      },
    ],
  },
  {
    token: 'WEB',
    lead_channel: null,
    label: 'Web (orgánico)',
    model: 'Sin inversión',
    concepts: [],
  },
]

/** Normaliza el token MKT del banco → canal de leads (KPIs) */
export function marketingTokenToLeadChannel(token: string): LeadCostChannel | null {
  const t = (token || '').trim().toUpperCase()
  if (!t) return null
  if (t === 'EMAIL' || t === 'INSTANTLY' || t === 'OUTREACH' || t === 'MAIL') return 'email'
  if (t === 'COLDCALL' || t === 'COLD' || t === 'COLDCALLING' || t === 'CALLING') {
    return 'cold_calling'
  }
  // Ads de pago → se imputan al canal Web (leads ads/web); orgánico no genera gasto
  if (
    t === 'META' ||
    t === 'FACEBOOK' ||
    t === 'FB' ||
    t === 'INSTAGRAM' ||
    t === 'GOOGLE' ||
    t === 'ADS' ||
    t === 'ADWORDS' ||
    t === 'SEM'
  ) {
    return 'web'
  }
  return null
}

export interface ParsedPaymentConcept {
  raw: string
  bucket: PaymentBucket
  bucket_label: string
  display_label: string
  developer_name?: string
  /** ID del developer en crm_users */
  developer_id?: string
  project_id?: string
  payroll_label?: string
  marketing_channel?: string
  /** Canal de leads asociado (email | web | cold_calling) */
  lead_cost_channel?: LeadCostChannel
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
  { category: 'Nóminas (equipo)', format: 'NOMINA {MES} {APELLIDO}', example: 'NOMINA JULIO MASOLIVER' },
  {
    category: 'Developers',
    format: 'DEV {ID} {NOMBRE} {PROYECTO-ID}',
    example: 'DEV 3 LAURA BUF-2026-0042',
  },
  { category: 'Marketing Meta', format: 'MKT META MENSUAL', example: 'MKT META MENSUAL' },
  { category: 'Marketing Email', format: 'MKT EMAIL MENSUAL', example: 'MKT EMAIL MENSUAL' },
  { category: 'Cold calling', format: 'MKT COLDCALL COMISION {nombre}', example: 'MKT COLDCALL COMISION SERGI' },
  { category: 'Plataformas', format: 'PLT {servicio}', example: 'PLT CONTABO SERVIDOR-01' },
  { category: 'Cobros cliente', format: 'FAC {cliente} {nº factura}', example: 'FAC CBD BUF-2026-00115' },
  {
    category: 'Liquidación IVA (Hacienda)',
    format: 'I.V.A. MODELO 303',
    example: 'I.V.A. MODELO 303',
  },
] as const

/**
 * Detecta el pago de liquidación IVA a Hacienda.
 * Concepto recomendado: `I.V.A. MODELO 303`
 */
export function isModelo303Settlement(description: string): boolean {
  const u = (description || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!/MODELO\s*303/.test(u) && !u.replace(/\s+/g, '').includes('MODELO303')) return false
  if (/I\.?\s*V\.?\s*A\.?|IVA|AEAT|HACIENDA/.test(u)) return true
  return /^MODELO\s*303\b/.test(u.trim())
}

/** Plataformas que cobran por tarjeta — no requieren concepto manual */
export const AUTO_DETECTED_SAAS = [
  'Twilio',
  'Cursor',
  'Retell AI',
  'OpenAI',
  'Anthropic',
  'ElevenLabs',
  'Contabo',
  'EasyPanel',
  'Fireflies',
  'NexiaIA',
] as const

/**
 * Transferencias que SÍ llevan concepto fijo.
 * (Marketing tiene su propia sección; no documentamos gastos varios / GTO.)
 */
export const MANUAL_TRANSFER_RULES = [
  {
    category: 'Nóminas (nosotros / equipo interno)',
    applies_to: 'Cuando os pagáis el sueldo a vosotros mismos o al equipo fijo',
    format: 'NOMINA {MES} {APELLIDO}',
    example: 'NOMINA JULIO MASOLIVER',
    detail:
      'Mes en mayúsculas + apellido (o nombre corto). Ejemplo: NOMINA JULIO SERGI · NOMINA JULIO MIRALBELL',
  },
  {
    category: 'Developers (freelancers)',
    applies_to: 'Pago a un developer con su ID de usuario CRM + proyecto',
    format: 'DEV {ID} {NOMBRE} {PROYECTO-ID}',
    example: 'DEV 3 LAURA BUF-2026-0042',
    detail:
      'ID = número del developer en Usuarios (crm_users). PROYECTO-ID = código del proyecto (p. ej. BUF-2026-0042).',
  },
  {
    category: 'Liquidación IVA (Hacienda)',
    applies_to: 'Cuando pagáis el modelo 303 — pone a 0 el IVA a deber en Finanzas',
    format: 'I.V.A. MODELO 303',
    example: 'I.V.A. MODELO 303',
    detail:
      'Tras este pago, el CRM vuelve a sumar IVA de cobros y restar IVA de gastos hasta el siguiente 303.',
  },
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

  // Formato nuevo: DEV {ID} {NOMBRE} {PROYECTO-ID}
  // Compat: DEV {NOMBRE} {PROYECTO-ID}
  const devWithId = upper.match(
    /^DEV\s+(\d+)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]*?)\s+([A-Z0-9][\w-]{2,})$/i
  )
  const devLegacy = upper.match(/^DEV\s+([A-ZÁÉÍÓÚÑ\s]+?)\s+([A-Z0-9][\w-]{2,})$/i)
  if (devWithId || (devLegacy && !/^\d+\s/.test(devLegacy[1]))) {
    const developer_id = devWithId?.[1]
    const developer_name = norm(devWithId?.[2] || devLegacy![1])
    const project_id = (devWithId?.[3] || devLegacy![2]).toUpperCase()
    return withSource(
      {
        raw,
        bucket: 'developer',
        bucket_label: PAYMENT_BUCKET_LABELS.developer,
        display_label: developer_id
          ? `Dev #${developer_id} ${developer_name} · ${project_id}`
          : `${developer_name} · ${project_id}`,
        developer_name,
        developer_id,
        project_id,
        grouping_key: developer_id
          ? `dev_${developer_id}_${project_id.toLowerCase()}`
          : `dev_${developer_name.toLowerCase()}_${project_id.toLowerCase()}`,
      },
      'concept'
    )
  }

  const mktMatch = upper.match(/^(?:MKT|MARKETING)\s+(\w+)(?:\s+(.+))?$/i)
  if (mktMatch) {
    const marketing_channel = mktMatch[1].toUpperCase()
    const detail = mktMatch[2]?.trim()
    const lead_cost_channel = marketingTokenToLeadChannel(marketing_channel) || undefined
    return withSource(
      {
        raw,
        bucket: 'marketing',
        bucket_label: PAYMENT_BUCKET_LABELS.marketing,
        display_label: detail
          ? `Marketing ${marketing_channel} · ${detail}`
          : `Marketing ${marketing_channel}`,
        marketing_channel,
        lead_cost_channel,
        grouping_key: `mkt_${marketing_channel.toLowerCase()}`,
      },
      'concept'
    )
  }

  if (/facebk|facebook|\bmeta\b|instagram\s*ads/i.test(upper)) {
    return withSource(
      {
        raw,
        bucket: 'marketing',
        bucket_label: PAYMENT_BUCKET_LABELS.marketing,
        display_label: raw.slice(0, 48),
        marketing_channel: 'META',
        lead_cost_channel: 'web',
        grouping_key: `mkt_meta_${raw.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      },
      'pattern'
    )
  }

  if (/google\s*ads|adwords|\bgoogle\s*ad\b/i.test(upper)) {
    return withSource(
      {
        raw,
        bucket: 'marketing',
        bucket_label: PAYMENT_BUCKET_LABELS.marketing,
        display_label: raw.slice(0, 48),
        marketing_channel: 'GOOGLE',
        lead_cost_channel: 'web',
        grouping_key: `mkt_google_${raw.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      },
      'pattern'
    )
  }

  if (/linkedin\s*ads/i.test(upper)) {
    return withSource(
      {
        raw,
        bucket: 'marketing',
        bucket_label: PAYMENT_BUCKET_LABELS.marketing,
        display_label: raw.slice(0, 48),
        marketing_channel: 'ADS',
        lead_cost_channel: 'web',
        grouping_key: `mkt_ads_${raw.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      },
      'pattern'
    )
  }

  if (isModelo303Settlement(raw) || /hacienda|aeat|\biva\b|irpf|modelo\s*303|modelo\s*111|impuesto/i.test(upper)) {
    const settlement = isModelo303Settlement(raw)
    return withSource(
      {
        raw,
        bucket: 'tax',
        bucket_label: PAYMENT_BUCKET_LABELS.tax,
        display_label: settlement ? 'I.V.A. Modelo 303' : raw.slice(0, 48),
        grouping_key: settlement
          ? 'tax_modelo_303'
          : `tax_${raw.slice(0, 24).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      },
      settlement ? 'concept' : 'pattern'
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

/** Ingresos de plataformas SaaS (devoluciones, abonos Stripe…) → agrupar en «Otros» */
export function isPlatformLikeDescription(description: string): boolean {
  return parsePaymentConcept(description || '').bucket === 'platform'
}
