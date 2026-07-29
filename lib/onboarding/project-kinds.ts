/** Tipos de proyecto al configurar onboarding (sin paquete Buffalo). */

export type OnboardingProjectKind = 'audit' | 'custom'

export const AUDIT_BRIEF_SEED = `Auditoría Buffalo AI

Objetivo: analizar procesos, herramientas y oportunidades de automatización / agentes IA del cliente.
Entregable: informe de auditoría con hallazgos, priorización y propuesta de siguientes pasos.
Incluye: entrevistas / revisión operativa, mapa de procesos, quick wins y estimación de impacto.
No incluye (salvo pacto): implementación de agentes, desarrollo a medida ni mensualidad de producto.
Precio setup (sin IVA): [completar]
Mensualidad: no (salvo seguimiento opcional)
Plazo estimado: [completar]
`

export function onboardingKindLabel(kind: OnboardingProjectKind): string {
  return kind === 'audit' ? 'Auditoría' : 'A medida'
}
