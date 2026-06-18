import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveProjectServices, type ProyectoRow } from '@/lib/engranaje5/project-services'
import { buildDefaultKpiLayout, type KpiItem } from '@/lib/engranaje5/kpi-layout'
import { buildContractSummary } from '@/lib/engranaje5/contract-summary'

type DbProyecto = {
  id: string
  name: string
  service_type: string
  status: string
  config_ref: string | null
  setup_fee_eur: string | number | null
  monthly_fee_eur: string | number | null
  maint_plan: string | null
  has_mensualidad: boolean
  has_voz: boolean | null
  has_chat: boolean | null
  has_dash: boolean | null
  has_pack: boolean | null
  launched_at: Date | string | null
  lead_id: number | null
  contact_id: number | null
  dashboard_tier: string | null
  addon_outbound: boolean
  addon_transcription: boolean
  addon_cloned_voice: boolean
  addon_human_transfer: boolean
  addon_email_summary: boolean
  addon_whatsapp: boolean
  addon_web_widget: boolean
  addon_form_trigger: boolean
  addon_multimodal: boolean
  addon_crm_integration?: boolean
  addon_voice_in_chat?: boolean
  languages_count?: number | null
}

type DbKpi = {
  kpi_key: string
  kpi_label: string
  kpi_category: string
  kpi_value: string | number | null
  kpi_unit: string | null
  kpi_value_label: string | null
  chart_type: string
  is_star_kpi: boolean
  visible_dashboard: boolean
  trend_vs_prev_month: string | number | null
  trend_direction: string | null
  year: number
  month: number
}

type PeriodRow = { year: number; month: number }

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function mapKpi(row: DbKpi): KpiItem {
  return {
    kpi_key: row.kpi_key,
    kpi_label: row.kpi_label,
    kpi_category: row.kpi_category,
    kpi_value: num(row.kpi_value),
    kpi_unit: row.kpi_unit,
    kpi_value_label: row.kpi_value_label,
    chart_type: row.chart_type,
    is_star_kpi: row.is_star_kpi,
    visible_dashboard: row.visible_dashboard,
    trend_vs_prev_month: num(row.trend_vs_prev_month),
    trend_direction: row.trend_direction,
  }
}

async function fetchProyectoById(id: string): Promise<DbProyecto | null> {
  try {
    const rows = await prisma.$queryRaw<DbProyecto[]>`
      SELECT
        id, name, service_type, status, config_ref,
        setup_fee_eur, monthly_fee_eur, maint_plan, has_mensualidad,
        has_voz, has_chat, has_dash, has_pack, launched_at,
        lead_id, contact_id, dashboard_tier,
        addon_outbound, addon_transcription, addon_cloned_voice,
        addon_human_transfer, addon_email_summary,
        addon_whatsapp, addon_web_widget, addon_form_trigger, addon_multimodal,
        addon_crm_integration, addon_voice_in_chat, languages_count
      FROM proyectos
      WHERE id = ${id}::uuid
      LIMIT 1
    `
    return rows[0] ?? null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('has_voz') && !msg.includes('has_pack')) throw err
    const rows = await prisma.$queryRaw<Omit<DbProyecto, 'has_voz' | 'has_chat' | 'has_dash' | 'has_pack'>[]>`
      SELECT
        id, name, service_type, status, config_ref,
        setup_fee_eur, monthly_fee_eur, maint_plan, has_mensualidad,
        launched_at, lead_id, contact_id, dashboard_tier,
        addon_outbound, addon_transcription, addon_cloned_voice,
        addon_human_transfer, addon_email_summary,
        addon_whatsapp, addon_web_widget, addon_form_trigger, addon_multimodal,
        addon_crm_integration, addon_voice_in_chat, languages_count
      FROM proyectos
      WHERE id = ${id}::uuid
      LIMIT 1
    `
    const r = rows[0]
    if (!r) return null
    return { ...r, has_voz: null, has_chat: null, has_dash: null, has_pack: null }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await requireAuthAPI(req, res)
    const id = req.query.id as string
    if (!id) return res.status(400).json({ error: 'ID requerido' })

    const row = await fetchProyectoById(id)
    if (!row) return res.status(404).json({ error: 'Proyecto no encontrado' })

    let configuracion: string | null = null
    let leadValor: number | null = null
    let leadNotas: string | null = null
    let contact: {
      id: number
      nombre: string | null
      email: string | null
      empresa: string | null
      telefono: string | null
    } | null = null

    if (row.lead_id) {
      const lead = await prisma.lead.findUnique({
        where: { id: row.lead_id },
        select: {
          configuracion: true,
          valor: true,
          notas: true,
          contact: {
            select: { id: true, nombre: true, email: true, empresa: true, telefono: true },
          },
        },
      })
      configuracion = lead?.configuracion ?? null
      leadValor = lead?.valor != null ? Number(lead.valor) : null
      leadNotas = lead?.notas ?? null
      contact = lead?.contact ?? null
    } else if (row.contact_id) {
      contact = await prisma.contact.findUnique({
        where: { id: row.contact_id },
        select: { id: true, nombre: true, email: true, empresa: true, telefono: true },
      })
    }

    const proyecto: ProyectoRow = {
      id: row.id,
      name: row.name,
      service_type: row.service_type,
      status: row.status,
      config_ref: row.config_ref,
      setup_fee_eur: num(row.setup_fee_eur),
      monthly_fee_eur: num(row.monthly_fee_eur),
      maint_plan: row.maint_plan,
      has_mensualidad: row.has_mensualidad,
      has_voz: row.has_voz,
      has_chat: row.has_chat,
      has_dash: row.has_dash,
      has_pack: row.has_pack,
      launched_at: row.launched_at
        ? row.launched_at instanceof Date
          ? row.launched_at.toISOString().slice(0, 10)
          : String(row.launched_at).slice(0, 10)
        : null,
      lead_id: row.lead_id,
      contact_id: row.contact_id,
      dashboard_tier: row.dashboard_tier,
      addon_outbound: row.addon_outbound,
      addon_transcription: row.addon_transcription,
      addon_cloned_voice: row.addon_cloned_voice,
      addon_human_transfer: row.addon_human_transfer,
      addon_email_summary: row.addon_email_summary,
      addon_whatsapp: row.addon_whatsapp,
      addon_web_widget: row.addon_web_widget,
      addon_form_trigger: row.addon_form_trigger,
      addon_multimodal: row.addon_multimodal,
      addon_crm_integration: row.addon_crm_integration ?? false,
      addon_voice_in_chat: row.addon_voice_in_chat ?? false,
      languages_count: row.languages_count ?? null,
    }

    const services = resolveProjectServices(proyecto, configuracion)
    const contract = buildContractSummary(proyecto, configuracion, {
      valor: leadValor,
      notas: leadNotas,
      languagesCount: row.languages_count ?? null,
    })

    const periodRows = await prisma.$queryRaw<PeriodRow[]>`
      SELECT DISTINCT year, month
      FROM engranaje5_kpis
      WHERE project_id = ${id}::uuid
      ORDER BY year DESC, month DESC
    `

    const periods = periodRows.map((p) => ({
      year: p.year,
      month: p.month,
      label: `${MONTHS[p.month - 1] ?? p.month} ${p.year}`,
    }))

    const reqYear = req.query.year ? Number(req.query.year) : null
    const reqMonth = req.query.month ? Number(req.query.month) : null

    let targetYear: number | null = reqYear
    let targetMonth: number | null = reqMonth
    if (!targetYear && periods.length > 0) {
      targetYear = periods[0].year
      targetMonth = periods[0].month
    }

    let kpisFromDb: KpiItem[] = []
    if (targetYear && targetMonth) {
      const kpiRows = await prisma.$queryRaw<DbKpi[]>`
        SELECT
          kpi_key, kpi_label, kpi_category,
          kpi_value, kpi_unit, kpi_value_label,
          chart_type, is_star_kpi, visible_dashboard,
          trend_vs_prev_month, trend_direction,
          year, month
        FROM engranaje5_kpis
        WHERE project_id = ${id}::uuid
          AND year = ${targetYear}
          AND month = ${targetMonth}
          AND visible_dashboard = true
        ORDER BY is_star_kpi DESC, kpi_category, kpi_label
      `
      kpisFromDb = kpiRows.map(mapKpi)
    }

    const hasData = kpisFromDb.length > 0
    const kpis = hasData ? kpisFromDb : buildDefaultKpiLayout(services)

    return res.status(200).json({
      proyecto,
      contact,
      services,
      contract,
      configuracion,
      kpis,
      periods,
      selectedPeriod:
        targetYear && targetMonth
          ? { year: targetYear, month: targetMonth, label: `${MONTHS[targetMonth - 1]} ${targetYear}` }
          : null,
      hasData,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error interno'
    console.error('[retencion/proyectos/[id]]', error)
    return res.status(500).json({ error: msg })
  }
}
