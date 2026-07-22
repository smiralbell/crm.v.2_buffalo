import { prisma } from '@/lib/prisma'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import { buildContractSummary } from '@/lib/engranaje5/contract-summary'
import type { ProyectoRow } from '@/lib/engranaje5/project-services'
import type { KnowledgeSectionId } from './template'

function trunc(s: string | null | undefined, max: number): string | null {
  if (!s?.trim()) return null
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null
  try {
    return new Date(d).toISOString()
  } catch {
    return null
  }
}

export type CrmKnowledgeBundle = {
  collected_at: string
  sources_ok: string[]
  sources_missing: string[]
  identidad: {
    proyecto_id: string
    name: string
    service_type: string
    status: string
    es_buffalo: boolean
    has_mensualidad: boolean
    config_ref: string | null
    lead_id: number | null
    contact_id: number | null
    timeline: {
      created_at: string | null
      launched_at: string | null
      tiempo_previsto: string | null
      fecha_inicio_real: string | null
      fecha_fin_real: string | null
      dev_target_end_date: string | null
    }
    contact: {
      nombre: string | null
      empresa: string | null
      email: string | null
      telefono: string | null
    }
    lead: {
      estado: string | null
      notas: string | null
      origen: string | null
    }
  }
  producto: {
    mode: string | null
    contract_sections: Array<{ title: string; items: string[] }>
    custom: {
      title: string | null
      description: string | null
      scope_items: unknown
      onboarding_notes: string | null
      line_items: unknown
      custom_questions: unknown
    } | null
    flags: {
      has_voz: boolean
      has_chat: boolean
      has_dash: boolean
      has_pack: boolean
      dashboard_tier: string | null
      languages_count: number | null
    }
  }
  comercial: {
    setup_fee_eur: number | null
    monthly_fee_eur: number | null
    maint_plan: string | null
    pay1: number | null
    pay2: number | null
    setup_total_from_config: number | null
  }
  tecnico: {
    retell_agent_id: string | null
    twilio_number: string | null
    whatsapp_number: string | null
    ticket_callback_url: string | null
    stack_text: string | null
  }
  onboarding_dev: {
    summary: string | null
    client_context: string | null
    scope_text: string | null
    stack_text: string | null
    deliverables: string | null
    contacts: string | null
    internal_notes: string | null
    docs: Array<{ title: string; doc_type: string; url: string | null }>
  } | null
  tareas: {
    counts: Record<string, number>
    open_priority: Array<{
      title: string
      status: string
      priority: string
      assignee: string | null
      description: string | null
    }>
    recent_done: Array<{ title: string; assignee: string | null }>
  } | null
  soporte: {
    open_count: number
    recent: Array<{
      title: string
      status: string
      priority: string
      description: string | null
      created_at: string | null
    }>
  } | null
  metricas: {
    latest: Record<string, unknown> | null
  }
  developers: Array<{ email: string; name: string | null }>
}

type ProyectoFull = ProyectoRow & {
  es_buffalo?: boolean | null
  created_at?: Date | string | null
  tiempo_previsto?: string | Date | null
  fecha_inicio_real?: string | Date | null
  fecha_fin_real?: string | Date | null
  dev_target_end_date?: string | Date | null
  retell_agent_id?: string | null
  twilio_number?: string | null
  whatsapp_number?: string | null
  ticket_callback_url?: string | null
}

/** Recoge todo el conocimiento CRM disponible para un proyecto de retención. */
export async function collectCrmKnowledge(proyectoId: string): Promise<CrmKnowledgeBundle> {
  const sources_ok: string[] = []
  const sources_missing: string[] = []
  const collected_at = new Date().toISOString()

  const rows = await prisma.$queryRaw<ProyectoFull[]>`
    SELECT
      id::text AS id,
      name,
      service_type,
      status,
      config_ref,
      setup_fee_eur::float8 AS setup_fee_eur,
      monthly_fee_eur::float8 AS monthly_fee_eur,
      maint_plan,
      COALESCE(has_mensualidad, false) AS has_mensualidad,
      has_voz, has_chat, has_dash, has_pack,
      launched_at,
      lead_id,
      contact_id,
      dashboard_tier,
      COALESCE(addon_outbound, false) AS addon_outbound,
      COALESCE(addon_transcription, false) AS addon_transcription,
      COALESCE(addon_cloned_voice, false) AS addon_cloned_voice,
      COALESCE(addon_human_transfer, false) AS addon_human_transfer,
      COALESCE(addon_email_summary, false) AS addon_email_summary,
      COALESCE(addon_whatsapp, false) AS addon_whatsapp,
      COALESCE(addon_web_widget, false) AS addon_web_widget,
      COALESCE(addon_form_trigger, false) AS addon_form_trigger,
      COALESCE(addon_multimodal, false) AS addon_multimodal,
      languages_count,
      COALESCE(es_buffalo, false) AS es_buffalo,
      created_at
    FROM proyectos
    WHERE id = ${proyectoId}::uuid
    LIMIT 1
  `

  const p = rows[0]
  if (!p) throw new Error('Proyecto no encontrado')

  sources_ok.push('proyectos')

  // Columnas técnicas / timeline opcionales (DBs con migraciones incompletas)
  try {
    const extra = await prisma.$queryRaw<
      {
        retell_agent_id: string | null
        twilio_number: string | null
        whatsapp_number: string | null
        ticket_callback_url: string | null
        tiempo_previsto: string | null
        fecha_inicio_real: Date | null
        fecha_fin_real: Date | null
        addon_crm_integration: boolean | null
        addon_voice_in_chat: boolean | null
      }[]
    >`
      SELECT
        retell_agent_id, twilio_number, whatsapp_number, ticket_callback_url,
        tiempo_previsto::text AS tiempo_previsto,
        fecha_inicio_real, fecha_fin_real,
        addon_crm_integration, addon_voice_in_chat
      FROM proyectos WHERE id = ${proyectoId}::uuid LIMIT 1
    `
    if (extra[0]) {
      Object.assign(p, extra[0])
      sources_ok.push('proyectos_tech')
    }
  } catch {
    sources_missing.push('proyectos_tech')
  }

  let configuracion: string | null = null
  let leadEstado: string | null = null
  let leadNotas: string | null = null
  let leadOrigen: string | null = null
  let contact = {
    nombre: null as string | null,
    empresa: null as string | null,
    email: null as string | null,
    telefono: null as string | null,
  }

  if (p.lead_id) {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: p.lead_id },
        select: {
          estado: true,
          notas: true,
          origen_principal: true,
          configuracion: true,
          contact: {
            select: { nombre: true, empresa: true, email: true, telefono: true },
          },
        },
      })
      if (lead) {
        sources_ok.push('leads', 'contacts')
        configuracion = lead.configuracion
        leadEstado = lead.estado
        leadNotas = trunc(lead.notas, 4000)
        leadOrigen = lead.origen_principal
        contact = {
          nombre: lead.contact?.nombre ?? null,
          empresa: lead.contact?.empresa ?? null,
          email: lead.contact?.email ?? null,
          telefono: lead.contact?.telefono ?? null,
        }
      } else {
        sources_missing.push('leads')
      }
    } catch {
      sources_missing.push('leads')
    }
  } else {
    sources_missing.push('leads')
  }

  // contact_id directo si no vino por lead
  if (!contact.nombre && p.contact_id) {
    try {
      const c = await prisma.contact.findUnique({
        where: { id: p.contact_id },
        select: { nombre: true, empresa: true, email: true, telefono: true },
      })
      if (c) {
        sources_ok.push('contacts')
        contact = {
          nombre: c.nombre,
          empresa: c.empresa,
          email: c.email,
          telefono: c.telefono,
        }
      }
    } catch {
      // ignore
    }
  }

  const cfg = parseConfiguradorConfig(configuracion)
  if (cfg) sources_ok.push('configuracion_parsed')
  else if (configuracion) sources_missing.push('configuracion_parsed')
  else sources_missing.push('configuracion')

  const contract = buildContractSummary(p as ProyectoRow, configuracion, {
    notas: leadNotas,
    languagesCount: p.languages_count ?? null,
  })

  let onboarding_dev: CrmKnowledgeBundle['onboarding_dev'] = null
  try {
    const ob = await prisma.$queryRaw<
      {
        summary: string | null
        client_context: string | null
        scope_text: string | null
        stack_text: string | null
        deliverables: string | null
        contacts: string | null
        internal_notes: string | null
      }[]
    >`
      SELECT summary, client_context, scope_text, stack_text, deliverables, contacts, internal_notes
      FROM project_dev_onboarding WHERE project_id = ${proyectoId}::uuid LIMIT 1
    `
    if (ob[0]) {
      sources_ok.push('project_dev_onboarding')
      let docs: Array<{ title: string; doc_type: string; url: string | null }> = []
      try {
        docs = await prisma.$queryRaw`
          SELECT title, doc_type, url
          FROM project_dev_onboarding_docs
          WHERE project_id = ${proyectoId}::uuid
          ORDER BY created_at DESC
          LIMIT 30
        `
        if (docs.length) sources_ok.push('project_dev_onboarding_docs')
      } catch {
        sources_missing.push('project_dev_onboarding_docs')
      }
      onboarding_dev = {
        summary: trunc(ob[0].summary, 3000),
        client_context: trunc(ob[0].client_context, 3000),
        scope_text: trunc(ob[0].scope_text, 4000),
        stack_text: trunc(ob[0].stack_text, 2000),
        deliverables: trunc(ob[0].deliverables, 3000),
        contacts: trunc(ob[0].contacts, 1500),
        internal_notes: trunc(ob[0].internal_notes, 3000),
        docs: docs.map((d) => ({
          title: d.title,
          doc_type: d.doc_type,
          url: d.url,
        })),
      }
    } else {
      sources_missing.push('project_dev_onboarding')
    }
  } catch {
    sources_missing.push('project_dev_onboarding')
  }

  let tareas: CrmKnowledgeBundle['tareas'] = null
  try {
    const taskRows = await prisma.$queryRaw<
      {
        title: string
        description: string | null
        status: string
        priority: string
        assignee: string | null
      }[]
    >`
      SELECT title, description, status, priority, assignee
      FROM project_dev_tasks
      WHERE project_id = ${proyectoId}::uuid
      ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        position NULLS LAST,
        created_at
    `
    sources_ok.push('project_dev_tasks')
    const counts: Record<string, number> = {}
    for (const t of taskRows) {
      counts[t.status] = (counts[t.status] || 0) + 1
    }
    const open = taskRows.filter((t) => t.status !== 'done')
    tareas = {
      counts,
      open_priority: open.slice(0, 25).map((t) => ({
        title: t.title,
        status: t.status,
        priority: t.priority,
        assignee: t.assignee,
        description: trunc(t.description, 400),
      })),
      recent_done: taskRows
        .filter((t) => t.status === 'done')
        .slice(-10)
        .map((t) => ({ title: t.title, assignee: t.assignee })),
    }
  } catch {
    sources_missing.push('project_dev_tasks')
  }

  let soporte: CrmKnowledgeBundle['soporte'] = null
  try {
    const tickets = await prisma.$queryRaw<
      {
        title: string
        status: string
        priority: string
        description: string | null
        created_at: Date
      }[]
    >`
      SELECT title, status, priority, description, created_at
      FROM tickets
      WHERE project_id = ${proyectoId}::uuid
      ORDER BY created_at DESC
      LIMIT 40
    `
    sources_ok.push('tickets')
    const openStatuses = new Set(['open', 'pending', 'in_progress', 'waiting', 'new'])
    soporte = {
      open_count: tickets.filter((t) => openStatuses.has(String(t.status).toLowerCase())).length,
      recent: tickets.slice(0, 20).map((t) => ({
        title: t.title,
        status: t.status,
        priority: t.priority,
        description: trunc(t.description, 350),
        created_at: iso(t.created_at),
      })),
    }
  } catch {
    sources_missing.push('tickets')
  }

  let metricasLatest: Record<string, unknown> | null = null
  try {
    const kpis = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM engranaje5_kpis
      WHERE project_id = ${proyectoId}::uuid
      ORDER BY year DESC, month DESC
      LIMIT 1
    `
    if (kpis[0]) {
      sources_ok.push('engranaje5_kpis')
      metricasLatest = kpis[0]
    } else {
      sources_missing.push('engranaje5_kpis')
    }
  } catch {
    sources_missing.push('engranaje5_kpis')
  }

  let developers: CrmKnowledgeBundle['developers'] = []
  try {
    developers = await prisma.$queryRaw`
      SELECT u.email, u.name
      FROM crm_user_projects cup
      JOIN crm_users u ON u.id = cup.user_id
      WHERE cup.project_id = ${proyectoId}::uuid
    `
    if (developers.length) sources_ok.push('crm_user_projects')
    else sources_missing.push('crm_user_projects')
  } catch {
    sources_missing.push('crm_user_projects')
  }

  // try optional column
  let devTarget: string | null = null
  try {
    const d = await prisma.$queryRaw<{ dev_target_end_date: Date | null }[]>`
      SELECT dev_target_end_date FROM proyectos WHERE id = ${proyectoId}::uuid LIMIT 1
    `
    devTarget = iso(d[0]?.dev_target_end_date)
  } catch {
    // optional
  }

  return {
    collected_at,
    sources_ok: Array.from(new Set(sources_ok)),
    sources_missing: Array.from(new Set(sources_missing)),
    identidad: {
      proyecto_id: String(p.id),
      name: p.name,
      service_type: p.service_type,
      status: p.status,
      es_buffalo: Boolean(p.es_buffalo),
      has_mensualidad: Boolean(p.has_mensualidad),
      config_ref: p.config_ref,
      lead_id: p.lead_id,
      contact_id: p.contact_id,
      timeline: {
        created_at: iso(p.created_at),
        launched_at: iso(p.launched_at),
        tiempo_previsto: p.tiempo_previsto ? String(p.tiempo_previsto) : null,
        fecha_inicio_real: iso(p.fecha_inicio_real),
        fecha_fin_real: iso(p.fecha_fin_real),
        dev_target_end_date: devTarget,
      },
      contact,
      lead: {
        estado: leadEstado,
        notas: leadNotas,
        origen: leadOrigen,
      },
    },
    producto: {
      mode: cfg?.mode ?? null,
      contract_sections: contract.sections
        .filter((s) => s.active)
        .map((s) => ({ title: s.title, items: s.items })),
      custom: cfg
        ? {
            title: cfg.title ?? null,
            description: trunc(cfg.description, 3000),
            scope_items: cfg.scope_items ?? null,
            onboarding_notes: trunc(cfg.onboarding_notes, 3000),
            line_items: cfg.line_items ?? null,
            custom_questions: cfg.custom_questions ?? null,
          }
        : null,
      flags: {
        has_voz: Boolean(p.has_voz),
        has_chat: Boolean(p.has_chat),
        has_dash: Boolean(p.has_dash),
        has_pack: Boolean(p.has_pack),
        dashboard_tier: p.dashboard_tier,
        languages_count: p.languages_count ?? null,
      },
    },
    comercial: {
      setup_fee_eur: p.setup_fee_eur,
      monthly_fee_eur: p.monthly_fee_eur,
      maint_plan: p.maint_plan,
      pay1: contract.pay1,
      pay2: contract.pay2,
      setup_total_from_config: contract.setupTotal,
    },
    tecnico: {
      retell_agent_id: p.retell_agent_id ?? null,
      twilio_number: p.twilio_number ?? null,
      whatsapp_number: p.whatsapp_number ?? null,
      ticket_callback_url: p.ticket_callback_url ?? null,
      stack_text: onboarding_dev?.stack_text ?? null,
    },
    onboarding_dev,
    tareas,
    soporte,
    metricas: { latest: metricasLatest },
    developers,
  }
}

export type CrmSourceKey =
  | 'all'
  | KnowledgeSectionId
  | 'bundle'

export function pickCrmSection(
  bundle: CrmKnowledgeBundle,
  section: string
): unknown {
  switch (section) {
    case 'identidad':
      return bundle.identidad
    case 'producto':
      return bundle.producto
    case 'comercial':
      return bundle.comercial
    case 'tecnico':
      return bundle.tecnico
    case 'onboarding_dev':
      return bundle.onboarding_dev
    case 'tareas':
      return bundle.tareas
    case 'soporte':
      return bundle.soporte
    case 'metricas':
      return bundle.metricas
    case 'datos':
      return {
        note: 'Schema Postgres del cliente se obtiene con list_tables / describe_table / run_select',
      }
    case 'operativa':
      return {
        lead_notas: bundle.identidad.lead.notas,
        onboarding_notes: bundle.producto.custom?.onboarding_notes ?? null,
        internal_notes: bundle.onboarding_dev?.internal_notes ?? null,
        open_tickets: bundle.soporte?.open_count ?? 0,
        open_tasks: bundle.tareas
          ? Object.entries(bundle.tareas.counts)
              .filter(([k]) => k !== 'done')
              .reduce((a, [, n]) => a + n, 0)
          : 0,
      }
    case 'baseline_manual':
      return {
        note: 'Rellenar en entrevista: tiempo, dinero y recursos del proceso manual previo.',
        monthly_fee_buffalo_eur: bundle.comercial.monthly_fee_eur,
        setup_fee_eur: bundle.comercial.setup_fee_eur,
      }
    case 'roi_ahorro':
      return {
        note: 'Calcular tras baseline_manual vs coste Buffalo (comercial).',
        monthly_fee_buffalo_eur: bundle.comercial.monthly_fee_eur,
        setup_fee_eur: bundle.comercial.setup_fee_eur,
      }
    case 'fuentes':
      return {
        collected_at: bundle.collected_at,
        sources_ok: bundle.sources_ok,
        sources_missing: bundle.sources_missing,
      }
    case 'all':
    case 'bundle':
    default:
      return bundle
  }
}
