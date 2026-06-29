export interface CategorizedTransaction {
  description: string
  amount: number
  date: string
}

export interface CategorySlice {
  id: string
  label: string
  amount: number
  percentage: number
  transaction_count: number
  avg_transaction: number
  top_descriptions: string[]
}

const EXPENSE_RULES: Array<{ id: string; label: string; patterns: RegExp[] }> = [
  {
    id: 'payroll',
    label: 'Nóminas y personal',
    patterns: [/nomina|nómina|salari|nominas|seg\.?\s*social|tgss|mutua|personal|sueldo/i],
  },
  {
    id: 'taxes',
    label: 'Impuestos y tasas',
    patterns: [/hacienda|aeat|\biva\b|irpf|impuesto|retencion|retención|tasa|tribut/i],
  },
  {
    id: 'saas',
    label: 'Software y SaaS',
    patterns: [
      /openai|anthropic|google\s*cloud|aws|azure|stripe|twilio|retell|vercel|github|notion|slack|zoom|adobe|microsoft|figma|linear|cursor|openrouter|supabase|easypanel|digitalocean|cloudflare/i,
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing y ads',
    patterns: [/meta\b|facebook|instagram|google\s*ads|linkedin|instantly|publicidad|marketing|ads\b|outreach/i],
  },
  {
    id: 'professional',
    label: 'Servicios profesionales',
    patterns: [/asesor|abogad|gestor|consultor|honorari|notari|auditor|gestoria|gestoría/i],
  },
  {
    id: 'infra',
    label: 'Infra y operaciones',
    patterns: [/servidor|dominio|hosting|telefon|teléfono|internet|luz|electric|oficina|alquiler|suministro|movistar|vodafone/i],
  },
  {
    id: 'bank',
    label: 'Comisiones bancarias',
    patterns: [/comision|comisión|mantenimiento|timbre|cargo\s*banc|transferencia\s*emis/i],
  },
]

const INCOME_RULES: Array<{ id: string; label: string; patterns: RegExp[] }> = [
  {
    id: 'recurring',
    label: 'Mensualidades',
    patterns: [/mensual|mantenimiento|mensualidad|recurrente|abono\s*mensual|fee\s*monthly/i],
  },
  {
    id: 'setup',
    label: 'Setup e implementación',
    patterns: [/setup|implementacion|implementación|inicial|señal|senal|onboarding|proyecto/i],
  },
  {
    id: 'refunds',
    label: 'Devoluciones recibidas',
    patterns: [/devolucion|devolución|abono|reembolso/i],
  },
]

function matchCategory(description: string, rules: typeof EXPENSE_RULES): string {
  const d = description.toLowerCase()
  for (const rule of rules) {
    if (rule.patterns.some((p) => p.test(d))) return rule.id
  }
  return 'other'
}

function buildSlices(
  transactions: CategorizedTransaction[],
  rules: typeof EXPENSE_RULES,
  otherLabel: string
): CategorySlice[] {
  const buckets = new Map<string, { amounts: number[]; descriptions: string[] }>()

  for (const rule of rules) {
    buckets.set(rule.id, { amounts: [], descriptions: [] })
  }
  buckets.set('other', { amounts: [], descriptions: [] })

  for (const tx of transactions) {
    const id = matchCategory(tx.description, rules)
    const bucket = buckets.get(id)!
    bucket.amounts.push(Math.abs(tx.amount))
    if (tx.description.trim()) bucket.descriptions.push(tx.description.trim())
  }

  const total = transactions.reduce((s, t) => s + Math.abs(t.amount), 0)
  const labelById = new Map(rules.map((r) => [r.id, r.label]))
  labelById.set('other', otherLabel)

  const slices: CategorySlice[] = []
  for (const [id, bucket] of Array.from(buckets.entries())) {
    if (bucket.amounts.length === 0) continue
    const amount = bucket.amounts.reduce((a: number, b: number) => a + b, 0)
    const descFreq = new Map<string, number>()
    for (const d of bucket.descriptions) {
      descFreq.set(d, (descFreq.get(d) ?? 0) + 1)
    }
    const top_descriptions = Array.from(descFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d]) => d)

    slices.push({
      id,
      label: labelById.get(id) ?? otherLabel,
      amount,
      percentage: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
      transaction_count: bucket.amounts.length,
      avg_transaction: Math.round((amount / bucket.amounts.length) * 100) / 100,
      top_descriptions,
    })
  }

  return slices.sort((a, b) => b.amount - a.amount)
}

export function categorizeExpenses(transactions: CategorizedTransaction[]): CategorySlice[] {
  return buildSlices(transactions, EXPENSE_RULES, 'Otros gastos')
}

export function categorizeIncome(transactions: CategorizedTransaction[]): CategorySlice[] {
  return buildSlices(transactions, INCOME_RULES, 'Otros ingresos')
}
