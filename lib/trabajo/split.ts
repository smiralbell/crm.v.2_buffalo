import { openRouterChatCompletion, parseJsonFromModelOutput, resolveModel } from '@/lib/openrouter'
import { validateWorkItems, type ProjectRef, type ValidatedItems } from '@/lib/trabajo/format'

/** Instrucciones para separar un resumen libre en trabajos. Las usa también el agente de WhatsApp. */
export function splitInstructions(today: string, projects: ProjectRef[]): string {
  return `Separa en trabajos concretos lo que una persona del equipo cuenta que ha hecho.

Hoy es ${today} (Europe/Madrid). Sus proyectos: ${projects.length ? projects.map((p) => p.name).join(' | ') : '(ninguno)'}.

Reglas:
- El texto puede venir en cualquier idioma o mezcla de idiomas, con muletillas de un audio transcrito. Escribe SIEMPRE en español de España, claro y profesional.
- Un trabajo = una cosa concreta hecha (no juntes cosas distintas; tampoco partas una sola cosa en trozos).
- fecha: el día en que se hizo, YYYY-MM-DD. "Hoy", "ayer", "el lunes", "esta semana"… se calculan desde hoy. Si no dice el día, es hoy. Nunca una fecha futura. Si habla de varios días, reparte cada cosa en su día; si es "esta semana" sin más detalle, ponlo todo en el día que diga o, si no dice ninguno, hoy.
- titulo: corto (máx. 12 palabras), empieza por el verbo en pasado o un sustantivo de acción ("Revisado el webhook de pagos").
- detalle: lo que haga falta para entenderlo después (qué, por qué, resultado, bloqueos). Vacío si no hay más que contar.
- proyecto: el nombre EXACTO de uno de sus proyectos si se ve claro a cuál pertenece; si no, vacío. No inventes proyectos.
- horas: solo si lo dice (o se deduce claramente, "toda la mañana" ≈ 4). Si no, vacío.
- No inventes trabajo que no esté en el texto.

Responde SOLO con JSON: {"items":[{"fecha":"YYYY-MM-DD","titulo":"...","detalle":"...","proyecto":"...","horas":2}]}`
}

/** Pasa el texto por la IA y devuelve los trabajos ya validados (sin guardar nada). */
export async function splitWorkReport(text: string, ctx: { today: string; projects: ProjectRef[] }): Promise<ValidatedItems> {
  const clean = text.trim()
  if (!clean) return { ok: false, error: 'Escribe primero lo que has hecho' }
  const raw = await openRouterChatCompletion(
    [
      { role: 'system', content: splitInstructions(ctx.today, ctx.projects) },
      { role: 'user', content: clean.slice(0, 20_000) },
    ],
    { model: resolveModel('heavy'), temperature: 0.1, json: true, maxTokens: 4000 }
  )
  const parsed = parseJsonFromModelOutput(raw) as { items?: unknown }
  return validateWorkItems(parsed?.items, ctx)
}
