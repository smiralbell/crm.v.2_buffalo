import type { ProjectAudit } from './types'
import { auditCompleteness } from './progress'
import { modeLabel } from './types'
import { computeBlockStatus, overallBlockProgress, readyForStrategies } from './blocks'

function pickSection(
  audit: ProjectAudit,
  key: keyof NonNullable<ProjectAudit['context']['sections']>
) {
  const items = audit.context.sections?.[key] || []
  if (!items.length) return '—'
  return items.map((i) => `- **${i.label}**: ${i.value} _(${i.status})_`).join('\n')
}

function structuredLines(audit: ProjectAudit, prefixes: string[]) {
  const lines: string[] = []
  for (const [k, v] of Object.entries(audit.structured || {})) {
    if (!prefixes.some((p) => k.startsWith(p))) continue
    if (v.value == null || v.value === '') continue
    const display = Array.isArray(v.value) ? v.value.join(', ') : String(v.value)
    lines.push(`- **${k}**: ${display} _(${v.status})_`)
  }
  return lines.length ? lines.join('\n') : '—'
}

/** Informe estructurado de auditoría (Fase 1). */
export function buildAuditReport(audit: ProjectAudit) {
  const completeness = auditCompleteness(audit)
  const blocks = computeBlockStatus(audit)
  const overall = overallBlockProgress(blocks)
  const pendingQs = (audit.questions || []).filter((q) =>
    ['pending', 'skipped', 'unknown', 'buffalo_later', 'open'].includes(q.status)
  )
  const openGaps = (audit.gaps || []).filter((g) => g.status === 'open')
  const notes = audit.meta?.notes || []

  const sections: Record<string, string> = {
    cliente: pickSection(audit, 'empresa') + '\n' + structuredLines(audit, ['business.']),
    problema: pickSection(audit, 'problema') + '\n' + structuredLines(audit, ['problem.']),
    proceso: pickSection(audit, 'proceso') + '\n' + structuredLines(audit, ['process.']),
    volumen: pickSection(audit, 'volumen') + '\n' + structuredLines(audit, ['volume.', 'voice.']),
    roi: pickSection(audit, 'roi') + '\n' + structuredLines(audit, ['roi.']),
    tecnologia:
      pickSection(audit, 'integraciones') +
      '\n' +
      pickSection(audit, 'datos') +
      '\n' +
      structuredLines(audit, ['integrations.', 'crm.', 'tech.', 'data.', 'rag.', 'ai.']),
    alcance:
      pickSection(audit, 'funcionalidades') +
      '\n' +
      structuredLines(audit, ['scope.', 'rules.', 'tone.', 'metrics.']),
    legal: pickSection(audit, 'seguridad') + '\n' + structuredLines(audit, ['security.', 'legal.']),
    presupuesto:
      pickSection(audit, 'presupuesto') +
      '\n' +
      structuredLines(audit, ['budget.', 'impl.', 'maint.']),
  }

  const blockTable = blocks
    .map(
      (b) =>
        `| ${b.label} | ${b.status} | ${b.sufficiency}% | ${b.answered}/${b.total} |`
    )
    .join('\n')

  const markdown = [
    `# Informe de auditoría — lead ${audit.lead_id}`,
    '',
    `Generado: ${new Date().toISOString()}`,
    `Completitud catálogo: **${completeness.percent}%** · Bloques: **${overall.completed}/${overall.total}** (media ${overall.percent}%)`,
    `Listo para estrategias: **${readyForStrategies(audit) ? 'sí' : 'aún no'}**`,
    '',
    '## Progreso por bloques',
    '| Bloque | Estado | Suficiencia | Cubiertas |',
    '| --- | --- | --- | --- |',
    blockTable,
    '',
    '## Información del cliente',
    sections.cliente,
    '',
    '## Problema detectado',
    sections.problema,
    '',
    '## Proceso actual',
    sections.proceso,
    '',
    '## Volumen',
    sections.volumen,
    '',
    '## Situación tecnológica',
    sections.tecnologia,
    '',
    '## Propuesta preliminar',
    readyForStrategies(audit)
      ? pickSection(audit, 'solucion') +
        '\n\n_Fase 1: estrategias detalladas se generarán cuando haya más datos de alcance._'
      : '_Aún no se recomienda una solución cerrada: falta cobertura mínima de problema, proceso, volumen y herramientas._',
    '',
    '## Alcance',
    sections.alcance,
    '',
    '## Rentabilidad (cualitativa)',
    sections.roi,
    '\n_Cálculo numérico editable (horas, payback) llega en Fase 2._',
    '',
    '## Seguridad y legalidad',
    sections.legal,
    '\n_Los puntos legales requieren validación; este informe no es dictamen jurídico._',
    '',
    '## Presupuesto e implantación',
    sections.presupuesto,
    '',
    '## Riesgos',
    (audit.context.risks || []).map((r) => `- ${r}`).join('\n') ||
      openGaps.map((g) => `- ${g.title}: ${g.description}`).join('\n') ||
      '—',
    '',
    '## Información pendiente',
    pendingQs.map((q) => `- [${modeLabel(q.mode)}] ${q.text} (${q.status})`).join('\n') ||
      pickSection(audit, 'pendientes'),
    '',
    completeness.criticalMissing.length
      ? `Críticos del catálogo pendientes: ${completeness.criticalMissing.join(', ')}`
      : 'Sin críticos pendientes del catálogo base.',
    '',
    '## Notas de la reunión',
    notes.map((n) => `- ${n.text} _(${n.created_at})_`).join('\n') || '—',
    '',
    '## Próximos pasos',
    '- Revisar pendientes y huecos críticos con el cliente.',
    '- Validar accesos e integraciones mencionadas.',
    '- Cuando la cobertura sea suficiente, generar estrategias alternativas y pasar a propuesta.',
  ].join('\n')

  return {
    markdown,
    generated_at: new Date().toISOString(),
    completeness_percent: completeness.percent,
    sections,
  }
}

/** Payload listo para alimentar /onboarding/custom */
export function buildProposalPayload(audit: ProjectAudit) {
  const sections = audit.context.sections || {}
  const pick = (key: keyof typeof sections) =>
    (sections[key] || []).map((i) => `${i.label}: ${i.value}`).join('\n') || '—'

  const completeness = auditCompleteness(audit)
  const pendingQs = (audit.questions || []).filter((q) =>
    ['pending', 'skipped', 'unknown', 'buffalo_later', 'open'].includes(q.status)
  )

  const report = audit.report || buildAuditReport(audit)

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
    readyForStrategies(audit) ? pick('solucion') : 'Pendiente de cerrar descubrimiento (no prematura).',
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
    '',
    '---',
    '',
    report.markdown,
  ].join('\n')

  return {
    brief,
    completeness,
    structured: audit.structured,
    context: audit.context,
    gaps: audit.gaps.filter((g) => g.status === 'open'),
    progress: audit.progress,
    report,
    modes_used: Array.from(new Set(audit.conversation.map((t) => t.mode))),
  }
}
