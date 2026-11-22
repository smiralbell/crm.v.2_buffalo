/**
 * Sincronización bancaria diaria en background.
 * Arranca con el proceso Next (instrumentation) — no hace falta cron externo.
 * Si ya se sincronizó hace menos de BANK_SYNC_MIN_HOURS, no hace nada.
 */
import { syncEnableBankingTransactions } from '@/lib/enable-banking/sync-transactions'
import { getLatestBankTestSession } from '@/lib/enable-banking/session-store'

declare global {
  // eslint-disable-next-line no-var
  var __buffaloBankSyncSchedulerStarted: boolean | undefined
}

/** Mínimo entre dos sincronizaciones automáticas, en minutos. Por defecto 20 min. */
export function bankSyncMinGapMs(): number {
  const minutes = Number(process.env.BANK_SYNC_MIN_MINUTES || 20)
  const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : 20
  return safe * 60_000
}

export function isBankSyncStale(lastSyncedAt: Date | null | undefined, now = Date.now()): boolean {
  if (!lastSyncedAt) return true
  return now - lastSyncedAt.getTime() >= bankSyncMinGapMs()
}

export async function runDailyBankSyncIfDue(reason: string = 'scheduler'): Promise<{
  ran: boolean
  skipped?: string
  result?: Awaited<ReturnType<typeof syncEnableBankingTransactions>>
  error?: string
}> {
  const session = await getLatestBankTestSession()
  if (!session) {
    return { ran: false, skipped: 'no_bank_connection' }
  }
  if (session.valid_until.getTime() <= Date.now()) {
    return { ran: false, skipped: 'bank_consent_expired' }
  }
  if (!isBankSyncStale(session.last_synced_at)) {
    return { ran: false, skipped: 'already_fresh' }
  }

  try {
    console.info(`[bank-sync] auto (${reason}) · incremental`)
    const result = await syncEnableBankingTransactions({ mode: 'incremental', debugSample: false })
    console.info(
      `[bank-sync] auto ok · inserted=${result.inserted} total=${result.total}`
    )
    return { ran: true, result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[bank-sync] auto failed (${reason}):`, message)
    return { ran: false, error: message }
  }
}

/** Intervalo de comprobación (ms). Por defecto 20 min: así los movimientos nuevos salen en el día. */
export function checkIntervalMs(): number {
  const minutes = Number(process.env.BANK_SYNC_CHECK_MINUTES || 20)
  const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : 20
  return safe * 60_000
}

/**
 * Programa comprobaciones periódicas mientras el proceso Node esté vivo (`next start`).
 * Idempotente ante hot-reload / workers.
 */
export function startBankSyncScheduler(): void {
  if (process.env.BANK_SYNC_SCHEDULER === '0') {
    console.info('[bank-sync] scheduler desactivado (BANK_SYNC_SCHEDULER=0)')
    return
  }
  if (globalThis.__buffaloBankSyncSchedulerStarted) return
  globalThis.__buffaloBankSyncSchedulerStarted = true

  const bootDelayMs = Number(process.env.BANK_SYNC_BOOT_DELAY_MS || 90_000)
  const interval = checkIntervalMs()

  console.info(
    `[bank-sync] scheduler activo · check cada ${Math.round(interval / 60000)} min · min gap ${Math.round(bankSyncMinGapMs() / 60000)} min`
  )

  const tick = () => {
    void runDailyBankSyncIfDue('scheduler')
  }

  setTimeout(() => {
    tick()
    setInterval(tick, interval)
  }, Number.isFinite(bootDelayMs) ? Math.max(10_000, bootDelayMs) : 90_000)
}
