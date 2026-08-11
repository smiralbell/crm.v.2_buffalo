import type { ProposalDiffStats } from '@/lib/onboarding/proposal-verify'

export type ProposalTurnMemory = {
  instruction: string
  tools: string[]
  sections: string[]
  stats: ProposalDiffStats
  satisfied: boolean
}

const FEEDBACK_RE =
  /\b(lo veo igual|no ha cambiado|sigue igual|no me gusta|otra vez|repite|no es eso|mas de lo mismo|m[aá]s de lo mismo|igual que antes|no funciona|sigue sin|no ha hecho nada|no cambia)\b/i

/** Instrucciones sin contenido propio: feedback sobre el turno anterior. */
export function isFeedbackOnly(instruction: string): boolean {
  const t = (instruction || '').trim()
  if (!t || t.length > 160) return false
  // Si pide algo concreto además del feedback, no es solo feedback
  if (
    /\b(ampl[ií]a|extiende|a[nñ]ade|quita|cambia|traduce|grafico|tabla|punto\s+\d|salto)\b/i.test(
      t
    ) &&
    !FEEDBACK_RE.test(t)
  ) {
    return false
  }
  return FEEDBACK_RE.test(t)
}

/** Reinyecta la instrucción anterior con presión de agresividad. */
export function buildFeedbackRelaunch(
  lastTurn: ProposalTurnMemory,
  userFeedback: string
): string {
  const sections =
    lastTurn.sections.length > 0 ? lastTurn.sections.join(', ') : '(sin secciones registradas)'
  const tools = lastTurn.tools.length > 0 ? lastTurn.tools.join(', ') : '(ninguna)'
  const delta = lastTurn.stats?.wordsDelta ?? 0
  return [
    `El usuario dice «${userFeedback.trim()}» sobre el cambio anterior.`,
    `Instrucción original: ${lastTurn.instruction}`,
    `Herramientas usadas: ${tools}`,
    `Secciones tocadas: ${sections}`,
    `Resultado medido: ${delta >= 0 ? '+' : ''}${delta} palabras (satisfied=${lastTurn.satisfied}).`,
    'El cambio fue insuficiente o no se notó.',
    'Aplícalo AHORA de forma mucho más agresiva y evidente: lee la sección, reescríbela con mucho más contenido (o el cambio pedido), y verifica el wordsDelta.',
    'No te limites a un ajuste cosmética. Si hace falta, usa rewrite_section_freeform.',
  ].join('\n')
}
