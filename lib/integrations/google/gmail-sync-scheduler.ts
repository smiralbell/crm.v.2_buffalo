/**
 * Sync Gmail → historial CRM en background mientras viva el proceso Node.
 * Arranca desde /api/auth/me (igual que el sync bancario). GMAIL_SYNC_SCHEDULER=0 lo desactiva.
 */
import { syncGmailToCrm } from '@/lib/integrations/google/gmail-sync'

declare global {
  // eslint-disable-next-line no-var
  var __buffaloGmailSyncSchedulerStarted: boolean | undefined
  // eslint-disable-next-line no-var
  var __buffaloGmailSyncRunning: boolean | undefined
}

function intervalMs(): number {
  const minutes = Number(process.env.GMAIL_SYNC_MINUTES || 10)
  const safe = Number.isFinite(minutes) && minutes >= 2 ? minutes : 10
  return safe * 60 * 1000
}

/** Ejecuta una pasada salvo que ya haya otra en curso. */
export async function runGmailSyncOnce(reason: string, ownerKey?: string) {
  if (globalThis.__buffaloGmailSyncRunning) return { ran: false as const, skipped: 'running' }
  globalThis.__buffaloGmailSyncRunning = true
  try {
    const results = await syncGmailToCrm({ ownerKey })
    const inserted = results.reduce((n, r) => n + r.inserted, 0)
    if (inserted > 0) console.info(`[gmail-sync] ${reason} · ${inserted} correo(s) al historial`)
    return { ran: true as const, results }
  } finally {
    globalThis.__buffaloGmailSyncRunning = false
  }
}

export function startGmailSyncScheduler(): void {
  if (process.env.GMAIL_SYNC_SCHEDULER === '0') return
  if (globalThis.__buffaloGmailSyncSchedulerStarted) return
  globalThis.__buffaloGmailSyncSchedulerStarted = true

  const tick = () => {
    void runGmailSyncOnce('scheduler').catch((e) =>
      console.warn('[gmail-sync] scheduler:', e instanceof Error ? e.message : e)
    )
  }
  setTimeout(() => {
    tick()
    setInterval(tick, intervalMs())
  }, 60_000)
}
