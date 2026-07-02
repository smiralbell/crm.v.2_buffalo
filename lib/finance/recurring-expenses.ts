export interface RecurringExpenseRow {
  vendor_key: string
  label: string
  category_id: string
  category_label: string
  frequency: string
  average_amount: number
  monthly_equivalent: number
  annual_cost: number
  count: number
  last_date: string
  amounts: number[]
}

type ExpenseInput = {
  description: string
  amount: number
  date: string
}

const VENDOR_ALIASES: Array<{ key: string; label: string; patterns: RegExp[] }> = [
  { key: 'twilio', label: 'Twilio', patterns: [/twilio/i] },
  { key: 'retell', label: 'Retell AI', patterns: [/retell/i] },
  { key: 'openai', label: 'OpenAI', patterns: [/openai|chatgpt/i] },
  { key: 'anthropic', label: 'Anthropic / Claude', patterns: [/anthropic|claude/i] },
  { key: 'elevenlabs', label: 'ElevenLabs', patterns: [/elevenlabs/i] },
  { key: 'cursor', label: 'Cursor', patterns: [/cursor/i] },
  { key: 'contabo', label: 'Contabo', patterns: [/contabo/i] },
  { key: 'easypanel', label: 'EasyPanel', patterns: [/easypanel|lemsqzy/i] },
  { key: 'raiola', label: 'Raiola Networks', patterns: [/raiola/i] },
  { key: 'fireflies', label: 'Fireflies.ai', patterns: [/fireflies/i] },
  { key: 'nexiaia', label: 'NexiaIA', patterns: [/nexiaia/i] },
  { key: 'qualitas', label: 'Qualitas (gestoría)', patterns: [/qualitas|inst\.?\s*qualitas/i] },
  { key: 'facebook', label: 'Meta / Facebook Ads', patterns: [/facebk|facebook|meta\b/i] },
  { key: 'manus', label: 'Manus AI', patterns: [/manus\s*ai/i] },
]

const CATEGORY_BY_VENDOR: Record<string, { id: string; label: string }> = {
  twilio: { id: 'saas', label: 'Software y SaaS' },
  retell: { id: 'saas', label: 'Software y SaaS' },
  openai: { id: 'saas', label: 'Software y SaaS' },
  anthropic: { id: 'saas', label: 'Software y SaaS' },
  elevenlabs: { id: 'saas', label: 'Software y SaaS' },
  cursor: { id: 'saas', label: 'Software y SaaS' },
  contabo: { id: 'infra', label: 'Infra y operaciones' },
  easypanel: { id: 'infra', label: 'Infra y operaciones' },
  raiola: { id: 'infra', label: 'Infra y operaciones' },
  fireflies: { id: 'saas', label: 'Software y SaaS' },
  nexiaia: { id: 'saas', label: 'Software y SaaS' },
  qualitas: { id: 'professional', label: 'Servicios profesionales' },
  facebook: { id: 'marketing', label: 'Marketing y ads' },
  manus: { id: 'saas', label: 'Software y SaaS' },
}

function normalizeVendorKey(description: string): { key: string; label: string } {
  const raw = description.trim()
  for (const alias of VENDOR_ALIASES) {
    if (alias.patterns.some((p) => p.test(raw))) {
      return { key: alias.key, label: alias.label }
    }
  }
  let d = raw.toUpperCase().replace(/\s+/g, ' ')
  d = d.replace(/\*[A-Z0-9]+$/i, '').trim()
  d = d.replace(/^(PAGO|COMPRA|TARJ\.?|RECIBO)\s+/i, '').trim()
  const short = d.split(/\s{2,}|\/|\|/)[0]?.trim() ?? d
  const key = short.slice(0, 48).toLowerCase().replace(/[^a-z0-9]+/g, '_')
  return { key: key || 'otro', label: short.slice(0, 48) || 'Sin concepto' }
}

function inferFrequency(avgIntervalDays: number): string {
  if (avgIntervalDays >= 25 && avgIntervalDays <= 35) return 'Mensual'
  if (avgIntervalDays >= 85 && avgIntervalDays <= 95) return 'Trimestral'
  if (avgIntervalDays >= 175 && avgIntervalDays <= 185) return 'Semestral'
  if (avgIntervalDays >= 360 && avgIntervalDays <= 370) return 'Anual'
  return 'Variable'
}

function monthlyEquivalent(averageAmount: number, frequency: string): number {
  if (frequency === 'Trimestral') return averageAmount / 3
  if (frequency === 'Semestral') return averageAmount / 6
  if (frequency === 'Anual') return averageAmount / 12
  return averageAmount
}

/**
 * Detecta gastos recurrentes agrupando por proveedor/concepto normalizado.
 */
export function detectRecurringExpenses(expenses: ExpenseInput[]): RecurringExpenseRow[] {
  const byVendor = new Map<string, { label: string; items: Array<{ date: string; amount: number }> }>()

  for (const e of expenses) {
    const abs = Math.abs(e.amount)
    if (abs <= 0) continue
    const { key, label } = normalizeVendorKey(e.description || 'Sin concepto')
    if (!byVendor.has(key)) byVendor.set(key, { label, items: [] })
    byVendor.get(key)!.items.push({ date: e.date.slice(0, 10), amount: abs })
  }

  const rows: RecurringExpenseRow[] = []

  for (const [vendor_key, { label, items }] of Array.from(byVendor.entries())) {
    if (items.length < 2) continue

    items.sort((a, b) => a.date.localeCompare(b.date))
    const dates = items.map((i) => new Date(i.date).getTime())
    const intervals: number[] = []
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24))
    }
    const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 30
    const frequency = inferFrequency(avgInterval)
    const amounts = items.map((i) => i.amount)
    const average_amount = Math.round((amounts.reduce((a, b) => a + b, 0) / amounts.length) * 100) / 100
    const monthly_equivalent = Math.round(monthlyEquivalent(average_amount, frequency) * 100) / 100
    const cat = CATEGORY_BY_VENDOR[vendor_key] ?? { id: 'other', label: 'Otros gastos' }

    rows.push({
      vendor_key,
      label,
      category_id: cat.id,
      category_label: cat.label,
      frequency,
      average_amount,
      monthly_equivalent,
      annual_cost: Math.round(monthly_equivalent * 12 * 100) / 100,
      count: items.length,
      last_date: items[items.length - 1].date,
      amounts,
    })
  }

  return rows.sort((a, b) => b.monthly_equivalent - a.monthly_equivalent)
}

export function recurringExpensesSummary(rows: RecurringExpenseRow[]) {
  const monthly_total = Math.round(rows.reduce((s, r) => s + r.monthly_equivalent, 0) * 100) / 100
  const annual_total = Math.round(monthly_total * 12 * 100) / 100
  return { monthly_total, annual_total, count: rows.length }
}
