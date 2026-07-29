import { openRouterChatCompletion, parseJsonFromModelOutput } from '@/lib/openrouter'
import type { ConfiguradorConfig, ProyectoServiceType } from '@/lib/engranaje5/types'
import { CUSTOM_BRIEF_NEEDS } from '@/lib/onboarding/custom-brief-needs'

export { CUSTOM_BRIEF_NEEDS }

export type BriefChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type CustomBriefAiResult =
  | {
      status: 'need_info'
      assistant_message: string
      questions: string[]
      config: null
      missing: string[]
    }
  | {
      status: 'ready'
      assistant_message: string
      questions: string[]
      config: ConfiguradorConfig
      missing: string[]
    }

type RawAiPayload = {
  status?: string
  assistant_message?: string
  questions?: unknown
  missing?: unknown
  config?: Record<string, unknown> | null
}

const SERVICE_TYPES: ProyectoServiceType[] = [
  'automation',
  'lead_gen',
  'geo_seo',
  'voice_agent',
  'text_agent',
  'dashboard_app',
  'audit',
]

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x || '').trim()).filter(Boolean)
}

function normalizeServiceType(v: unknown, fallback: ProyectoServiceType = 'automation'): ProyectoServiceType {
  const s = String(v || '')
    .toLowerCase()
    .trim()
  if (SERVICE_TYPES.includes(s as ProyectoServiceType)) return s as ProyectoServiceType
  if (s.includes('audit') || s.includes('auditor')) return 'audit'
  if (s.includes('lead')) return 'lead_gen'
  if (s.includes('seo') || s.includes('geo')) return 'geo_seo'
  if (s.includes('voz') || s.includes('voice')) return 'voice_agent'
  if (s.includes('chat') || s.includes('text')) return 'text_agent'
  if (s.includes('dash')) return 'dashboard_app'
  return fallback
}

function normalizeConfig(
  raw: Record<string, unknown> | null | undefined,
  client: { nombre?: string; empresa?: string; email?: string; ciudad?: string; ref?: string }
): ConfiguradorConfig | null {
  if (!raw || typeof raw !== 'object') return null

  const lineItemsRaw = Array.isArray(raw.line_items) ? raw.line_items : []
  const line_items = lineItemsRaw
    .map((item) => {
      const o = item as Record<string, unknown>
      const description = String(o.description || o.desc || '').trim()
      const amount = Number(o.amount_eur ?? o.amount ?? 0)
      if (!description || !Number.isFinite(amount)) return null
      return { description, amount_eur: Math.round(amount) }
    })
    .filter((x): x is { description: string; amount_eur: number } => Boolean(x))

  let setup = Number(raw.setup_total_eur)
  if (!Number.isFinite(setup) || setup <= 0) {
    setup = line_items.reduce((s, i) => s + i.amount_eur, 0)
  }
  if (!Number.isFinite(setup) || setup <= 0) return null

  if (line_items.length === 0) {
    line_items.push({
      description: String(raw.title || 'Servicios Buffalo AI').trim() || 'Servicios Buffalo AI',
      amount_eur: Math.round(setup),
    })
  }

  const monthlyRaw = raw.monthly_fee_eur
  const monthly =
    monthlyRaw == null || monthlyRaw === ''
      ? null
      : Number.isFinite(Number(monthlyRaw))
        ? Math.round(Number(monthlyRaw))
        : null

  const questionsRaw = Array.isArray(raw.custom_questions) ? raw.custom_questions : []
  const custom_questions = questionsRaw
    .map((q, i) => {
      const o = q as Record<string, unknown>
      const label = String(o.label || '').trim()
      if (!label) return null
      const type = o.type === 'text' ? 'text' : 'textarea'
      const id = String(o.id || `q_${i + 1}`).replace(/[^a-zA-Z0-9_]/g, '_')
      return { id, label, type: type as 'text' | 'textarea' }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .slice(0, 8)

  const split = String(raw.payment_split || '50_50') === '100_upfront' ? '100_upfront' : '50_50'
  const title =
    String(raw.title || '').trim() ||
    client.empresa?.trim() ||
    client.nombre?.trim() ||
    'Proyecto a medida'

  return {
    mode: 'custom',
    ref: String(raw.ref || client.ref || '').trim() || undefined,
    empresa: client.empresa || String(raw.empresa || '').trim() || undefined,
    nombre: client.nombre || String(raw.nombre || '').trim() || undefined,
    email: client.email || String(raw.email || '').trim() || undefined,
    city: client.ciudad || String(raw.city || '').trim() || undefined,
    plazo: String(raw.plazo || '4–6 semanas').trim() || '4–6 semanas',
    title,
    description: String(raw.description || '').trim() || undefined,
    service_type: normalizeServiceType(raw.service_type),
    scope_items: asStringArray(raw.scope_items).slice(0, 12),
    line_items,
    setup_total_eur: Math.round(setup),
    monthly_fee_eur: monthly,
    payment_split: split,
    onboarding_notes: String(raw.onboarding_notes || '').trim() || undefined,
    custom_questions,
    voz: false,
    chat: false,
    dash: false,
    pack: false,
    maint: null,
  }
}

function configIsComplete(cfg: ConfiguradorConfig | null): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (!cfg) return { ok: false, missing: ['Configuración incompleta'] }
  if (!cfg.title?.trim()) missing.push('Título del proyecto')
  if (!cfg.scope_items?.length) missing.push('Alcance / entregables')
  if (!cfg.setup_total_eur || cfg.setup_total_eur <= 0) missing.push('Precio de setup')
  if (!cfg.line_items?.length) missing.push('Líneas económicas')
  if (!cfg.plazo?.trim()) missing.push('Plazo estimado')
  return { ok: missing.length === 0, missing }
}

const SYSTEM = `Eres el asistente comercial de Buffalo AI. Ayudas a empaquetar un PROYECTO A MEDIDA (no el configurador de agentes voz/chat/dash).

El comercial te da un brief. Tu trabajo:
1) Si falta información crítica, pregunta (máx 3 preguntas concretas, en español).
2) Si ya hay bastante, genera la config lista para propuesta, contrato, factura y onboarding.

Información crítica que DEBES tener o preguntar:
- Alcance / entregables (qué se hace)
- Precio setup en EUR sin IVA (obligatorio; NUNCA inventes un precio)
- Mensualidad si aplica (o dejar claro que no hay)
- Plazo estimado
- Forma de pago: "50_50" (por defecto) o "100_upfront"
- Qué preguntar al cliente en onboarding (si no se indica, inventa 2-4 preguntas útiles genéricas)

NO inventes precios. Si no hay precio, status = need_info.
NO conviertas el proyecto a paquetes voz/chat/dash salvo que el brief lo diga explícitamente.

Responde SOLO JSON válido (sin markdown):
{
  "status": "need_info" | "ready",
  "assistant_message": "texto corto para el comercial",
  "questions": ["pregunta 1", "..."],
  "missing": ["precio setup", "..."],
  "config": null | {
    "title": string,
    "description": string,
    "service_type": "automation"|"lead_gen"|"geo_seo"|"voice_agent"|"text_agent"|"dashboard_app"|"audit",
    "scope_items": string[],
    "line_items": [{ "description": string, "amount_eur": number }],
    "setup_total_eur": number,
    "monthly_fee_eur": number|null,
    "payment_split": "50_50"|"100_upfront",
    "plazo": string,
    "onboarding_notes": string,
    "custom_questions": [{ "id": string, "label": string, "type": "text"|"textarea" }]
  }
}

Si status=ready, config debe estar completa y setup_total_eur debe coincidir con la suma de line_items (o una sola línea con el total).
Si status=need_info, config=null y questions no vacío.`

export async function analyzeCustomProjectBrief(input: {
  brief: string
  messages?: BriefChatMessage[]
  client?: { nombre?: string; empresa?: string; email?: string; ciudad?: string; ref?: string }
  kind?: 'audit' | 'custom'
}): Promise<CustomBriefAiResult> {
  const client = input.client || {}
  const kind = input.kind === 'audit' ? 'audit' : 'custom'
  const history = (input.messages || [])
    .filter((m) => m.content?.trim())
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'Comercial' : 'Asistente'}: ${m.content.trim()}`)
    .join('\n')

  const system =
    kind === 'audit'
      ? SYSTEM.replace(
          'un PROYECTO A MEDIDA (no el configurador de agentes voz/chat/dash)',
          'una AUDITORÍA Buffalo (diagnóstico/informe; no implementación de agentes ni paquete)'
        ).replace(
          '"service_type": "automation"|"lead_gen"|"geo_seo"|"voice_agent"|"text_agent"|"dashboard_app"|"audit"',
          '"service_type": "audit"'
        ) +
        '\n\nPara auditorías: service_type DEBE ser "audit". Mensualidad suele ser null. Prioriza entregable = informe + hallazgos + roadmap.'
      : SYSTEM

  const userPayload = {
    tipo: kind === 'audit' ? 'auditoria' : 'a_medida',
    cliente: {
      nombre: client.nombre || null,
      empresa: client.empresa || null,
      email: client.email || null,
      ciudad: client.ciudad || null,
      ref: client.ref || null,
    },
    brief_actual: input.brief.trim(),
    conversacion_previa: history || null,
    checklist_necesario: CUSTOM_BRIEF_NEEDS,
  }

  const raw = await openRouterChatCompletion(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `Analiza este brief de ${kind === 'audit' ? 'auditoría' : 'proyecto a medida'} y responde en JSON:\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
    { temperature: 0.2 }
  )

  let parsed: RawAiPayload
  try {
    parsed = parseJsonFromModelOutput(raw) as RawAiPayload
  } catch {
    throw new Error('La IA no devolvió JSON válido. Prueba de nuevo.')
  }

  const questions = asStringArray(parsed.questions).slice(0, 5)
  const missing = asStringArray(parsed.missing)
  const assistant_message =
    String(parsed.assistant_message || '').trim() ||
    (parsed.status === 'ready'
      ? 'Proyecto listo. Revisa y confirma.'
      : 'Necesito un poco más de información.')

  let config = normalizeConfig(parsed.config, client)
  if (config && kind === 'audit') {
    config = {
      ...config,
      service_type: 'audit',
      title: /auditor/i.test(config.title || '')
        ? config.title
        : `Auditoría · ${config.title || client.empresa || client.nombre || 'Cliente'}`,
    }
  }
  const completeness = configIsComplete(config)

  if (parsed.status === 'ready' && completeness.ok && config) {
    return {
      status: 'ready',
      assistant_message,
      questions: [],
      missing: [],
      config,
    }
  }

  // Si decía ready pero falta precio/alcance → forzar preguntas
  const forceQuestions =
    questions.length > 0
      ? questions
      : completeness.missing.map((m) => `¿Puedes indicar: ${m}?`)

  return {
    status: 'need_info',
    assistant_message,
    questions: forceQuestions.slice(0, 3),
    missing: missing.length ? missing : completeness.missing,
    config: null,
  }
}

export function encodeConfiguracion(cfg: ConfiguradorConfig): string {
  return Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64')
}
