/**
 * Conciliación automática de cobros: vincula un ingreso del banco con su factura
 * solo cuando no hay duda (las mismas sugerencias que ve el usuario en «Vincular factura»):
 *  - importe exacto (±0,02 €), y
 *  - el cliente aparece en el concepto o el concepto trae la referencia FAC, y
 *  - ninguna otra factura pendiente tiene ese mismo importe.
 * Lo demás se queda como sugerencia para revisar a mano.
 */
import { query } from '@/lib/db'
import { rankInvoiceLinkSuggestions } from '@/lib/finance/invoice-link-suggestions'
import { notify } from '@/lib/notifications'

type IncomeRow = { id: string; date: Date | string; amount: string | number; description: string | null }
type InvoiceRow = {
  id: number
  invoice_number: string
  client_name: string
  total: string | number
  subtotal: string | number
  iva: string | number
  issue_date: Date | string
}

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : String(d))

export function pickCertainInvoice(
  income: { amount: number; description: string; date: string },
  invoices: Array<{
    id: number
    invoice_number: string
    client_name: string
    total: number
    subtotal: number
    iva: number
    issue_date: string
  }>
): number | null {
  const ranked = rankInvoiceLinkSuggestions(income, invoices)
  const exact = ranked.filter((r) => r.match_reasons.includes('Importe exacto'))
  if (exact.length !== 1) return null
  const only = exact[0]
  const identified =
    only.match_reasons.includes('Cliente en concepto') || only.match_reasons.includes('Concepto FAC')
  return identified ? only.id : null
}

export async function autoReconcileIncomes(): Promise<{ linked: number; ambiguous: number; details: string[] }> {
  const incomes = await query<IncomeRow>(
    `SELECT bt.id, bt.date, bt.amount, bt.description
       FROM bank_transactions bt
      WHERE bt.amount > 0
        AND bt.date >= NOW() - INTERVAL '120 days'
        AND COALESCE(bt.is_reconciled, FALSE) = FALSE
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.bank_transaction_id = bt.id AND i.deleted_at IS NULL)
      ORDER BY bt.date`
  )
  if (!incomes.rows.length) return { linked: 0, ambiguous: 0, details: [] }

  const invoicesRes = await query<InvoiceRow>(
    `SELECT id, invoice_number, client_name, total, subtotal, iva, issue_date
       FROM invoices
      WHERE deleted_at IS NULL AND status = 'sent' AND bank_transaction_id IS NULL
        AND issue_date >= NOW() - INTERVAL '2 years'`
  )
  let available = invoicesRes.rows.map((i) => ({
    id: i.id,
    invoice_number: i.invoice_number,
    client_name: i.client_name,
    total: Number(i.total),
    subtotal: Number(i.subtotal),
    iva: Number(i.iva),
    issue_date: iso(i.issue_date),
  }))

  let linked = 0
  let ambiguous = 0
  const details: string[] = []
  for (const inc of incomes.rows) {
    const income = { amount: Number(inc.amount), description: inc.description ?? '', date: iso(inc.date) }
    const invoiceId = pickCertainInvoice(income, available)
    if (!invoiceId) {
      if (rankInvoiceLinkSuggestions(income, available).some((r) => r.score >= 100)) ambiguous++
      continue
    }
    const upd = await query(
      `UPDATE invoices SET bank_transaction_id = $1, updated_at = NOW()
        WHERE id = $2 AND bank_transaction_id IS NULL AND deleted_at IS NULL`,
      [inc.id, invoiceId]
    )
    if (!upd.rowCount) continue
    const inv = available.find((i) => i.id === invoiceId)!
    available = available.filter((i) => i.id !== invoiceId)
    linked++
    details.push(`${inv.invoice_number} · ${inv.client_name} · ${inv.total.toFixed(2)} €`)
  }

  if (linked) {
    await notify({
      to: { roles: ['admin'] },
      kind: 'finanzas.conciliado',
      title: `${linked} cobro(s) conciliados automáticamente`,
      body: details.slice(0, 8).join('\n'),
      link: '/finances/incomes',
      severity: 'info',
    })
  }
  return { linked, ambiguous, details }
}
