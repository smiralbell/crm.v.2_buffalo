import { randomUUID } from 'crypto'
import { query } from '@/lib/db'
import { openRouterChatCompletion, parseJsonFromModelOutput } from '@/lib/openrouter'
import { buildExecutiveSummary } from './executive-summary'
import type { ExecutiveSummary, FinanceAiSummary } from './types'

const SYSTEM = `Eres el CFO virtual de Buffalo AI, una agencia de agentes IA (voz, chat, dashboards) con modelo setup + mensualidad (MRR).
El objetivo anual de facturación es 250.000 EUR.
Recibirás un snapshot JSON con KPIs reales del CRM: caja, MRR, facturación, cobros, pipeline, alertas y economía por proyecto.

Responde SOLO con JSON válido (sin markdown), en español, estructura exacta:
{
  "resumen_ejecutivo": string (4-6 frases, directo, para el CEO),
  "salud_financiera_0_100": number,
  "wins": string[] (máx 4, específicos con datos del snapshot),
  "riesgos": string[] (máx 4, accionables),
  "alertas_prioritarias": string[] (máx 3, las más urgentes),
  "acciones_esta_semana": string[] (máx 5, verbos en infinitivo, muy concretas),
  "oportunidades_crecimiento": string[] (máx 3),
  "metricas_clave": [
    { "nombre": string, "valor": string, "interpretacion": string }
  ],
  "path_a_objetivo": string (2-3 frases sobre cómo acercarse al objetivo anual con las palancas MRR, cobro, margen, pipeline)
}

Reglas:
- Usa SOLO números del snapshot; no inventes cifras.
- Si faltan datos, dilo y recomienda qué conectar (banco, facturas, proyectos).
- Tono profesional, sin relleno motivacional vacío.
- Prioriza cash, cobros, MRR, margen por cliente y pipeline.`

export async function generateFinanceAiAnalysis(): Promise<{
  summary: FinanceAiSummary
  model: string
  context: ExecutiveSummary
}> {
  const context = await buildExecutiveSummary()

  const payload = {
    objetivo_anual_eur: 250_000,
    kpis: context.kpis,
    expense_breakdown: context.expense_breakdown,
    income_breakdown: context.income_breakdown,
    alerts: context.alerts.map((a) => ({ severity: a.severity, title: a.title, message: a.message })),
    cash_flow_last_months: context.cash_flow,
    invoiced_vs_collected: context.invoiced_vs_collected,
    pending_invoices_count: context.pending_invoices.length,
    pending_invoices_total: context.pending_invoices.reduce((s, i) => s + i.total, 0),
    top_projects_economics: context.project_economics.slice(0, 8),
  }

  const raw = await openRouterChatCompletion([
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Snapshot financiero Buffalo (${context.generated_at}):\n\n${JSON.stringify(payload, null, 2)}`,
    },
  ])

  let summary: FinanceAiSummary
  try {
    summary = parseJsonFromModelOutput(raw) as FinanceAiSummary
  } catch {
    throw new Error('La IA no devolvió JSON válido. Prueba de nuevo o ajusta OPENROUTER_MODEL.')
  }

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
  return { summary, model, context }
}

export async function saveFinanceAiAnalysis(
  summary: FinanceAiSummary,
  model: string
): Promise<string> {
  const id = randomUUID()
  await query(
    `INSERT INTO finance_ai_analyses (id, summary_json, model) VALUES ($1, $2::jsonb, $3)`,
    [id, JSON.stringify(summary), model]
  )
  return id
}

export async function getLatestFinanceAiAnalysis(): Promise<{
  id: string
  summary: FinanceAiSummary
  model: string
  created_at: string
} | null> {
  try {
    const result = await query<{
      id: string
      summary_json: FinanceAiSummary
      model: string
      created_at: Date
    }>(
      `SELECT id, summary_json, model, created_at
       FROM finance_ai_analyses
       ORDER BY created_at DESC
       LIMIT 1`
    )
    const row = result.rows[0]
    if (!row) return null
    return {
      id: row.id,
      summary: row.summary_json,
      model: row.model,
      created_at: row.created_at.toISOString(),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('finance_ai_analyses') || msg.includes('does not exist')) {
      return null
    }
    throw err
  }
}
