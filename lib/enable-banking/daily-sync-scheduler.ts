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
  // eslint-disable-next-line no-var
  var __buffaloBankSyncLastAttempt: number | undefined
}

/**
 * Franjas (hora de Madrid) de la sincronización en segundo plano.
 * Sin nadie delante, PSD2 deja ~4 consultas al día por cuenta: si se gastan antes,
 * el banco rechaza el resto del día. Lo inmediato lo da la sincronización al abrir
 * Finanzas, que va con usuario presente y no tiene ese límite.
 */
export function backgroundSlots(): number[] {
  const raw = process.env.BANK_SYNC_SLOTS || '07:30,11:30,15:30,19:30'
  return raw
    .split(',')
    .map((s) => s.trim().match(/^(\d{1,2}):(\d{2})$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => Number(m[1]) * 60 + Number(m[2]))
    .filter((n) => n >= 0 && n < 24 * 60)
    .sort((a, b) => a - b)
}

function madridMinutesAndOffset(at: Date): { minutes: number; dayStartUtc: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const minutes = get('hour') * 60 + get('minute')
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  const offsetMs = asUtc - Math.floor(at.getTime() / 60000) * 60000
  const dayStartUtc = Date.UTC(get('year'), get('month') - 1, get('day')) - offsetMs
  return { minutes, dayStartUtc }
}

/** Inicio de la última franja ya pasada (o null si hoy aún no ha llegado ninguna). */
export function lastSlotStart(now = Date.now(), slots = backgroundSlots()): number | null {
  const { minutes, dayStartUtc } = madridMinutesAndOffset(new Date(now))
  const passed = slots.filter((s) => s <= minutes)
  if (!passed.length) return null
  return dayStartUtc + passed[passed.length - 1] * 60_000
}

/** Toca sincronizar en segundo plano: ha empezado una franja y desde entonces ni se ha sincronizado ni se ha intentado. */
export function isBackgroundSyncDue(lastSyncedAt: Date | null | undefined, lastAttempt: number | undefined, now = Date.now()): boolean {
  const slot = lastSlotStart(now)
  if (slot == null) return false
  if (lastSyncedAt && lastSyncedAt.getTime() >= slot) return false
  if (lastAttempt && lastAttempt >= slot) return false
  return true
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
  if (!isBackgroundSyncDue(session.last_synced_at, globalThis.__buffaloBankSyncLastAttempt)) {
    return { ran: false, skipped: 'already_fresh' }
  }
  // Se apunta el intento aunque falle: no se vuelve a probar hasta la siguiente franja
  globalThis.__buffaloBankSyncLastAttempt = Date.now()

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
