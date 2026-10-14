/**
 * Todas las tareas automáticas del CRM en un solo sitio.
 *
 * - En producción las ejecuta el worker (`npm run worker`, otro servicio en EasyPanel
 *   con la misma imagen). Así corren aunque nadie entre en el CRM tras un despliegue.
 * - El proceso web también arranca este runner al primer /api/auth/me (como hacían los
 *   schedulers antiguos). Con el bloqueo en BD da igual que corran los dos: cada tarea se
 *   ejecuta una sola vez. Si hay worker, se puede apagar en la web con WEB_RUN_JOBS=0.
 */
import { ensureMigrations } from '@/lib/migrations/runner'
import { onScheduledJobFailure, processOwnerId, runJobIfDue, type ScheduledJob } from '@/lib/jobs/scheduler'
import { drainQueue, pruneQueue, registerQueueHandler } from '@/lib/jobs/queue'

const MIN = 60_000
const HOUR = 60 * MIN

declare global {
  // eslint-disable-next-line no-var
  var __buffaloJobsRunnerActive: boolean | undefined
}

export const SCHEDULED_JOBS: ScheduledJob[] = [
  {
    name: 'bank-sync',
    label: 'Sincronización bancaria',
    everyMs: Number(process.env.BANK_SYNC_CHECK_HOURS || 1) * HOUR,
    leaseMs: 30 * MIN,
    enabled: () => process.env.BANK_SYNC_SCHEDULER !== '0',
    run: async () => {
      const { runDailyBankSyncIfDue } = await import('@/lib/enable-banking/daily-sync-scheduler')
      const r = await runDailyBankSyncIfDue('worker')
      if (r.error) throw new Error(r.error)
      return r.ran ? `${r.result?.inserted ?? 0} movimientos nuevos` : `sin cambios (${r.skipped})`
    },
  },
  {
    name: 'gmail-sync',
    label: 'Correos de Gmail → historial',
    everyMs: Math.max(2, Number(process.env.GMAIL_SYNC_MINUTES || 10)) * MIN,
    enabled: () => process.env.GMAIL_SYNC_SCHEDULER !== '0',
    run: async () => {
      const { runGmailSyncOnce } = await import('@/lib/integrations/google/gmail-sync-scheduler')
      const r = await runGmailSyncOnce('worker')
      if (!r.ran) return `omitido (${r.skipped})`
      const inserted = r.results.reduce((n, x) => n + x.inserted, 0)
      return `${inserted} correo(s) al historial`
    },
  },
  {
    name: 'blog-engine',
    label: 'Motor del blog',
    everyMs: 10 * MIN,
    leaseMs: 45 * MIN,
    enabled: () => process.env.BLOG_SCHEDULER !== '0',
    run: async () => {
      const { tick } = await import('@/lib/blog/engine')
      const r = await tick('worker')
      return r.message
    },
  },
  {
    name: 'inbound-retry',
    label: 'Reintentos de webhooks (ingesta)',
    everyMs: 1 * MIN,
    run: async () => {
      const { retryDueInboundEvents } = await import('@/lib/ingest/events')
      const r = await retryDueInboundEvents()
      return `${r.processed} procesados · ${r.failed} fallidos`
    },
  },
  {
    name: 'queue',
    label: 'Cola de trabajos',
    everyMs: 30_000,
    leaseMs: 10 * MIN,
    run: async () => {
      const r = await drainQueue()
      return `${r.done} hechos · ${r.failed} fallidos`
    },
  },
  {
    name: 'auto-reconcile',
    label: 'Conciliación automática de cobros',
    everyMs: 1 * HOUR,
    enabled: () => process.env.AUTO_RECONCILE !== '0',
    run: async () => {
      const { autoReconcileIncomes } = await import('@/lib/finance/auto-reconcile')
      const r = await autoReconcileIncomes()
      return `${r.linked} cobro(s) vinculados · ${r.ambiguous} dudosos`
    },
  },
  {
    name: 'health-watch',
    label: 'Vigilancia de integraciones',
    everyMs: 6 * HOUR,
    run: async () => {
      const { watchIntegrationHealth } = await import('@/lib/health/watch')
      const r = await watchIntegrationHealth()
      return r.warnings.length ? r.warnings.join(' · ') : 'todo en orden'
    },
  },
  {
    name: 'daily-briefing',
    label: 'Briefing diario por WhatsApp',
    everyMs: 15 * MIN,
    enabled: () => process.env.DAILY_BRIEFING !== '0',
    run: async () => {
      const { sendDueBriefings } = await import('@/lib/briefing/daily')
      const r = await sendDueBriefings()
      return r.sent ? `${r.sent} briefing(s) enviados` : r.reason
    },
  },
  {
    name: 'ads-sync',
    label: 'Gasto Meta / Google Ads',
    everyMs: 24 * HOUR,
    leaseMs: 15 * MIN,
    enabled: () =>
      process.env.ADS_SYNC !== '0' &&
      Boolean(
        (process.env.META_ADS_ACCESS_TOKEN?.trim() && process.env.META_ADS_ACCOUNT_ID?.trim()) ||
          (process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() && process.env.GOOGLE_ADS_CUSTOMER_ID?.trim())
      ),
    run: async () => {
      const { syncAdSpend } = await import('@/lib/ads/sync')
      const r = await syncAdSpend({ days: Number(process.env.ADS_SYNC_DAYS || 14) })
      return `meta ${r.meta} · google ${r.google}`
    },
  },
  {
    name: 'housekeeping',
    label: 'Limpieza (cola, avisos, registros IA)',
    everyMs: 24 * HOUR,
    run: async () => {
      const { pruneNotifications } = await import('@/lib/notifications')
      const { query } = await import('@/lib/db')
      const q = await pruneQueue()
      const n = await pruneNotifications()
      const ai = await query(`DELETE FROM ai_calls WHERE created_at < NOW() - INTERVAL '180 days'`)
      const ev = await query(
        `DELETE FROM inbound_events WHERE status IN ('processed', 'ignored') AND received_at < NOW() - INTERVAL '90 days'`
      )
      return `cola ${q} · avisos ${n} · IA ${ai.rowCount} · eventos ${ev.rowCount}`
    },
  },
]

function registerQueueHandlers() {
  registerQueueHandler('notify.whatsapp', async (payload) => {
    const { sendWasenderTextMessage } = await import('@/lib/demos/wasender')
    const { phoneToWasenderRecipient } = await import('@/lib/demos/phone')
    const phone = String(payload.phone || '')
    const text = String(payload.text || '')
    if (!phone || !text) return
    await sendWasenderTextMessage(phoneToWasenderRecipient(phone), text)
  })
}

function registerFailureAlerts() {
  onScheduledJobFailure(async (job, message, consecutive) => {
    // Al tercer fallo seguido se avisa (y no se repite el mismo aviso en el día)
    if (consecutive !== 3) return
    const { notify } = await import('@/lib/notifications')
    await notify({
      to: { roles: ['admin'] },
      kind: 'sistema.fallo',
      title: `Falla «${job.label}» (3 veces seguidas)`,
      body: message.slice(0, 400),
      link: '/sistema',
      severity: 'urgent',
      dedupeKey: `job-fail:${job.name}:${new Date().toISOString().slice(0, 10)}`,
    })
  })
}

export function findScheduledJob(name: string): ScheduledJob | undefined {
  return SCHEDULED_JOBS.find((j) => j.name === name)
}

/** Ejecuta una tarea ya (botón «Ejecutar ahora» de la pantalla de salud). */
export async function runScheduledJobNow(name: string, owner = processOwnerId('manual')) {
  const job = findScheduledJob(name)
  if (!job) throw new Error(`Tarea desconocida: ${name}`)
  registerQueueHandlers()
  return runJobIfDue(job, owner, { force: true })
}

const TICK_MS = 15_000

/**
 * Arranca el bucle de tareas en este proceso (idempotente).
 * Si las migraciones no se pueden aplicar, vuelve a los schedulers antiguos para no perder nada.
 */
export async function startJobsRunner(mode: 'web' | 'worker'): Promise<void> {
  if (globalThis.__buffaloJobsRunnerActive) return
  if (mode === 'web' && process.env.WEB_RUN_JOBS === '0') return
  globalThis.__buffaloJobsRunnerActive = true

  const migrated = await ensureMigrations()
  if (!migrated) {
    globalThis.__buffaloJobsRunnerActive = false
    if (mode === 'web') await startLegacySchedulers()
    else throw new Error('No se pudieron aplicar las migraciones; el worker no arranca.')
    return
  }

  registerQueueHandlers()
  registerFailureAlerts()
  const owner = processOwnerId(mode)
  const inFlight = new Set<string>()

  const tick = () => {
    for (const job of SCHEDULED_JOBS) {
      if (inFlight.has(job.name)) continue
      inFlight.add(job.name)
      void runJobIfDue(job, owner)
        .catch((e) => console.warn(`[jobs] ${job.name}:`, e instanceof Error ? e.message : e))
        .finally(() => inFlight.delete(job.name))
    }
  }

  // Pequeño retraso al arrancar para no competir con el arranque del servidor
  const bootDelay = mode === 'web' ? 60_000 : 5_000
  setTimeout(() => {
    tick()
    setInterval(tick, TICK_MS)
  }, bootDelay)
  console.info(`[jobs] runner activo (${mode}) · ${SCHEDULED_JOBS.length} tareas`)
}

async function startLegacySchedulers() {
  const bank = await import('@/lib/enable-banking/daily-sync-scheduler')
  bank.startBankSyncScheduler()
  const gmail = await import('@/lib/integrations/google/gmail-sync-scheduler')
  gmail.startGmailSyncScheduler()
  const blog = await import('@/lib/blog/engine')
  blog.ensureRunner()
}
