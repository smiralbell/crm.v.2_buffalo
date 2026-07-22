import type { CrmKnowledgeBundle } from './collect-crm'
import { KNOWLEDGE_DOC_TITLE, KNOWLEDGE_SECTIONS } from './template'

function bullet(items: string[]): string {
  if (!items.length) return '- Sin dato'
  return items.map((i) => `- ${i}`).join('\n')
}

function kv(label: string, value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'object') {
    try {
      return `- **${label}**: \`${JSON.stringify(value)}\``
    } catch {
      return `- **${label}**: (objeto)`
    }
  }
  return `- **${label}**: ${String(value)}`
}

function block(lines: Array<string | null | undefined>): string {
  return lines.filter(Boolean).join('\n')
}

/** Convierte el bundle CRM en el documento markdown canónico (seed inicial). */
export function renderCrmKnowledgeMarkdown(bundle: CrmKnowledgeBundle): string {
  const id = bundle.identidad
  const prod = bundle.producto
  const com = bundle.comercial
  const tec = bundle.tecnico
  const ob = bundle.onboarding_dev
  const tasks = bundle.tareas
  const tickets = bundle.soporte

  const sections: Record<string, string> = {
    identidad: block([
      kv('proyecto_id', id.proyecto_id),
      kv('nombre', id.name),
      kv('service_type', id.service_type),
      kv('status', id.status),
      kv('es_buffalo', id.es_buffalo),
      kv('has_mensualidad', id.has_mensualidad),
      kv('config_ref', id.config_ref),
      kv('lead_id', id.lead_id),
      kv('contact', `${id.contact.nombre || '—'} · ${id.contact.empresa || '—'} · ${id.contact.email || '—'} · ${id.contact.telefono || '—'}`),
      kv('lead.estado', id.lead.estado),
      kv('lead.origen', id.lead.origen),
      kv('timeline.created_at', id.timeline.created_at),
      kv('timeline.launched_at', id.timeline.launched_at),
      kv('timeline.fecha_inicio_real', id.timeline.fecha_inicio_real),
      kv('timeline.fecha_fin_real', id.timeline.fecha_fin_real),
      kv('timeline.dev_target_end_date', id.timeline.dev_target_end_date),
      kv('timeline.tiempo_previsto', id.timeline.tiempo_previsto),
      id.lead.notas ? `\n**Notas lead:**\n${id.lead.notas}` : null,
      bundle.developers.length
        ? `\n**Developers asignados:**\n${bullet(bundle.developers.map((d) => `${d.name || d.email} <${d.email}>`))}`
        : null,
    ]),

    producto: block([
      kv('mode', prod.mode),
      kv('flags', `voz=${prod.flags.has_voz} chat=${prod.flags.has_chat} dash=${prod.flags.has_dash} pack=${prod.flags.has_pack}`),
      kv('dashboard_tier', prod.flags.dashboard_tier),
      kv('languages_count', prod.flags.languages_count),
      prod.contract_sections.length
        ? prod.contract_sections
            .map((s) => `\n### ${s.title}\n${bullet(s.items)}`)
            .join('\n')
        : '- Sin secciones de contrato',
      prod.custom
        ? block([
            '\n### Custom / a medida',
            kv('title', prod.custom.title),
            prod.custom.description ? `**Descripción:**\n${prod.custom.description}` : null,
            prod.custom.onboarding_notes
              ? `**Notas onboarding (config):**\n${prod.custom.onboarding_notes}`
              : null,
            prod.custom.scope_items
              ? `**Scope:**\n${Array.isArray(prod.custom.scope_items) ? bullet(prod.custom.scope_items.map(String)) : JSON.stringify(prod.custom.scope_items)}`
              : null,
            prod.custom.line_items
              ? `**Line items:**\n\`\`\`json\n${JSON.stringify(prod.custom.line_items, null, 2).slice(0, 4000)}\n\`\`\``
              : null,
            prod.custom.custom_questions
              ? `**Preguntas custom:**\n\`\`\`json\n${JSON.stringify(prod.custom.custom_questions, null, 2).slice(0, 3000)}\n\`\`\``
              : null,
          ])
        : null,
    ]),

    comercial: block([
      kv('setup_fee_eur', com.setup_fee_eur),
      kv('setup_total_from_config', com.setup_total_from_config),
      kv('monthly_fee_eur', com.monthly_fee_eur),
      kv('maint_plan', com.maint_plan),
      kv('pago_1', com.pay1),
      kv('pago_2', com.pay2),
    ]),

    tecnico: block([
      kv('retell_agent_id', tec.retell_agent_id),
      kv('twilio_number', tec.twilio_number),
      kv('whatsapp_number', tec.whatsapp_number),
      kv('ticket_callback_url', tec.ticket_callback_url),
      tec.stack_text ? `**Stack (onboarding):**\n${tec.stack_text}` : '- Stack: sin dato en CRM',
    ]),

    onboarding_dev: ob
      ? block([
          ob.summary ? `**Summary:**\n${ob.summary}` : null,
          ob.client_context ? `**Contexto cliente:**\n${ob.client_context}` : null,
          ob.scope_text ? `**Alcance:**\n${ob.scope_text}` : null,
          ob.deliverables ? `**Entregables:**\n${ob.deliverables}` : null,
          ob.contacts ? `**Contactos (dev):**\n${ob.contacts}` : null,
          ob.internal_notes ? `**Notas internas:**\n${ob.internal_notes}` : null,
          ob.docs.length
            ? `**Docs:**\n${bullet(ob.docs.map((d) => `${d.title} [${d.doc_type}] ${d.url || ''}`))}`
            : null,
        ]) || '- Onboarding vacío'
      : '- Sin onboarding de desarrollo en CRM',

    tareas: tasks
      ? block([
          `**Conteos:** ${Object.entries(tasks.counts)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ') || '0'}`,
          tasks.open_priority.length
            ? `\n**Abiertas (prioridad):**\n${tasks.open_priority
                .map(
                  (t) =>
                    `- [${t.priority}/${t.status}] ${t.title}${t.assignee ? ` → ${t.assignee}` : ''}${t.description ? `\n  ${t.description}` : ''}`
                )
                .join('\n')}`
            : '- Sin tareas abiertas',
          tasks.recent_done.length
            ? `\n**Recién hechas:**\n${bullet(tasks.recent_done.map((t) => `${t.title}${t.assignee ? ` (${t.assignee})` : ''}`))}`
            : null,
        ])
      : '- Sin tareas en CRM',

    soporte: tickets
      ? block([
          kv('tickets_abiertos_approx', tickets.open_count),
          tickets.recent.length
            ? tickets.recent
                .map(
                  (t) =>
                    `- [${t.priority}/${t.status}] ${t.title}${t.created_at ? ` (${t.created_at.slice(0, 10)})` : ''}${t.description ? `\n  ${t.description}` : ''}`
                )
                .join('\n')
            : '- Sin tickets',
        ])
      : '- Sin tickets en CRM',

    datos:
      '- Pendiente: explorar Postgres del cliente con list_tables → describe_table → run_select y documentar aquí.',

    metricas: bundle.metricas.latest
      ? `\`\`\`json\n${JSON.stringify(bundle.metricas.latest, null, 2).slice(0, 5000)}\n\`\`\``
      : '- Sin KPIs Engranaje5 todavía',

    operativa: block([
      '- Pendiente completar con el equipo: SLAs, qué mide éxito, tonos, flujos críticos.',
      id.lead.notas ? `**Pistas desde notas lead:** ${id.lead.notas.slice(0, 800)}` : null,
      ob?.internal_notes ? `**Pistas onboarding interno:** ${ob.internal_notes.slice(0, 800)}` : null,
      tickets && tickets.open_count > 0
        ? `- Hay ~${tickets.open_count} tickets abiertos — revisar temas recurrentes.`
        : null,
      tasks
        ? `- Tareas no done: ${Object.entries(tasks.counts)
            .filter(([k]) => k !== 'done')
            .reduce((a, [, n]) => a + n, 0)}`
        : null,
    ]),

    baseline_manual: block([
      '_Pendiente entrevista (skill roi_baseline). Documentar:_',
      '- **Proceso manual:** qué hacían antes (descripción)',
      '- **Tiempo:** horas/semana o mes; roles; nº de casos/mes; tiempo medio/caso',
      '- **Dinero:** €/hora o coste salarial; SaaS/telefonía/agencias previas (€/mes); pérdidas por errores (si aplica)',
      '- **Recursos:** nº personas (FTE/%), PCs/líneas/turnos, herramientas (Excel, centralita…)',
      '- Marcar cada cifra como **hecho** o **estimado**',
      com.monthly_fee_eur != null
        ? `\n_Referencia CRM:_ mensualidad Buffalo actual = ${com.monthly_fee_eur} €/mes (para contraste en sección 12).`
        : null,
    ]),

    roi_ahorro: block([
      '_Pendiente calcular tras rellenar sección 11._',
      '- Coste_manual_mes = …',
      '- Coste_buffalo_mes = … (usar mensualidad sección 3)',
      '- Ahorro_mes = …',
      '- Horas_ahorradas_mes = …',
      '- ROI anual % = … (mostrar fórmula)',
      '- Payback (meses) = …',
      '- Notas / supuestos = …',
    ]),

    fuentes: block([
      kv('collected_at', bundle.collected_at),
      `**OK:** ${bundle.sources_ok.join(', ') || '—'}`,
      `**Missing:** ${bundle.sources_missing.join(', ') || '—'}`,
    ]),
  }

  const body = KNOWLEDGE_SECTIONS.map((s) => {
    const content = sections[s.id] || '- Sin dato'
    return `## ${s.title}\n\n${content}`
  }).join('\n\n')

  return `# ${KNOWLEDGE_DOC_TITLE} — ${id.name}\n\n_Seed automático desde CRM (${bundle.collected_at}). El agente debe enriquecerlo con entrevista ROI (secciones 11–12), operativa y Postgres._\n\n${body}\n`
}

/** Extrae el cuerpo de una sección ## del documento de conocimiento. */
export function extractKnowledgeSection(doc: string, sectionTitle: string): string | null {
  const re = new RegExp(
    `##\\s*${escapeRegex(sectionTitle)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    'i'
  )
  const m = doc.match(re)
  return m ? m[1].trim() : null
}

/** Sustituye o inserta una sección completa en el documento. */
export function upsertKnowledgeSection(
  doc: string,
  sectionTitle: string,
  newBody: string
): string {
  const heading = `## ${sectionTitle}`
  const re = new RegExp(
    `##\\s*${escapeRegex(sectionTitle)}\\s*\\n[\\s\\S]*?(?=\\n##\\s+|$)`,
    'i'
  )
  const blockText = `${heading}\n\n${newBody.trim()}\n`
  if (re.test(doc)) {
    return doc.replace(re, blockText)
  }
  const trimmed = doc.trim()
  if (!trimmed) {
    return `# ${KNOWLEDGE_DOC_TITLE}\n\n${blockText}`
  }
  return `${trimmed}\n\n${blockText}`
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
