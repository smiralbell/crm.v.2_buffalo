import type { CurrentQuestion, ProjectAudit } from './types'
import { readyForStrategies, isSolutionFieldKey } from './blocks'
import { BASE_QUESTIONS } from './catalog'

export type FollowUpSignal =
  | 'instagram'
  | 'whatsapp'
  | 'email'
  | 'calls'
  | 'crm'
  | 'booking'
  | 'documents'
  | 'sales'
  | 'cost_cut'
  | 'revenue'

type Template = {
  signal: FollowUpSignal
  patterns: RegExp[]
  questions: { field_key: string; question: string; why: string; area: string }[]
}

const TEMPLATES: Template[] = [
  {
    signal: 'instagram',
    patterns: [/instagram/i, /\big\b/i, /comentarios?/i],
    questions: [
      {
        field_key: 'followup.instagram.inbound_type',
        question:
          'En Instagram, ¿recibís comentarios, mensajes privados o ambos? ¿Cuántos quedan sin contestar aproximadamente?',
        why: 'Entender el canal real antes de proponer automatización',
        area: 'volumen',
      },
      {
        field_key: 'followup.instagram.limitations',
        question:
          '¿Qué limitaciones habéis encontrado en Instagram (API, tiempos de respuesta, cuentas vinculadas a Meta Business)?',
        why: 'Restricciones del canal antes de diseñar',
        area: 'integraciones',
      },
      {
        field_key: 'followup.instagram.centralize',
        question:
          '¿Queréis responder en Instagram, pasar a privado, o centralizar después en WhatsApp u otro canal? ¿Dónde preferís gestionar las conversaciones?',
        why: 'No asumir que la solución vive dentro de Instagram',
        area: 'proceso',
      },
      {
        field_key: 'followup.instagram.who_replies',
        question: '¿Quién responde hoy, cuánto tarda, y qué acciones deberían ser automáticas vs humanas?',
        why: 'Proceso y handoff',
        area: 'proceso',
      },
    ],
  },
  {
    signal: 'whatsapp',
    patterns: [/whats\s*app/i, /wpp/i, /wa\s*business/i],
    questions: [
      {
        field_key: 'followup.whatsapp.business',
        question:
          '¿Usáis WhatsApp Business / API? ¿Qué número, proveedor (Meta, Twilio, etc.) y limitaciones conocéis?',
        why: 'Validar viabilidad del canal',
        area: 'integraciones',
      },
      {
        field_key: 'followup.whatsapp.flow',
        question: '¿Cómo gestionáis hoy las conversaciones de WhatsApp y dónde quedan registradas?',
        why: 'Proceso actual del canal',
        area: 'proceso',
      },
    ],
  },
  {
    signal: 'email',
    patterns: [/correo/i, /email/i, /gmail/i, /outlook/i],
    questions: [
      {
        field_key: 'followup.email.volume',
        question: '¿Cuántos correos relevantes llegan al día y quién los clasifica o responde?',
        why: 'Volumen y roles del canal email',
        area: 'volumen',
      },
    ],
  },
  {
    signal: 'calls',
    patterns: [/llamad/i, /tel[eé]fono/i, /call\s*center/i],
    questions: [
      {
        field_key: 'followup.calls.volume',
        question: '¿Cuántas llamadas al día, duración media y cuántas pueden estar abiertas a la vez?',
        why: 'Dimensionado de voz',
        area: 'volumen',
      },
    ],
  },
  {
    signal: 'crm',
    patterns: [/crm/i, /hubspot/i, /salesforce/i, /pipedrive/i, /zoho/i],
    questions: [
      {
        field_key: 'crm.name',
        question: '¿Qué CRM utilizáis exactamente y qué entidades usáis (contactos, deals, tickets…)?',
        why: 'Modelo de datos CRM',
        area: 'datos',
      },
      {
        field_key: 'crm.read_write',
        question: '¿Qué debe leer/escribir el sistema en el CRM y qué campos no se deben tocar?',
        why: 'Alcance de integración CRM',
        area: 'datos',
      },
    ],
  },
  {
    signal: 'booking',
    patterns: [/cita/i, /reserva/i, /calendario/i, /cal\.com/i, /calendly/i],
    questions: [
      {
        field_key: 'followup.booking.calendar',
        question:
          '¿Qué calendario usáis, duración de citas, cancelaciones, recordatorios y reglas de disponibilidad?',
        why: 'Diseño de reservas sin asumir herramienta',
        area: 'proceso',
      },
    ],
  },
  {
    signal: 'documents',
    patterns: [/pdf/i, /documento/i, /factura/i, /extrae/i, /ocr/i],
    questions: [
      {
        field_key: 'followup.docs.formats',
        question: '¿Qué formatos, volumen y campos deben extraerse de los documentos? ¿Qué precisión necesitáis?',
        why: 'Alcance de procesamiento documental',
        area: 'datos',
      },
    ],
  },
  {
    signal: 'sales',
    patterns: [/venta/i, /pipeline/i, /oportunidad/i, /conversi[oó]n/i],
    questions: [
      {
        field_key: 'followup.sales.stages',
        question: '¿Cuáles son las etapas de venta, cómo cualificáis y cómo hacéis el seguimiento?',
        why: 'Proceso comercial antes de automatizar',
        area: 'proceso',
      },
    ],
  },
  {
    signal: 'cost_cut',
    patterns: [/ahorrar/i, /coste/i, /costo/i, /horas?/i, /manual/i],
    questions: [
      {
        field_key: 'roi.people_involved',
        question: 'Para dimensionar ahorro: ¿cuántas personas, horas/semana y coste/hora aproximado?',
        why: 'ROI por reducción de coste',
        area: 'roi',
      },
    ],
  },
  {
    signal: 'revenue',
    patterns: [/ingreso/i, /facturaci[oó]n/i, /ticket medio/i, /oportunidades perdidas/i],
    questions: [
      {
        field_key: 'roi.lost_opportunity',
        question: '¿Cuántas oportunidades se pierden por no responder a tiempo y cuál es el valor medio?',
        why: 'ROI por aumento de ingresos',
        area: 'roi',
      },
    ],
  },
]

function isOpen(audit: ProjectAudit, fieldKey: string): boolean {
  const f = audit.structured[fieldKey]
  if (!f) return true
  return f.status === 'empty' || f.status === 'partial'
}

/** Detecta señales en texto libre. */
export function detectFollowUpSignals(text: string): FollowUpSignal[] {
  const out: FollowUpSignal[] = []
  for (const t of TEMPLATES) {
    if (t.patterns.some((p) => p.test(text))) out.push(t.signal)
  }
  return out
}

/**
 * Elige una pregunta de seguimiento adaptativa según la última respuesta.
 * No propone solución cerrada; investiga el problema.
 */
export function pickFollowUpQuestion(
  audit: ProjectAudit,
  lastAnswer: string,
  opts?: { parentQuestionId?: string | null }
): CurrentQuestion | null {
  const signals = detectFollowUpSignals(lastAnswer)
  for (const signal of signals) {
    const tpl = TEMPLATES.find((t) => t.signal === signal)
    if (!tpl) continue
    for (const q of tpl.questions) {
      if (!isOpen(audit, q.field_key)) continue
      // Prefer catalog wording if same field exists
      const cat = BASE_QUESTIONS.find((c) => c.field_key === q.field_key)
      return {
        id: `fu_${q.field_key}_${Date.now().toString(36)}`,
        field_key: q.field_key,
        question: cat?.question || q.question,
        why: cat?.why || q.why,
        area: (cat?.area || q.area) as CurrentQuestion['area'],
        importance: cat?.importance || 'important',
        answer_type: 'textarea',
        help_text: opts?.parentQuestionId
          ? `Seguimiento de ${opts.parentQuestionId}`
          : 'Pregunta de seguimiento adaptativa',
      }
    }
  }
  return null
}

/** Filtra preguntas de solución si aún no hay cobertura mínima de descubrimiento. */
export function gateQuestionAgainstPrematureSolution(
  audit: ProjectAudit,
  question: CurrentQuestion | null
): CurrentQuestion | null {
  if (!question) return null
  if (readyForStrategies(audit)) return question
  if (isSolutionFieldKey(question.field_key)) return null
  const cat = BASE_QUESTIONS.find((q) => q.field_key === question.field_key)
  if (cat && cat.block === 'alcance' && /soluci[oó]n|arquitectura|recomend/i.test(question.question)) {
    return null
  }
  return question
}
