import { runDueOpsReminders } from '@/lib/ops-reminders'

declare global {
  // eslint-disable-next-line no-var
  var __buffaloOpsReminders: boolean | undefined
}

/** Revisa cada 15 min; cada ítem solo avisa una vez al día (o según su intervalo). */
export function startOpsReminderScheduler(): void {
  if (globalThis.__buffaloOpsReminders) return
  if (process.env.OPS_REMINDERS === '0') return
  globalThis.__buffaloOpsReminders = true

  const tick = () => {
    void runDueOpsReminders().catch((e) => {
      console.warn('[ops-reminders]', e instanceof Error ? e.message : e)
    })
  }

  setTimeout(tick, 45_000)
  setInterval(tick, 15 * 60_000)
}
