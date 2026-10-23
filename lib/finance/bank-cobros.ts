import { format } from 'date-fns'
import { query } from '@/lib/db'
import { prisma } from '@/lib/prisma'
import { getPeriodRangeForPreset } from '@/lib/finance/period-presets'
import { CLIENT_INVOICE_WHERE, FISCAL_INVOICE_WHERE } from '@/lib/invoices/developer-meta'

/** Entradas de banco (mismo criterio que el KPI Cobros de Finanzas). */
export async function sumBankCobros(start: Date, end: Date): Promise<number> {
  const startStr = format(start, 'yyyy-MM-dd')
  const endStr = format(end, 'yyyy-MM-dd')
  try {
    const r = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM bank_transactions
       WHERE date >= $1 AND date <= $2
         AND amount > 0`,
      [startStr, endStr]
    )
    return Number(r.rows[0]?.total ?? 0)
  } catch {
    return 0
  }
}

/** Mismo rango que Finanzas → filtro «Año» (caja Cobros). */
export function financeYearCobrosRange(now = new Date()) {
  return getPeriodRangeForPreset('year', now)
}

export async function sumBankCobrosYtd(now = new Date()): Promise<number> {
  const { start, end } = financeYearCobrosRange(now)
  return sumBankCobros(start, end)
}

/** Facturas creadas (borrador o enviadas) aún sin cobro vinculado al banco. */
export async function sumOutstandingInvoices(): Promise<{ total: number; count: number }> {
  const where = {
    deleted_at: null,
    status: { in: ['draft', 'sent'] },
    bank_transaction_id: null,
    ...CLIENT_INVOICE_WHERE,
    ...FISCAL_INVOICE_WHERE,
  }
  try {
    const [sum, count] = await Promise.all([
      prisma.invoice.aggregate({ where, _sum: { total: true } }),
      prisma.invoice.count({ where }),
    ])
    return { total: Number(sum._sum.total || 0), count }
  } catch {
    return { total: 0, count: 0 }
  }
}
