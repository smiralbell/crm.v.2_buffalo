import { runDueRecurringInvoices } from '@/lib/invoices/recurring'
import { runDueInvoiceEmails } from '@/lib/invoices/recurring-email'

declare global {
  // eslint-disable-next-line no-var
  var __buffaloRecurringInvoices: boolean | undefined
}

/**
 * El día elegido, crea la factura real con el siguiente número BUF y, si la
 * plantilla lo tiene activado, la manda por email el día y a la hora elegidos.
 * Mira cada 5 minutos.
 */
export function startRecurringInvoiceScheduler(): void {
  if (globalThis.__buffaloRecurringInvoices) return
  if (process.env.RECURRING_INVOICES === '0') return
  globalThis.__buffaloRecurringInvoices = true

  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await runDueRecurringInvoices().catch((e) => {
        console.warn('[recurring-invoices]', e instanceof Error ? e.message : e)
      })
      await runDueInvoiceEmails().catch((e) => {
        console.warn('[recurring-invoices] email', e instanceof Error ? e.message : e)
      })
    } finally {
      running = false
    }
  }

  setTimeout(() => void tick(), 20_000)
  setInterval(() => void tick(), 5 * 60_000)
}
