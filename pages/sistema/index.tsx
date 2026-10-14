import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2, Play, RefreshCw, RotateCcw, Send } from 'lucide-react'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin') {
      return { redirect: { destination: '/dashboard', permanent: false } }
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

type State = 'ok' | 'warning' | 'error' | 'off'
type Integration = { key: string; name: string; state: State; detail: string; link?: string }
type Job = {
  name: string
  label: string
  every_minutes: number
  enabled: boolean
  last_started_at?: string | null
  last_finished_at?: string | null
  last_status?: string | null
  last_message?: string | null
  last_duration_ms?: number | null
  runs?: number
  failures?: number
  consecutive_failures?: number
  locked_until?: string | null
}
type InboundEvent = {
  id: string
  source: string
  event_type: string | null
  status: string
  attempts: number
  last_error: string | null
  received_at: string
}
type SystemData = {
  generated_at: string
  runner_active_here: boolean
  integrations: Integration[]
  jobs: Job[]
  queue: { pending: number; running: number; failed: number; doneToday: number }
  inbound: {
    stats: Array<{ source: string; last24h: number; failed: number; pending: number; last_received_at: string | null }>
    failed: InboundEvent[]
    recent: InboundEvent[]
  }
  ai: Array<{ module: string; calls: number; errors: number; cost_usd: number; tokens: number; avg_ms: number }>
  migrations: { files: number; applied: string[]; pending: string[]; changedAfterApply: string[] }
  audit: Array<{ id: string; actor: string; action: string; target_table: string | null; ok: boolean; created_at: string }>
  errors: Record<string, string>
  alerts?: {
    smtp: boolean
    telegram: boolean
    emails: string[]
    telegram_chats: number
    ready: boolean
    recent: Array<{
      id: string
      kind: string
      title: string
      email_status: string | null
      telegram_status: string | null
      last_error: string | null
      created_at: string
    }>
  }
}

const stateStyle: Record<State, { dot: string; label: string }> = {
  ok: { dot: 'bg-emerald-500', label: 'Bien' },
  warning: { dot: 'bg-amber-500', label: 'Aviso' },
  error: { dot: 'bg-red-500', label: 'Error' },
  off: { dot: 'bg-gray-300', label: 'Apagado' },
}

const ago = (iso?: string | null) =>
  iso ? formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es }) : '—'

const eur = (usd: number) => `${usd.toFixed(usd < 1 ? 3 : 2)} $`

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export default function SistemaPage() {
  const [data, setData] = useState<SystemData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/sistema')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo cargar')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const post = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    setNotice('')
    try {
      const res = await fetch('/api/sistema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falló')
      setNotice(
        json.outcome
          ? `${json.outcome === 'ran' ? 'Ejecutada' : json.outcome === 'locked' ? 'Ya se está ejecutando' : json.outcome}: ${json.message || ''}`
          : json.status
            ? `Evento ${json.status}${json.error ? `: ${json.error}` : ''}`
            : 'Hecho'
      )
      await load()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Falló')
    } finally {
      setBusy(null)
    }
  }

  const aiTotal = data?.ai.reduce((s, r) => s + r.cost_usd, 0) ?? 0

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Salud del sistema</h1>
            <p className="mt-1 text-sm text-gray-500">
              Integraciones, tareas automáticas, webhooks recibidos, gasto de IA y cambios hechos por el MCP o el asistente.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Actualizar
          </Button>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-700">{notice}</p>}
        {data && Object.keys(data.errors).length > 0 && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Algunas secciones no se pudieron leer ({Object.keys(data.errors).join(', ')}). Si es la primera vez,
            aplica las migraciones abajo.
          </p>
        )}

        {!data && loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {data && (
          <>
            {data.alerts && (
            <Section
              title="Avisos a administradores"
              hint="Correo y Telegram. Las credenciales van en EasyPanel / .env."
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <ul className="space-y-1 text-sm text-gray-700">
                  <li>
                    Correo:{' '}
                    {data.alerts.smtp
                      ? data.alerts.emails.length
                        ? `listo · ${data.alerts.emails.join(', ')}`
                        : 'SMTP listo, falta ADMIN_ALERT_EMAILS'
                      : 'sin configurar (SMTP_HOST, SMTP_USER, SMTP_PASS)'}
                  </li>
                  <li>
                    Telegram:{' '}
                    {data.alerts.telegram
                      ? `listo · ${data.alerts.telegram_chats} chat(s)`
                      : 'sin configurar (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)'}
                  </li>
                </ul>
                <Button
                  size="sm"
                  className="gap-1.5 rounded-xl"
                  disabled={busy !== null || !data.alerts.ready}
                  onClick={() => void post('test_alert', { action: 'test_alert' })}
                >
                  {busy === 'test_alert' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enviar prueba
                </Button>
              </div>
              {data.alerts.recent.length > 0 && (
                <ul className="mt-4 divide-y divide-gray-100">
                  {data.alerts.recent.map((a) => (
                    <li key={a.id} className="py-2 text-sm">
                      <p className="text-gray-900">{a.title}</p>
                      <p className="text-xs text-gray-500">
                        {a.kind} · correo {a.email_status || '—'} · telegram {a.telegram_status || '—'} · {ago(a.created_at)}
                      </p>
                      {a.last_error && <p className="text-xs text-red-600">{a.last_error}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            )}

            <Section title="Integraciones" hint="Se revisan cada 6 h y avisan a los admins antes de caducar.">
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {data.integrations.map((i) => (
                  <li key={i.key} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', stateStyle[i.state].dot)} />
                      <p className="text-sm font-medium text-gray-900">{i.name}</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">{i.detail}</p>
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              title="Tareas automáticas"
              hint={`Bloqueo en base de datos: aunque corran la web y el worker, cada tarea se ejecuta una vez. Cola: ${data.queue.pending} pendientes · ${data.queue.failed} fallidos · ${data.queue.doneToday} hechos hoy.`}
            >
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                      <th className="px-5 py-2 font-medium">Tarea</th>
                      <th className="px-3 py-2 font-medium">Cada</th>
                      <th className="px-3 py-2 font-medium">Última</th>
                      <th className="px-3 py-2 font-medium">Resultado</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((j) => (
                      <tr key={j.name} className="border-b border-gray-50 align-top">
                        <td className="px-5 py-2.5">
                          <p className="font-medium text-gray-900">{j.label}</p>
                          {!j.enabled && <p className="text-xs text-gray-400">Desactivada por configuración</p>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">
                          {j.every_minutes >= 60 ? `${Math.round(j.every_minutes / 60)} h` : `${j.every_minutes || '<1'} min`}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">{ago(j.last_finished_at || j.last_started_at)}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              'text-xs',
                              j.last_status === 'error' ? 'text-red-600' : j.last_status === 'ok' ? 'text-emerald-700' : 'text-gray-400'
                            )}
                          >
                            {j.last_message || (j.last_status ? j.last_status : 'Sin ejecutar')}
                          </span>
                          {(j.consecutive_failures ?? 0) > 0 && (
                            <p className="text-xs text-red-500">{j.consecutive_failures} fallo(s) seguidos</p>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 gap-1 rounded-lg"
                            disabled={busy !== null || !j.enabled}
                            onClick={() => void post(`job:${j.name}`, { action: 'run_job', name: j.name })}
                          >
                            {busy === `job:${j.name}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                            Ejecutar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Webhooks recibidos (ingesta)" hint="Cada evento se guarda antes de procesarse. Los fallidos se reintentan solos; aquí puedes reprocesarlos.">
              <ul className="mb-4 flex flex-wrap gap-2">
                {data.inbound.stats.length === 0 && <li className="text-sm text-gray-500">Aún no ha llegado ningún evento.</li>}
                {data.inbound.stats.map((s) => (
                  <li key={s.source} className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    <span className="font-semibold">{s.source}</span> · {s.last24h} en 24 h
                    {s.failed > 0 && <span className="text-red-600"> · {s.failed} fallidos</span>}
                    {s.pending > 0 && <span className="text-amber-600"> · {s.pending} pendientes</span>}
                    <span className="text-gray-400"> · último {ago(s.last_received_at)}</span>
                  </li>
                ))}
              </ul>
              {(data.inbound.failed.length ? data.inbound.failed : data.inbound.recent).length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {(data.inbound.failed.length ? data.inbound.failed : data.inbound.recent).slice(0, 15).map((ev) => (
                    <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-gray-900">
                          #{ev.id} · {ev.source}
                          {ev.event_type ? ` · ${ev.event_type}` : ''}{' '}
                          <span className={cn('text-xs', ev.status === 'failed' ? 'text-red-600' : 'text-gray-500')}>
                            {ev.status}
                            {ev.attempts > 1 ? ` (${ev.attempts} intentos)` : ''}
                          </span>
                        </p>
                        {ev.last_error && <p className="truncate text-xs text-red-500">{ev.last_error}</p>}
                        <p className="text-xs text-gray-400">{ago(ev.received_at)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 rounded-lg"
                        disabled={busy !== null}
                        onClick={() => void post(`ev:${ev.id}`, { action: 'reprocess_event', id: ev.id })}
                      >
                        {busy === `ev:${ev.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        Reprocesar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={`Gasto de IA · últimos 30 días · ${eur(aiTotal)}`} hint="Cada llamada a OpenRouter queda registrada con su módulo, tokens y coste.">
              {data.ai.length === 0 ? (
                <p className="text-sm text-gray-500">Sin llamadas registradas todavía.</p>
              ) : (
                <div className="-mx-5 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                        <th className="px-5 py-2 font-medium">Módulo</th>
                        <th className="px-3 py-2 text-right font-medium">Llamadas</th>
                        <th className="px-3 py-2 text-right font-medium">Errores</th>
                        <th className="px-3 py-2 text-right font-medium">Tokens</th>
                        <th className="px-3 py-2 text-right font-medium">Media</th>
                        <th className="px-5 py-2 text-right font-medium">Coste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ai.map((r) => (
                        <tr key={r.module} className="border-b border-gray-50">
                          <td className="px-5 py-2 font-medium text-gray-900">{r.module}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.calls}</td>
                          <td className={cn('px-3 py-2 text-right tabular-nums', r.errors && 'text-red-600')}>{r.errors}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.tokens.toLocaleString('es-ES')}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{(r.avg_ms / 1000).toFixed(1)} s</td>
                          <td className="px-5 py-2 text-right tabular-nums">{eur(r.cost_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <div className="grid gap-5 xl:grid-cols-2">
              <Section title="Migraciones de base de datos" hint="Se aplican solas al desplegar. db/migrations.">
                <p className="text-sm text-gray-700">
                  {data.migrations.applied.length} aplicadas de {data.migrations.files}
                  {data.migrations.pending.length > 0 && (
                    <span className="text-amber-700"> · pendientes: {data.migrations.pending.join(', ')}</span>
                  )}
                </p>
                {data.migrations.changedAfterApply.length > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    Modificadas tras aplicarse (no se reaplican): {data.migrations.changedAfterApply.join(', ')}
                  </p>
                )}
                {data.migrations.pending.length > 0 && (
                  <Button
                    size="sm"
                    className="mt-3 rounded-xl"
                    disabled={busy !== null}
                    onClick={() => void post('migrate', { action: 'migrate' })}
                  >
                    {busy === 'migrate' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Aplicar ahora
                  </Button>
                )}
              </Section>

              <Section title="Auditoría" hint="Cambios hechos por el MCP y por el asistente de WhatsApp.">
                {data.audit.length === 0 ? (
                  <p className="text-sm text-gray-500">Sin cambios registrados.</p>
                ) : (
                  <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
                    {data.audit.map((a) => (
                      <li key={a.id} className="py-2 text-sm">
                        <span className={cn('font-medium', a.ok ? 'text-gray-900' : 'text-red-600')}>{a.action}</span>
                        <span className="text-gray-500">
                          {' '}
                          · {a.actor}
                          {a.target_table ? ` · ${a.target_table}` : ''} · {ago(a.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
