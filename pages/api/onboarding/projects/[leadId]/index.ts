import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncProyectoFromLead } from '@/lib/engranaje5/sync-proyecto'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import { mergeLeadConfig } from '@/lib/onboarding/project-context-ai'

const SERVICE_TYPES = [
  'voice_agent',
  'text_agent',
  'dashboard_app',
  'automation',
  'lead_gen',
  'geo_seo',
  'audit',
] as const

const STATUSES = ['development', 'active', 'paused', 'churned'] as const

const patchSchema = z.object({
  es_buffalo: z.boolean().optional(),
  name: z.string().min(1).optional(),
  status: z.enum(STATUSES).optional(),
  service_type: z.enum(SERVICE_TYPES).optional(),
  setup_fee_eur: z.number().nullable().optional(),
  monthly_fee_eur: z.number().nullable().optional(),
  has_mensualidad: z.boolean().optional(),
  maint_plan: z.string().nullable().optional(),
  has_voz: z.boolean().optional(),
  has_chat: z.boolean().optional(),
  has_dash: z.boolean().optional(),
  has_pack: z.boolean().optional(),
  dashboard_tier: z.string().nullable().optional(),
  languages_count: z.number().int().min(1).optional(),
  retell_agent_id: z.string().nullable().optional(),
  twilio_number: z.string().nullable().optional(),
  whatsapp_number: z.string().nullable().optional(),
  addon_outbound: z.boolean().optional(),
  addon_crm_integration: z.boolean().optional(),
  addon_human_transfer: z.boolean().optional(),
  addon_email_summary: z.boolean().optional(),
  addon_transcription: z.boolean().optional(),
  addon_cloned_voice: z.boolean().optional(),
  addon_whatsapp: z.boolean().optional(),
  addon_web_widget: z.boolean().optional(),
  addon_form_trigger: z.boolean().optional(),
  addon_multimodal: z.boolean().optional(),
  addon_voice_in_chat: z.boolean().optional(),
  // Contacto / lead
  contact_id: z.number().int().positive().optional(),
  contact_nombre: z.string().optional(),
  contact_email: z.string().optional(),
  contact_empresa: z.string().optional(),
  contact_telefono: z.string().optional(),
  contact_ciudad: z.string().optional(),
  lead_valor: z.number().nullable().optional(),
  lead_estado: z.string().optional(),
  lead_notas: z.string().nullable().optional(),
  /** Definición / descripción del proyecto (se guarda en lead.notas + config.description) */
  project_definition: z.string().nullable().optional(),
  /** Contexto bruto (auditoría, reuniones, notas). Si se envía aquí no regenera IA. */
  project_context: z.string().nullable().optional(),
  /** Duración estimada o fecha prevista, ej. "2026-08-01" o "4 semanas" */
  tiempo_previsto: z.string().nullable().optional(),
  /** YYYY-MM-DD o null */
  fecha_inicio_real: z.string().nullable().optional(),
  /** YYYY-MM-DD o null (= aún no ha terminado) */
  fecha_fin_real: z.string().nullable().optional(),
})

function parseDateOrNull(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v.trim() === '') return null
  const d = new Date(`${v.trim()}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function dateToYmd(v: Date | string | null | undefined): string | null {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

type ProyectoRow = {
  id: string
  name: string
  service_type: string
  status: string
  es_buffalo: boolean
  setup_fee_eur: number | null
  monthly_fee_eur: number | null
  has_mensualidad: boolean
  maint_plan: string | null
  has_voz: boolean
  has_chat: boolean
  has_dash: boolean
  has_pack: boolean
  dashboard_tier: string | null
  languages_count: number
  retell_agent_id: string | null
  twilio_number: string | null
  whatsapp_number: string | null
  addon_outbound: boolean
  addon_crm_integration: boolean
  addon_human_transfer: boolean
  addon_email_summary: boolean
  addon_transcription: boolean
  addon_cloned_voice: boolean
  addon_whatsapp: boolean
  addon_web_widget: boolean
  addon_form_trigger: boolean
  addon_multimodal: boolean
  addon_voice_in_chat: boolean
  lead_id: number | null
  contact_id: number | null
  config_ref: string | null
  tiempo_previsto: string | null
  fecha_inicio_real: Date | string | null
  fecha_fin_real: Date | string | null
}

function serializeProyecto(row: ProyectoRow | null) {
  if (!row) return null
  return {
    ...row,
    fecha_inicio_real: dateToYmd(row.fecha_inicio_real),
    fecha_fin_real: dateToYmd(row.fecha_fin_real),
  }
}

async function getProyectoByLead(leadId: number) {
  const rows = await prisma.$queryRaw<ProyectoRow[]>`
    SELECT
      id, name, service_type, status, es_buffalo,
      setup_fee_eur::float8 AS setup_fee_eur,
      monthly_fee_eur::float8 AS monthly_fee_eur,
      has_mensualidad, maint_plan, has_voz, has_chat, has_dash, has_pack,
      dashboard_tier, languages_count,
      retell_agent_id, twilio_number, whatsapp_number,
      addon_outbound, addon_crm_integration, addon_human_transfer, addon_email_summary,
      addon_transcription, addon_cloned_voice, addon_whatsapp, addon_web_widget,
      addon_form_trigger, addon_multimodal, addon_voice_in_chat,
      lead_id, contact_id, config_ref,
      tiempo_previsto, fecha_inicio_real, fecha_fin_real
    FROM proyectos
    WHERE lead_id = ${leadId}
    LIMIT 1
  `
  return rows[0] ?? null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)

    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' })
    }

    if (req.method === 'GET') {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          contact: {
            select: {
              id: true,
              nombre: true,
              email: true,
              empresa: true,
              telefono: true,
              ciudad: true,
              direccion_fiscal: true,
              cif: true,
            },
          },
        },
      })
      if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

      const proyecto = await getProyectoByLead(leadId)
      const cfg = parseConfiguradorConfig(lead.configuracion)
      const definition = (cfg?.description || lead.notas || '').trim() || null
      const context = (cfg?.project_context || '').trim() || null
      return res.status(200).json({
        lead: {
          id: lead.id,
          estado: lead.estado,
          valor: lead.valor != null ? Number(lead.valor) : null,
          notas: lead.notas,
          configuracion: lead.configuracion,
          contact: lead.contact,
        },
        proyecto: serializeProyecto(proyecto),
        project_definition: definition,
        project_context: context,
        proposal_draft: (cfg?.proposal_draft || '').trim() || null,
        proposal_status: cfg?.proposal_status === 'sent' ? 'sent' : 'draft',
        proposal_sent_at: cfg?.proposal_sent_at || null,
        contract_draft: (cfg?.contract_draft || '').trim() || null,
        contract_status: cfg?.contract_status === 'sent' ? 'sent' : 'draft',
        contract_sent_at: cfg?.contract_sent_at || null,
        pre_kickoff_draft: (cfg?.pre_kickoff_draft || '').trim() || null,
        linked_invoices: cfg?.linked_invoices || [],
      })
    }

    if (req.method === 'PATCH') {
      const data = patchSchema.parse(req.body)
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true, contact_id: true, configuracion: true },
      })
      if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

      let activeContactId = lead.contact_id

      // Marcar / desmarcar como proyecto Buffalo
      if (data.es_buffalo === true) {
        if (!lead.configuracion) {
          return res.status(400).json({ error: 'El lead no tiene configuración de proyecto' })
        }
        await syncProyectoFromLead({ leadId })
        await prisma.$executeRaw`
          UPDATE proyectos
          SET
            es_buffalo = TRUE,
            status = CASE WHEN status = 'churned' THEN 'development' ELSE status END,
            launched_at = COALESCE(launched_at, CURRENT_DATE),
            updated_at = NOW()
          WHERE lead_id = ${leadId}
        `
      } else if (data.es_buffalo === false) {
        await prisma.$executeRaw`
          UPDATE proyectos
          SET es_buffalo = FALSE, updated_at = NOW()
          WHERE lead_id = ${leadId}
        `
      }

      const fieldUpdates = { ...data }
      delete (fieldUpdates as { es_buffalo?: boolean }).es_buffalo

      // Reasignar lead a otro contacto (1 lead por contact_id)
      if (data.contact_id !== undefined && data.contact_id !== activeContactId) {
        const target = await prisma.contact.findUnique({
          where: { id: data.contact_id },
          select: { id: true },
        })
        if (!target) {
          return res.status(404).json({ error: 'Cliente no encontrado' })
        }
        const otherLead = await prisma.lead.findUnique({
          where: { contact_id: data.contact_id },
          select: { id: true },
        })
        if (otherLead && otherLead.id !== leadId) {
          return res.status(409).json({
            error: 'Ese cliente ya tiene otro lead. Elige otro o créalo nuevo.',
          })
        }
        await prisma.lead.update({
          where: { id: leadId },
          data: { contact_id: data.contact_id },
        })
        await prisma.$executeRaw`
          UPDATE proyectos
          SET contact_id = ${data.contact_id}, updated_at = NOW()
          WHERE lead_id = ${leadId}
        `
        activeContactId = data.contact_id
      }

      const contactPatch: Record<string, string | undefined> = {}
      if (data.contact_nombre !== undefined) contactPatch.nombre = data.contact_nombre
      if (data.contact_email !== undefined) contactPatch.email = data.contact_email
      if (data.contact_empresa !== undefined) contactPatch.empresa = data.contact_empresa
      if (data.contact_telefono !== undefined) contactPatch.telefono = data.contact_telefono
      if (data.contact_ciudad !== undefined) contactPatch.ciudad = data.contact_ciudad

      if (Object.keys(contactPatch).length && activeContactId) {
        await prisma.contact.update({
          where: { id: activeContactId },
          data: {
            ...(contactPatch.nombre !== undefined ? { nombre: contactPatch.nombre } : {}),
            ...(contactPatch.email !== undefined
              ? { email: contactPatch.email.trim() === '' ? null : contactPatch.email.trim() }
              : {}),
            ...(contactPatch.empresa !== undefined ? { empresa: contactPatch.empresa || null } : {}),
            ...(contactPatch.telefono !== undefined ? { telefono: contactPatch.telefono || null } : {}),
            ...(contactPatch.ciudad !== undefined ? { ciudad: contactPatch.ciudad || null } : {}),
          },
        })
      }

      const leadPatch: Record<string, unknown> = {}
      if (data.lead_valor !== undefined) leadPatch.valor = data.lead_valor
      if (data.setup_fee_eur !== undefined && data.lead_valor === undefined) {
        leadPatch.valor = data.setup_fee_eur
      }
      if (data.lead_estado !== undefined) leadPatch.estado = data.lead_estado
      if (data.lead_notas !== undefined) leadPatch.notas = data.lead_notas
      if (data.project_definition !== undefined) leadPatch.notas = data.project_definition

      // Persist context / definition inside configuracion JSON
      if (data.project_definition !== undefined || data.project_context !== undefined) {
        const { encoded } = mergeLeadConfig(lead.configuracion, {
          ...(data.project_definition !== undefined
            ? { description: data.project_definition?.trim() || undefined }
            : {}),
          ...(data.project_context !== undefined
            ? { project_context: data.project_context?.trim() || undefined }
            : {}),
        })
        leadPatch.configuracion = encoded
      }

      if (Object.keys(leadPatch).length) {
        await prisma.lead.update({ where: { id: leadId }, data: leadPatch })
      }

      // Campos del proyecto Buffalo
      const proyectoKeys = [
        'name',
        'status',
        'service_type',
        'setup_fee_eur',
        'monthly_fee_eur',
        'has_mensualidad',
        'maint_plan',
        'has_voz',
        'has_chat',
        'has_dash',
        'has_pack',
        'dashboard_tier',
        'languages_count',
        'retell_agent_id',
        'twilio_number',
        'whatsapp_number',
        'addon_outbound',
        'addon_crm_integration',
        'addon_human_transfer',
        'addon_email_summary',
        'addon_transcription',
        'addon_cloned_voice',
        'addon_whatsapp',
        'addon_web_widget',
        'addon_form_trigger',
        'addon_multimodal',
        'addon_voice_in_chat',
        'tiempo_previsto',
        'fecha_inicio_real',
        'fecha_fin_real',
      ] as const

      const hasProyectoFields = proyectoKeys.some((k) => data[k] !== undefined)
      if (hasProyectoFields) {
        let proyecto = await getProyectoByLead(leadId)
        if (!proyecto && lead.configuracion) {
          await syncProyectoFromLead({ leadId })
          proyecto = await getProyectoByLead(leadId)
        }
        if (!proyecto) {
          // Contacto/lead ya se actualizaron; sin config no hay fila proyectos.
          const updated = await getProyectoByLead(leadId)
          return res.status(200).json({
            success: true,
            proyecto: serializeProyecto(updated),
            warning: 'Datos de cliente/lead guardados; no hay proyecto Buffalo vinculado',
          })
        }

        const fechaInicio = parseDateOrNull(data.fecha_inicio_real)
        const fechaFin = parseDateOrNull(data.fecha_fin_real)
        const tiempoPrevisto =
          data.tiempo_previsto === undefined
            ? undefined
            : data.tiempo_previsto?.trim()
              ? data.tiempo_previsto.trim()
              : null

        await prisma.$executeRaw`
          UPDATE proyectos SET
            name = COALESCE(${data.name ?? null}, name),
            status = COALESCE(${data.status ?? null}, status),
            service_type = COALESCE(${data.service_type ?? null}, service_type),
            setup_fee_eur = CASE WHEN ${data.setup_fee_eur !== undefined} THEN ${data.setup_fee_eur} ELSE setup_fee_eur END,
            monthly_fee_eur = CASE WHEN ${data.monthly_fee_eur !== undefined} THEN ${data.monthly_fee_eur} ELSE monthly_fee_eur END,
            has_mensualidad = COALESCE(${data.has_mensualidad ?? null}, has_mensualidad),
            maint_plan = CASE WHEN ${data.maint_plan !== undefined} THEN ${data.maint_plan} ELSE maint_plan END,
            has_voz = COALESCE(${data.has_voz ?? null}, has_voz),
            has_chat = COALESCE(${data.has_chat ?? null}, has_chat),
            has_dash = COALESCE(${data.has_dash ?? null}, has_dash),
            has_pack = COALESCE(${data.has_pack ?? null}, has_pack),
            dashboard_tier = CASE WHEN ${data.dashboard_tier !== undefined} THEN ${data.dashboard_tier} ELSE dashboard_tier END,
            languages_count = COALESCE(${data.languages_count ?? null}, languages_count),
            retell_agent_id = CASE WHEN ${data.retell_agent_id !== undefined} THEN ${data.retell_agent_id} ELSE retell_agent_id END,
            twilio_number = CASE WHEN ${data.twilio_number !== undefined} THEN ${data.twilio_number} ELSE twilio_number END,
            whatsapp_number = CASE WHEN ${data.whatsapp_number !== undefined} THEN ${data.whatsapp_number} ELSE whatsapp_number END,
            addon_outbound = COALESCE(${data.addon_outbound ?? null}, addon_outbound),
            addon_crm_integration = COALESCE(${data.addon_crm_integration ?? null}, addon_crm_integration),
            addon_human_transfer = COALESCE(${data.addon_human_transfer ?? null}, addon_human_transfer),
            addon_email_summary = COALESCE(${data.addon_email_summary ?? null}, addon_email_summary),
            addon_transcription = COALESCE(${data.addon_transcription ?? null}, addon_transcription),
            addon_cloned_voice = COALESCE(${data.addon_cloned_voice ?? null}, addon_cloned_voice),
            addon_whatsapp = COALESCE(${data.addon_whatsapp ?? null}, addon_whatsapp),
            addon_web_widget = COALESCE(${data.addon_web_widget ?? null}, addon_web_widget),
            addon_form_trigger = COALESCE(${data.addon_form_trigger ?? null}, addon_form_trigger),
            addon_multimodal = COALESCE(${data.addon_multimodal ?? null}, addon_multimodal),
            addon_voice_in_chat = COALESCE(${data.addon_voice_in_chat ?? null}, addon_voice_in_chat),
            tiempo_previsto = CASE
              WHEN ${tiempoPrevisto !== undefined} THEN ${tiempoPrevisto ?? null}
              ELSE tiempo_previsto
            END,
            fecha_inicio_real = CASE
              WHEN ${fechaInicio !== undefined} THEN ${fechaInicio ?? null}::date
              ELSE fecha_inicio_real
            END,
            fecha_fin_real = CASE
              WHEN ${fechaFin !== undefined} THEN ${fechaFin ?? null}::date
              ELSE fecha_fin_real
            END,
            launched_at = CASE
              WHEN ${fechaInicio !== undefined} THEN ${fechaInicio ?? null}::date
              ELSE launched_at
            END,
            updated_at = NOW()
          WHERE id = ${proyecto.id}::uuid
        `
      }

      const updated = await getProyectoByLead(leadId)
      return res.status(200).json({ success: true, proyecto: serializeProyecto(updated) })
    }

    if (req.method === 'DELETE') {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true, configuracion: true },
      })
      if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

      await prisma.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id: leadId },
          data: { configuracion: null },
        })

        await tx.$executeRaw`
          UPDATE proyectos
          SET
            status = 'churned',
            es_buffalo = FALSE,
            lead_id = NULL,
            config_ref = NULL,
            updated_at = NOW()
          WHERE lead_id = ${leadId}
        `
      })

      return res.status(200).json({ success: true, lead_id: leadId })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }
    console.error('[onboarding/projects]', error)
    return res.status(500).json({ error: 'Error en el proyecto de onboarding' })
  }
}
