import { runDueRecurringInvoices } from '@/lib/invoices/recurring'
import { runDueInvoiceEmails } from '@/lib/invoices/recurring-email'
import { RECURRING_DAILY_TIME } from '@/lib/invoices/recurring-email-template'
import { nextMadridTime } from '@/lib/invoices/recurring-dates'

declare global {
  // eslint-disable-next-line no-var
  var __buffaloRecurringInvoices: boolean | undefined
}

/**
 * Una vez al día, a las 9:00 de Madrid: crea las facturas recurrentes que tocan
 * (con el siguiente número BUF) y manda por email las que tienen el envío
 * activado. Al arrancar el servidor también pasa una vez, por si estaba parado
 * a esa hora; lo que aún no toca no se adelanta.
 */
export function startRecurringInvoiceScheduler(): void {
  if (globalThis.__buffaloRecurringInvoices) return
  if (process.env.RECURRING_INVOICES === '0') return
  globalThis.__buffaloRecurringInvoices = true

  let running = false
  const run = async () => {
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

  const scheduleNext = () => {
    const wait = nextMadridTime(RECURRING_DAILY_TIME).getTime() - Date.now()
    setTimeout(() => {
      void run().finally(scheduleNext)
    }, Math.max(1_000, wait))
  }

  setTimeout(() => void run(), 20_000)
  scheduleNext()
}
