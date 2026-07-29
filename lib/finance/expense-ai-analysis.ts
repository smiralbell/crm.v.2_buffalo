import { format, startOfDay, endOfDay, startOfYear, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { query } from '@/lib/db'
import { prisma } from '@/lib/prisma'
import { openRouterChatCompletion, parseJsonFromModelOutput } from '@/lib/openrouter'
import { buildExpenseAnalytics } from './expense-analytics'
import { isPaymentBucket } from './payment-concepts'
import type { ExpenseAiSummary } from './types'

const SYSTEM = `Eres el analista de gastos de Buffalo AI (agencia de agentes IA).
Recibirás un snapshot JSON con gastos bancarios reales del período: categorías, proveedores, proyectos DEV, recurrentes, sin factura y convención de conceptos (NOMINA, DEV, MKT, PLT).

Responde SOLO con JSON válido (sin markdown), en español:
{
  "resumen": string (3-5 frases, directo para el CEO),
  "control_gastos_0_100": number (qué tan bien clasificados y trazables están los gastos),
  "brechas": string[] (máx 5: huecos de datos, conceptos mal puestos, gastos sin factura, DEV sin proyecto-id, marketing invisible…),
  "riesgos": string[] (máx 4: fugas de caja, dependencia SaaS, nóminas, impuestos),
  "ahorros_detectados": string[] (máx 4: cortes SaaS, renegociaciones, duplicados),
  "acciones_prioritarias": string[] (máx 5: verbos concretos esta semana),
  "por_categoria": [
    { "categoria": string, "situacion": string }
  ]
}

Reglas:
- Usa SOLO datos del snapshot; no inventes cifras.
- Menciona la convención de conceptos si hay transferencias sin NOMINA/DEV/MKT.
- Si developers o marketing están a 0 pero hay gastos "otros", sugiere reclasificar.
- Tono profesional, accionable, sin relleno.`

function normalizeText(text: string | null): string {
  return (text || '').toUpperCase().trim().replace(/\s+/g, ' ')
}

export async function buildExpenseAiPayload(startDate: Date, endDate: Date) {
  const startStr = format(startDate, 'yyyy-MM-dd')
  const endStr = format(endDate, 'yyyy-MM-dd')
  const periodLabel = `${format(startDate, 'd MMM yyyy', { locale: es })} – ${format(endDate, 'd MMM yyyy', { locale: es })}`

  const expensesResult = await query<{
    id: string
    date: Date | string
    amount: number
    description: string
    expense_bucket: string | null
  }>(
    `SELECT bt.id, bt.date, bt.amount, bt.description, bt.expense_bucket
     FROM bank_transactions bt
     WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount < 0
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
       WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount < 0
       ORDER BY bt.date DESC`,
      [startStr, endStr]
    )
    return {
      rows: fallback.rows.map((r) => ({ ...r, expense_bucket: null as string | null })),
    }
  })

  const bankRows = expensesResult.rows.map((e) => {
    const dateStr = e.date instanceof Date ? e.date.toISOString() : String(e.date)
    return {
      id: e.id,
      date: dateStr.slice(0, 10),
      amount: Math.abs(Number(e.amount)),
      description: e.description || '',
      expense_bucket: isPaymentBucket(e.expense_bucket) ? e.expense_bucket : null,
    }
  })

  const manualExpenses = await prisma.expense.findMany({
    where: {
      deleted_at: null,
      OR: [
        { date_start: { gte: startDate, lte: endDate } },
        { date_end: { gte: startDate, lte: endDate } },
        { AND: [{ date_start: { lte: startDate } }, { date_end: { gte: endDate } }] },
      ],
    },
    select: { id: true, name: true, date_start: true, date_end: true, total_amount: true, notes: true },
  })

  const manualNorm = manualExpenses.map((m) => ({
    nameNorm: normalizeText(m.name),
    total: Number(m.total_amount),
    start: m.date_start,
    end: m.date_end,
    bankTransactionId: m.notes || null,
  }))

  let matchedCount = 0
  let unmatchedTotal = 0
  const unmatchedSamples: Array<{ date: string; description: string; amount: number }> = []

  for (const e of bankRows) {
    const descNorm = normalizeText(e.description)
    const expenseDate = new Date(e.date)
    const match = manualNorm.find((m) => {
      if (m.bankTransactionId && m.bankTransactionId === e.id) return true
      const sameConcept = m.nameNorm === descNorm
      const inRange = expenseDate >= m.start && expenseDate <= m.end
      const sameAmount = Math.abs(m.total - e.amount) < 0.01
      return sameConcept && inRange && sameAmount
    })
    if (match) matchedCount++
    else {
      unmatchedTotal += e.amount
      if (unmatchedSamples.length < 8) {
        unmatchedSamples.push({ date: e.date, description: e.description, amount: e.amount })
      }
    }
  }

  const analyticsStart = new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1)
  const analyticsResult = await query<{
    date: string
    amount: number
    description: string
    expense_bucket: string | null
  }>(
    `SELECT bt.date::text AS date, bt.amount, bt.description, bt.expense_bucket
     FROM bank_transactions bt
     WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount < 0`,
    [format(analyticsStart, 'yyyy-MM-dd'), endStr]
  ).catch(async () => {
    const fallback = await query<{ date: string; amount: number; description: string }>(
      `SELECT bt.date::text AS date, bt.amount, bt.description
       FROM bank_transactions bt
       WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount < 0`,
      [format(analyticsStart, 'yyyy-MM-dd'), endStr]
    )
    return {
      rows: fallback.rows.map((r) => ({ ...r, expense_bucket: null as string | null })),
    }
  })

  const analyticsExpenses = analyticsResult.rows.map((e) => ({
    description: e.description || '',
    amount: Number(e.amount),
    date: e.date.slice(0, 10),
    expense_bucket: isPaymentBucket(e.expense_bucket) ? e.expense_bucket : null,
  }))
  const periodExpenses = bankRows.map((e) => ({
    description: e.description,
    amount: -e.amount,
    date: e.date,
    expense_bucket: e.expense_bucket,
  }))
  const analytics = buildExpenseAnalytics(analyticsExpenses, periodExpenses)

  const periodTotal = bankRows.reduce((s, e) => s + e.amount, 0)

  return {
    periodo: periodLabel,
    total_gastos_eur: Math.round(periodTotal * 100) / 100,
    movimientos: bankRows.length,
    con_factura: matchedCount,
    sin_factura: bankRows.length - matchedCount,
    importe_sin_factura_eur: Math.round(unmatchedTotal * 100) / 100,
    muestras_sin_factura: unmatchedSamples,
    desglose_categorias: analytics.bucket_breakdown.map((b) => ({
      categoria: b.label,
      importe_eur: b.amount,
      porcentaje: b.percentage,
      movimientos: b.transaction_count,
      conceptos_frecuentes: b.top_descriptions,
    })),
    top_proveedores: analytics.vendor_spend.slice(0, 12).map((v) => ({
      proveedor: v.label,
      categoria: v.bucket_label,
      importe_eur: v.total,
      pagos: v.payment_count,
    })),
    proyectos_dev: analytics.project_spend,
    recurrente_mensual_estimado_eur: analytics.totals.recurring_monthly,
    plataformas_cortables: analytics.cuttable_items.map((c) => ({
      nombre: c.label,
      eur_mes: c.monthly_equivalent,
      eur_año: c.annual_cost,
    })),
    convencion_conceptos: {
      nomina: 'NOMINA {MES} {APELLIDO}',
      developer: 'DEV {ID} {NOMBRE} {PROYECTO-ID}',
      marketing: 'MKT {CANAL} {DETALLE}',
      saas_tarjeta: 'auto-detectado (Twilio, Cursor…)',
    },
  }
}

export async function generateExpenseAiAnalysis(
  startInput?: string,
  endInput?: string
): Promise<{ summary: ExpenseAiSummary; model: string }> {
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

  const payload = await buildExpenseAiPayload(startDate, endDate)

  const raw = await openRouterChatCompletion([
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Analiza los gastos Buffalo del período:\n\n${JSON.stringify(payload, null, 2)}`,
    },
  ])

  let summary: ExpenseAiSummary
  try {
    summary = parseJsonFromModelOutput(raw) as ExpenseAiSummary
  } catch {
    throw new Error('La IA no devolvió JSON válido. Prueba de nuevo o ajusta OPENROUTER_MODEL.')
  }

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
  return { summary, model }
}
