import { useEffect, useState } from 'react'
import { Loader2, Pause, Play, Plus, Trash2, Copy, Check } from 'lucide-react'

type Flujo = {
  id: string
  name: string
  prompt: string
  interval_minutes: number
  enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
}

type Run = {
  id: string
  trigger: 'manual' | 'cron'
  status: 'running' | 'ok' | 'error'
  output: unknown
  trace: { tool: string; ok: boolean; preview: string }[]
  error: string | null
  started_at: string
  finished_at: string | null
}

const INTERVALO_LABEL: Record<number, string> = {
  0: 'Manual',
  15: 'Cada 15 min',
  60: 'Cada hora',
  360: 'Cada 6 horas',
  1440: 'Diario',
}

const EJEMPLO =
  'Cuenta los errores de este proyecto (incidencias): total, abiertos, resueltos y ocurrencias. ' +
  'Cuenta también los tickets por estado. Si el MCP tiene herramientas de costes o facturación, ' +
  'calcula el coste total del último mes. Devuelve metricas con: errores_total, errores_abiertos, ' +
  'tickets_abiertos, coste_total (o null si no hay dato) y hallazgos.'

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}))
  return (data as { error?: string }).error || fallback
}

/** Flujos de Retención: un prompt, herramientas (MCP, incidencias, tickets), disparador de tiempo y salida JSON. */
export default function FlujosPanel({ proyectoId }: { proyectoId: string }) {
  const base = `/api/retencion/proyectos/${proyectoId}/flujos`
  const [flujos, setFlujos] = useState<Flujo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState(EJEMPLO)
  const [interval, setInterval_] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [copied, setCopied] = useState(false)

  const load = () => {
    setLoading(true)
    fetch(base)
      .then(async (r) => {
        if (!r.ok) throw new Error(await readError(r, 'No se pudieron cargar los flujos'))
        return r.json() as Promise<{ flujos: Flujo[] }>
      })
      .then((d) => setFlujos(d.flujos))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [proyectoId])

  const loadRuns = (flujoId: string) => {
    fetch(`${base}/${flujoId}/runs`)
      .then(async (r) => (r.ok ? ((await r.json()) as { runs: Run[] }) : { runs: [] }))
      .then((d) => setRuns(d.runs))
      .catch(() => setRuns([]))
  }

  const toggleOpen = (id: string) => {
    if (openId === id) {
      setOpenId(null)
      return
    }
    setOpenId(id)
    loadRuns(id)
  }

  const create = async () => {
    setBusy('crear')
    setError('')
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, prompt, interval_minutes: interval, enabled: true }),
      })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo crear el flujo'))
      setCreating(false)
      setName('')
      setPrompt(EJEMPLO)
      setInterval_(0)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el flujo')
    } finally {
      setBusy(null)
    }
  }

  const run = async (id: string) => {
    setBusy(`run-${id}`)
    setError('')
    try {
      const res = await fetch(`${base}/${id}/run`, { method: 'POST' })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo ejecutar el flujo'))
      setOpenId(id)
      loadRuns(id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo ejecutar el flujo')
    } finally {
      setBusy(null)
    }
  }

  const toggle = async (f: Flujo) => {
    setBusy(`pausa-${f.id}`)
    try {
      const res = await fetch(`${base}/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !f.enabled }),
      })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo cambiar el flujo'))
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el flujo')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (f: Flujo) => {
    if (!window.confirm(`¿Borrar el flujo «${f.name}» y su historial?`)) return
    setBusy(`borrar-${f.id}`)
    try {
      const res = await fetch(`${base}/${f.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo borrar el flujo'))
      if (openId === f.id) setOpenId(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar el flujo')
    } finally {
      setBusy(null)
    }
  }

  const copyJson = async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('No se pudo copiar')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Flujos</h2>
          <p className="text-xs text-gray-500">
            Un prompt, tres herramientas (MCP, incidencias, tickets) y una salida en JSON. Puede correr a mano o cada cierto tiempo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gray-900 text-xs font-medium text-white hover:bg-gray-800"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo flujo
        </button>
      </div>

      {creating && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-500">Nombre</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:border-gray-400"
              placeholder="Resumen mensual de errores y costes"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-500">Prompt</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-gray-200 p-3 text-sm leading-relaxed focus:outline-none focus:border-gray-400"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              Disparador
              <select
                value={interval}
                onChange={(e) => setInterval_(Number(e.target.value))}
                className="h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white"
              >
                {Object.entries(INTERVALO_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={create}
              disabled={busy === 'crear' || !name.trim() || prompt.trim().length < 10}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gray-900 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
            >
              {busy === 'crear' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar flujo
            </button>
          </div>
        </div>
      )}

      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-400">Cargando flujos…</p>
      ) : flujos.length === 0 ? (
        <p className="text-sm text-gray-400">Todavía no hay flujos. Crea uno con «Nuevo flujo».</p>
      ) : (
        <ul className="space-y-3">
          {flujos.map((f) => {
            const open = openId === f.id
            const last = open ? runs[0] : undefined
            return (
              <li key={f.id} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{f.name}</p>
                    <p className="text-xs text-gray-500">
                      {INTERVALO_LABEL[f.interval_minutes] || 'Manual'}
                      {!f.enabled && ' · pausado'}
                      {f.last_run_at && ` · última ${new Date(f.last_run_at).toLocaleString('es-ES')}`}
                      {f.enabled && f.next_run_at && ` · próxima ${new Date(f.next_run_at).toLocaleString('es-ES')}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => run(f.id)}
                      disabled={busy === `run-${f.id}`}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gray-900 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
                    >
                      {busy === `run-${f.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Ejecutar
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(f)}
                      disabled={busy === `pausa-${f.id}`}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Pause className="h-3.5 w-3.5" /> {f.enabled ? 'Pausar' : 'Reanudar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleOpen(f.id)}
                      className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {open ? 'Ocultar' : 'Ver salida'}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(f)}
                      disabled={busy === `borrar-${f.id}`}
                      className="inline-flex items-center h-8 px-2 rounded-lg text-red-600 hover:bg-red-50"
                      aria-label="Borrar flujo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="space-y-3">
                    {last ? (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-500">
                            {last.status === 'ok' ? 'Salida JSON' : last.status === 'running' ? 'En curso…' : 'Error'} ·{' '}
                            {last.trigger === 'cron' ? 'programada' : 'manual'} ·{' '}
                            {new Date(last.started_at).toLocaleString('es-ES')}
                          </p>
                          {last.output != null && (
                            <button
                              type="button"
                              onClick={() => copyJson(last.output)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                            >
                              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copiar JSON
                            </button>
                          )}
                        </div>
                        {last.error && <p className="text-xs text-red-700">{last.error}</p>}
                        {last.output != null && (
                          <pre className="max-h-96 overflow-auto rounded-xl bg-gray-950 p-3 text-xs text-gray-100">
                            {JSON.stringify(last.output, null, 2)}
                          </pre>
                        )}
                        {last.trace.length > 0 && (
                          <details className="text-xs text-gray-600">
                            <summary className="cursor-pointer">Herramientas usadas ({last.trace.length})</summary>
                            <ul className="mt-2 space-y-1">
                              {last.trace.map((t, i) => (
                                <li key={i} className="font-mono">
                                  {t.ok ? '✓' : '✗'} {t.tool} — {t.preview.slice(0, 160)}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Todavía no se ha ejecutado.</p>
                    )}
                    {runs.length > 1 && (
                      <p className="text-xs text-gray-400">{runs.length} ejecuciones guardadas.</p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
