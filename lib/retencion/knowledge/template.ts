/**
 * Plantilla canónica del CONTEXTO DEL PROYECTO (retención).
 * El agente de auditoría debe rellenar y mantener estas secciones.
 */

export const KNOWLEDGE_DOC_TITLE = 'Contexto del proyecto'

export const KNOWLEDGE_SECTIONS = [
  {
    id: 'identidad',
    title: '1. Identidad y cliente',
    purpose: 'Quién es el cliente, IDs CRM, estado del proyecto.',
  },
  {
    id: 'producto',
    title: '2. Producto contratado',
    purpose: 'Qué se vendió/configuró: voz, chat, dash, addons, scope custom.',
  },
  {
    id: 'comercial',
    title: '3. Comercial / mensualidad',
    purpose: 'Setup, fee mensual, plan de mantenimiento, split de pagos (coste Buffalo).',
  },
  {
    id: 'tecnico',
    title: '4. Stack y accesos técnicos',
    purpose: 'IDs Retell/Twilio/WhatsApp, webhooks, stack declarado en onboarding.',
  },
  {
    id: 'onboarding_dev',
    title: '5. Onboarding desarrollo',
    purpose: 'Summary, contexto cliente, alcance, entregables, notas internas, docs.',
  },
  {
    id: 'tareas',
    title: '6. Tareas y entrega',
    purpose: 'Timeline, conteos por estado, tareas abiertas prioritarias, assignees.',
  },
  {
    id: 'soporte',
    title: '7. Soporte e incidencias',
    purpose: 'Tickets abiertos/recientes, temas recurrentes.',
  },
  {
    id: 'datos',
    title: '8. Datos y schema del cliente',
    purpose: 'Tablas clave en Postgres del cliente, métricas, grano, SLAs de dato.',
  },
  {
    id: 'metricas',
    title: '9. Métricas de retención',
    purpose: 'KPIs Engranaje5 / uso reciente si existen.',
  },
  {
    id: 'operativa',
    title: '10. Riesgos, SLAs y notas operativas',
    purpose: 'Qué mide éxito, dolores conocidos, riesgos, criterios de alerta.',
  },
  {
    id: 'baseline_manual',
    title: '11. Coste manual antes de Buffalo',
    purpose:
      'Tiempo perdido, dinero gastado y recursos (personas, PCs, herramientas, oficinas…) haciendo el proceso a mano.',
  },
  {
    id: 'roi_ahorro',
    title: '12. ROI y ahorro con Buffalo',
    purpose:
      'Comparación baseline vs coste Buffalo: horas ahorradas, €/mes, payback, ROI %.',
  },
  {
    id: 'fuentes',
    title: '13. Fuentes CRM ingeridas',
    purpose: 'Qué se cargó del CRM y cuándo (trazabilidad).',
  },
] as const

export type KnowledgeSectionId = (typeof KNOWLEDGE_SECTIONS)[number]['id']

/** Checklist de entrevista para baseline + ROI (el agente debe cubrirlo). */
export const ROI_INTERVIEW_CHECKLIST = `
## Checklist baseline / ROI (obligatorio en auditoría)

Pregunta y documenta en sección 11 (baseline_manual), con cifras o rangos. Si no saben exacto, pide estimación razonable y márcala como «estimado».

### Tiempo
- ¿Cuántas horas/semana (o mes) dedicaban a este proceso a mano?
- ¿Quién lo hacía? (roles: recepción, comercial, admin, call center…)
- ¿Cuántas interacciones/casos al mes? (llamadas, chats, tickets, citas…)
- Tiempo medio por caso manual vs con Buffalo (si se conoce).

### Dinero
- Coste salarial aproximado de las personas implicadas (€/hora o €/mes).
- Software / SaaS / telefonía / agencias externas que usaban antes (€/mes).
- Errores o leads perdidos por hacerlo manual (si hay estimación en €).

### Recursos
- Nº de personas dedicadas (FTE o % de jornada).
- Puestos / ordenadores / líneas telefónicas / turnos.
- Herramientas previas (Excel, CRM viejo, centralita…).

### Cálculo (sección 12 roi_ahorro)
Con los datos de la 11 + mensualidad Buffalo (sección 3):
- Coste_manual_mes ≈ (horas_mes × €/hora) + software + otros
- Coste_buffalo_mes ≈ monthly_fee_eur (+ costes variables conocidos si hay)
- Ahorro_mes = Coste_manual_mes − Coste_buffalo_mes
- Horas_ahorradas_mes
- ROI_anual % ≈ (Ahorro_mes × 12 − setup_fee) / (setup_fee + Coste_buffalo_mes × 12) × 100
  (ajusta si no hay setup; documenta la fórmula usada)
- Payback en meses = inversión_inicial / Ahorro_mes (si Ahorro_mes > 0)

Reglas:
- No inventes cifras: si faltan, deja "Pendiente: …" y pregunta.
- Separa hechos vs estimaciones.
- Muestra la cuenta para que un humano pueda auditarla.
`.trim()

export function knowledgeTemplateOutline(): string {
  return KNOWLEDGE_SECTIONS.map((s) => `## ${s.title}\n_(${s.purpose})_`).join('\n\n')
}

/** Instrucciones fijas para que el agente estructure el documento. */
export const KNOWLEDGE_STRUCTURE_RULES = `Al guardar o fusionar contexto con save_knowledge / merge_knowledge_section:
- Usa markdown con exactamente estas secciones (títulos ##):
${KNOWLEDGE_SECTIONS.map((s) => `  ## ${s.title}`).join('\n')}
- No inventes datos: si falta algo, escribe "Pendiente: …" o "Sin dato en CRM".
- Integra el seed CRM + respuestas humanas + hallazgos de Postgres.
- Las secciones 11 (baseline_manual) y 12 (roi_ahorro) son críticas para el valor del cliente: rellénalas en la entrevista.
- Mantén el documento legible para un humano que revise fallos o el ROI.
- Actualiza la sección 13 (fuentes) con fecha ISO cuando ingeras CRM.`
