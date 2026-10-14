import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminAPI } from '@/lib/auth'

/**
 * GET  /api/sistema                       → estado completo (integraciones, avisos, tareas, ingesta, IA, migraciones)
 * POST /api/sistema { action: 'run_job', name }          → ejecuta una tarea ya
 * POST /api/sistema { action: 'reprocess_event', id }    → reprocesa un webhook guardado
 * POST /api/sistema { action: 'test_alert' }             → envía un aviso de prueba (correo + Telegram)
 */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<{ data: T; error?: string }> {
  try {
    return { data: await fn() }
  } catch (e) {
    return { data: fallback, error: e instanceof Error ? e.message : String(e) }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
  } catch {
    return
  }

  if (req.method === 'POST') {
    const action = String(req.body?.action || '')
    try {
      if (action === 'run_job') {
        const { runScheduledJobNow } = await import('@/lib/jobs/registry')
        return res.status(200).json(await runScheduledJobNow(String(req.body?.name || '')))
      }
      if (action === 'reprocess_event') {
        const id = String(req.body?.id || '')
        if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'id inválido' })
        const { reprocessInboundEvent } = await import('@/lib/ingest/events')
        return res.status(200).json(await reprocessInboundEvent(id))
      }
      if (action === 'migrate') {
        const { runMigrations } = await import('@/lib/migrations/runner')
        return res.status(200).json(await runMigrations())
      }
      if (action === 'test_alert') {
        const { sendTestAlert } = await import('@/lib/alerts')
        const result = await sendTestAlert()
        if (result.error && result.email !== 'sent' && result.telegram !== 'sent') {
          return res.status(400).json({ error: result.error, ...result })
        }
        return res.status(200).json({
          outcome: 'ran',
          message: `Correo ${result.email} · Telegram ${result.telegram}${result.error ? ` · ${result.error}` : ''}`,
          ...result,
        })
      }
      return res.status(400).json({ error: 'Acción desconocida' })
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })

  const [{ integrationHealth }, scheduler, registry, queue, ingest, ai, migrations, audit, alerts] = await Promise.all([
    import('@/lib/health/watch'),
    import('@/lib/jobs/scheduler'),
    import('@/lib/jobs/registry'),
    import('@/lib/jobs/queue'),
    import('@/lib/ingest/events'),
    import('@/lib/ai/gateway'),
    import('@/lib/migrations/runner'),
    import('@/lib/audit/log'),
    import('@/lib/alerts'),
  ])

  const [integrations, jobsRows, queueStats, inboundStats, failedEvents, recentEvents, aiUsage, migrationState, auditRows, recentAlerts] =
    await Promise.all([
      safe(() => integrationHealth(), []),
      safe(() => scheduler.listSystemJobs(), []),
      safe(() => queue.queueStats(), { pending: 0, running: 0, failed: 0, doneToday: 0 }),
      safe(() => ingest.inboundEventStats(), []),
      safe(() => ingest.listInboundEvents({ status: 'failed', limit: 20 }), []),
      safe(() => ingest.listInboundEvents({ limit: 20 }), []),
      safe(() => ai.aiUsageByModule(30), []),
      safe(() => migrations.migrationStatus(), { files: 0, applied: [], pending: [], changedAfterApply: [] }),
      safe(() => audit.listAuditLog(30), []),
      safe(() => alerts.listRecentAlerts(8), []),
    ])

  const byName = new Map(jobsRows.data.map((j) => [j.name, j]))
  const jobs = registry.SCHEDULED_JOBS.map((j) => ({
    name: j.name,
    label: j.label,
    every_minutes: Math.round(j.everyMs / 60_000),
    enabled: j.enabled ? j.enabled() : true,
    ...(byName.get(j.name) || {}),
  }))

  return res.status(200).json({
    generated_at: new Date().toISOString(),
    runner_active_here: Boolean(globalThis.__buffaloJobsRunnerActive),
    integrations: integrations.data,
    alerts: { ...alerts.alertsStatus(), recent: recentAlerts.data },
    jobs,
    queue: queueStats.data,
    inbound: { stats: inboundStats.data, failed: failedEvents.data, recent: recentEvents.data },
    ai: aiUsage.data,
    migrations: migrationState.data,
    audit: auditRows.data,
    errors: Object.fromEntries(
      Object.entries({
        integrations, jobs: jobsRows, queue: queueStats, inbound: inboundStats, ai: aiUsage,
        migrations: migrationState, audit: auditRows,
      })
        .filter(([, v]) => v.error)
        .map(([k, v]) => [k, v.error])
    ),
  })
}
