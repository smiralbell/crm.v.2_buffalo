import type { ProjectAudit } from './types'
import { auditCompleteness } from './progress'
import { modeLabel } from './types'

/** Payload listo para alimentar /onboarding/custom */
export function buildProposalPayload(audit: ProjectAudit) {
  const sections = audit.context.sections || {}
  const pick = (key: keyof typeof sections) =>
    (sections[key] || []).map((i) => `${i.label}: ${i.value}`).join('\n') || '—'

  const completeness = auditCompleteness(audit)
  const pendingQs = (audit.questions || []).filter((q) =>
    ['pending', 'skipped', 'unknown', 'buffalo_later', 'open'].includes(q.status)
  )

  const brief = [
    `# Auditoría Buffalo — lead ${audit.lead_id}`,
    '',
    '## Empresa y actividad',
    pick('empresa'),
    '',
    '## Problema',
    pick('problema'),
    '',
    '## Objetivos',
    pick('objetivos'),
    '',
    '## Proceso actual',
    pick('proceso'),
    '',
    '## Solución propuesta',
    pick('solucion'),
    '',
    '## Funcionalidades',
    pick('funcionalidades'),
    '',
    '## Integraciones',
    pick('integraciones'),
    '',
    '## ROI / impacto',
    pick('roi'),
    '',
    '## Requisitos técnicos',
    pick('tecnico'),
    '',
    '## Seguridad / RGPD',
    pick('seguridad'),
    '',
    '## Presupuesto (datos)',
    pick('presupuesto'),
    '',
    '## Riesgos',
    (audit.context.risks || []).join('\n') || pick('riesgos'),
    '',
    '## Suposiciones',
    (audit.context.assumptions || []).join('\n') || pick('suposiciones'),
    '',
    '## Pendientes',
    pendingQs.map((q) => `- [${modeLabel(q.mode)}] ${q.text} (${q.status})`).join('\n') ||
      pick('pendientes'),
    '',
    `## Completitud: ${completeness.percent}%`,
    completeness.criticalMissing.length
      ? `Críticos pendientes: ${completeness.criticalMissing.join(', ')}`
      : 'Sin críticos pendientes del catálogo base.',
  ].join('\n')

  return {
    brief,
    completeness,
    structured: audit.structured,
    context: audit.context,
    gaps: audit.gaps.filter((g) => g.status === 'open'),
    progress: audit.progress,
    modes_used: Array.from(new Set(audit.conversation.map((t) => t.mode))),
  }
}
