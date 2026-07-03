import { format, startOfDay, endOfDay, startOfYear, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { query } from '@/lib/db'
import { prisma } from '@/lib/prisma'
import { openRouterChatCompletion, parseJsonFromModelOutput } from '@/lib/openrouter'
import { buildIncomeAnalytics } from './income-analytics'
import type { IncomeAiSummary } from './types'

const SYSTEM = `Eres el analista de ingresos y cobros de Buffalo AI (agencia de agentes IA).
Recibirás un snapshot JSON con cobros bancarios reales, facturas vinculadas, MRR, % cobro por cliente y fiscalidad SOLO cuando hay facturas relacionadas con IVA.

Responde SOLO con JSON válido (sin markdown), en español:
{
  "resumen": string (3-5 frases para el CEO),
  "salud_cobros_0_100": number (conciliación banco-factura, concentración clientes, MRR),
  "brechas": string[] (máx 5: cobros sin factura, clientes con bajo % cobro, MRR sin marcar…),
  "riesgos": string[] (máx 4: concentración, impagos, ingresos sin trazabilidad fiscal),
  "oportunidades": string[] (máx 4: upsell, regularizar MRR, mejorar conciliación),
  "acciones_prioritarias": string[] (máx 5: verbos concretos esta semana),
  "por_cliente": [
    { "cliente": string, "situacion": string }
  ]
}

Reglas:
- Usa SOLO datos del snapshot; no inventes cifras.
- Si fiscalidad.iva_disponible es false, NO menciones IVA ni bases imponibles; analiza solo cobros brutos y conciliación.
- Si hay cobros sin vincular, priorízalos en brechas.
- Plataformas/devoluciones van en «Otros»; no las trates como clientes.
- Tono profesional, accionable.`

export async function buildIncomeAiPayload(startDate: Date, endDate: Date) {
  const startStr = format(startDate, 'yyyy-MM-dd')
  const endStr = format(endDate, 'yyyy-MM-dd')
  const periodLabel = `${format(startDate, 'd MMM yyyy', { locale: es })} – ${format(endDate, 'd MMM yyyy', { locale: es })}`

  const incomesResult = await query<{
    id: string
    date: Date | string
    amount: number
    description: string
    is_recurring_income: boolean
  }>(
    `SELECT bt.id, bt.date, bt.amount, bt.description,
            COALESCE(bt.is_recurring_income, false) AS is_recurring_income
     FROM bank_transactions bt
     WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount > 0
     ORDER BY bt.date DESC`,
    [startStr, endStr]
  ).catch(async () => {
    const fallback = await query<{
      id: string
      date: Date | string
      amount: number
      description: string
    }>(
      `SELECT bt.id, bt.date, bt.amount, bt.description
       FROM bank_transactions bt
       WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount > 0`,
      [startStr, endStr]
    )
    return { rows: fallback.rows.map((r) => ({ ...r, is_recurring_income: false })) }
  })

  const linkedResult = await query<{
    id: number
    invoice_number: string
    client_name: string
    total: number
    subtotal: number
    iva: number
    bank_transaction_id: string
  }>(
    `SELECT id, invoice_number, client_name, total, subtotal, iva, bank_transaction_id
     FROM invoices
     WHERE deleted_at IS NULL AND bank_transaction_id IS NOT NULL`
  ).catch(() => ({ rows: [] as never[] }))

  const linkedByBtId = new Map<string, (typeof linkedResult.rows)[0]>()
  linkedResult.rows.forEach((inv) => {
    if (inv.bank_transaction_id) linkedByBtId.set(inv.bank_transaction_id, inv)
  })

  const bankRows = incomesResult.rows.map((i) => {
    const dateStr = i.date instanceof Date ? i.date.toISOString().slice(0, 10) : String(i.date).slice(0, 10)
    const linked = linkedByBtId.get(i.id)
    return {
      id: i.id,
      date: dateStr,
      amount: Number(i.amount),
      description: i.description || '',
      is_recurring_income: Boolean(i.is_recurring_income),
      vinculado: !!linked,
      factura: linked
        ? {
            numero: linked.invoice_number,
            cliente: linked.client_name,
            total: Number(linked.total),
            subtotal: Number(linked.subtotal),
            iva: Number(linked.iva),
          }
        : null,
    }
  })

  const periodInputs = bankRows.map((r) => ({
    description: r.description,
    amount: r.amount,
    date: r.date,
    is_recurring_income: r.is_recurring_income,
    linked_client_name: r.factura?.cliente,
    linked_invoice_subtotal: r.factura?.subtotal,
    linked_invoice_iva: r.factura?.iva,
  }))

  const periodInvoicesRaw = await prisma.invoice.findMany({
    where: {
      deleted_at: null,
      status: 'sent',
      issue_date: { gte: startDate, lte: endDate },
    },
    select: {
      client_name: true,
      total: true,
      subtotal: true,
      iva: true,
      bank_transaction_id: true,
    },
  })
  const periodInvoices = periodInvoicesRaw.map((inv) => ({
    client_name: inv.client_name,
    total: Number(inv.total),
    subtotal: Number(inv.subtotal),
    iva: Number(inv.iva),
    bank_transaction_id: inv.bank_transaction_id,
  }))

  const analyticsStart = new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1)
  const timelineResult = await query<{
    id: string
    date: string
    amount: number
    description: string
    is_recurring_income: boolean
  }>(
    `SELECT bt.id, bt.date::text AS date, bt.amount, bt.description,
            COALESCE(bt.is_recurring_income, false) AS is_recurring_income
     FROM bank_transactions bt
     WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount > 0`,
    [format(analyticsStart, 'yyyy-MM-dd'), endStr]
  )

  const timelineInputs = timelineResult.rows.map((row) => {
    const linked = linkedByBtId.get(row.id)
    return {
      description: row.description || '',
      amount: Number(row.amount),
      date: row.date.slice(0, 10),
      is_recurring_income: Boolean(row.is_recurring_income),
      linked_client_name: linked?.client_name,
      linked_invoice_subtotal: linked ? Number(linked.subtotal) : undefined,
      linked_invoice_iva: linked ? Number(linked.iva) : undefined,
    }
  })

  const analytics = buildIncomeAnalytics(timelineInputs, periodInputs, periodInvoices)
  const totals = analytics.totals

  const unmatchedSamples = bankRows
    .filter((r) => !r.vinculado)
    .slice(0, 8)
    .map((r) => ({ fecha: r.date, concepto: r.description, importe_eur: r.amount }))

  const fiscalidad = totals.has_iva_data
    ? {
        iva_disponible: true,
        base_imponible_cobrada_eur: totals.base_collected,
        iva_repercutido_cobrado_eur: totals.iva_collected,
        base_vinculada_periodo_eur: totals.invoiced_base,
        iva_vinculado_periodo_eur: totals.invoiced_iva,
        nota: 'Cifras fiscales solo de facturas vinculadas a cobros del banco.',
      }
    : {
        iva_disponible: false,
        nota: 'No hay facturas vinculadas con IVA en el período; no uses datos fiscales en el análisis.',
      }

  return {
    periodo: periodLabel,
    total_cobrado_eur: totals.period_total,
    movimientos: bankRows.length,
    vinculados: totals.matched_count,
    sin_vincular: totals.unmatched_count,
    importe_sin_vincular_eur: totals.unmatched_total,
    muestras_sin_vincular: unmatchedSamples,
    facturado_enviado_eur: totals.invoiced_period,
    pct_cobro_global: totals.global_collection_pct,
    mrr_estimado_eur_mes: totals.mrr_monthly,
    otros_plataformas_eur: totals.otros_income,
    fiscalidad,
    cobro_por_cliente: analytics.client_breakdown.slice(0, 15).map((c) => ({
      cliente: c.label,
      importe_eur: c.total,
      pagos: c.payment_count,
      pct_del_total: c.percentage,
      recurrente_eur: c.recurring_total,
    })),
    pct_cobrado_por_cliente: analytics.client_collection.slice(0, 12).map((c) => ({
      cliente: c.label,
      facturado_eur: c.invoiced,
      cobrado_eur: c.collected,
      pct_cobrado: c.collection_pct,
      pendiente_eur: c.pending,
    })),
    mrr_por_cliente: analytics.mrr_by_client,
    tipos_ingreso: analytics.type_breakdown,
  }
}

export async function generateIncomeAiAnalysis(
  startInput?: string,
  endInput?: string
): Promise<{ summary: IncomeAiSummary; model: string }> {
  let startDate: Date
  let endDate: Date

  if (startInput && endInput) {
    startDate = startOfDay(new Date(startInput))
    endDate = endOfDay(new Date(endInput))
  } else {
    const now = new Date()
    startDate = startOfYear(now)
    endDate = endOfMonth(now)
  }

  const payload = await buildIncomeAiPayload(startDate, endDate)

  const raw = await openRouterChatCompletion([
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Analiza los ingresos y cobros Buffalo del período:\n\n${JSON.stringify(payload, null, 2)}`,
    },
  ])

  let summary: IncomeAiSummary
  try {
    summary = parseJsonFromModelOutput(raw) as IncomeAiSummary
  } catch {
    throw new Error('La IA no devolvió JSON válido. Prueba de nuevo o ajusta OPENROUTER_MODEL.')
  }

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
  return { summary, model }
}
