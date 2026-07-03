export interface InvoiceLinkCandidate {
  id: number
  invoice_number: string
  client_name: string
  total: number
  subtotal: number
  iva: number
  issue_date: string
  bank_transaction_id?: string | null
  score: number
  match_reasons: string[]
}

const AMOUNT_TOLERANCE = 0.02

function amountMatchScore(incomeAmount: number, invoiceTotal: number): { score: number; reasons: string[] } {
  const diff = Math.abs(incomeAmount - invoiceTotal)
  if (diff <= AMOUNT_TOLERANCE) return { score: 100, reasons: ['Importe exacto'] }
  const pct = invoiceTotal > 0 ? diff / invoiceTotal : 1
  if (pct <= 0.01) return { score: 85, reasons: ['Importe casi exacto'] }
  if (pct <= 0.05) return { score: 55, reasons: ['Importe similar'] }
  return { score: 0, reasons: [] }
}

function clientInDescription(clientName: string, description: string): boolean {
  const c = clientName.trim().toLowerCase()
  const d = description.toLowerCase()
  if (!c || c.length < 3) return false
  if (d.includes(c)) return true
  const firstWord = c.split(/\s+/)[0]
  return firstWord.length >= 4 && d.includes(firstWord)
}

function dateProximityScore(incomeDate: string, issueDate: string): { score: number; reason?: string } {
  const a = new Date(incomeDate).getTime()
  const b = new Date(issueDate).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return { score: 0 }
  const days = Math.abs(a - b) / (1000 * 60 * 60 * 24)
  if (days <= 14) return { score: 15, reason: 'Fecha cercana' }
  if (days <= 45) return { score: 8, reason: 'Fecha próxima' }
  if (days <= 90) return { score: 3 }
  return { score: 0 }
}

function facInvoiceMatch(description: string, invoiceNumber: string): boolean {
  const m = description.match(/^FAC\s+.+?\s+([\w-]+)$/i)
  if (!m) return false
  const ref = m[1].toUpperCase()
  return invoiceNumber.toUpperCase().includes(ref) || ref.includes(invoiceNumber.toUpperCase())
}

export function rankInvoiceLinkSuggestions(
  income: { amount: number; description: string; date: string },
  invoices: Array<{
    id: number
    invoice_number: string
    client_name: string
    total: number
    subtotal: number
    iva: number
    issue_date: string
    bank_transaction_id?: string | null
  }>
): InvoiceLinkCandidate[] {
  const available = invoices.filter((inv) => !inv.bank_transaction_id)

  const ranked = available.map((inv) => {
    const reasons: string[] = []
    let score = 0

    const amt = amountMatchScore(income.amount, inv.total)
    score += amt.score
    reasons.push(...amt.reasons)

    if (clientInDescription(inv.client_name, income.description)) {
      score += 35
      reasons.push('Cliente en concepto')
    }

    if (facInvoiceMatch(income.description, inv.invoice_number)) {
      score += 50
      reasons.push('Concepto FAC')
    }

    const dateScore = dateProximityScore(income.date, inv.issue_date)
    score += dateScore.score
    if (dateScore.reason) reasons.push(dateScore.reason)

    return {
      ...inv,
      score,
      match_reasons: Array.from(new Set(reasons)),
    }
  })

  return ranked
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || Math.abs(a.total - income.amount) - Math.abs(b.total - income.amount))
}

export function filterInvoicesForSearch<T extends {
  id: number
  invoice_number: string
  client_name: string
  total: number
  bank_transaction_id?: string | null
}>(
  invoices: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase()
  const pool = invoices.filter((inv) => !inv.bank_transaction_id)
  if (!q) return pool
  return pool.filter(
    (inv) =>
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.client_name.toLowerCase().includes(q) ||
      String(inv.total).includes(q)
  )
}
