import { runDueRecurringInvoices } from '@/lib/invoices/recurring'

declare global {
  // eslint-disable-next-line no-var
  var __buffaloRecurringInvoices: boolean | undefined
}

/** El día elegido, crea la factura real con el siguiente número BUF. */
export function startRecurringInvoiceScheduler(): void {
  if (globalThis.__buffaloRecurringInvoices) return
  if (process.env.RECURRING_INVOICES === '0') return
  globalThis.__buffaloRecurringInvoices = true

  const tick = () => {
    void runDueRecurringInvoices().catch((e) => {
      console.warn('[recurring-invoices]', e instanceof Error ? e.message : e)
    })
  }

  setTimeout(tick, 20_000)
  setInterval(tick, 15 * 60_000)
}
