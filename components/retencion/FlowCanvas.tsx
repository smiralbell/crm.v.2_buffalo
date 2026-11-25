import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import {
  AlertTriangle,
  Bot,
  Braces,
  Check,
  Clock,
  Copy,
  Focus,
  History,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plug,
  Save,
  Ticket,
  Trash2,
  X,
} from 'lucide-react'
import styles from './WatchSystemMap.module.css'

export type Herramienta = 'mcp' | 'incidencias' | 'tickets'

export type Flujo = {
  id: string
  name: string
  prompt: string
  interval_minutes: number
  enabled: boolean
  tools: Herramienta[]
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
}

type NodeId = 'trigger' | Herramienta | 'agent' | 'output'

const NODES: { id: NodeId; label: string; x: number; y: number }[] = [
  { id: 'trigger', label: 'Disparador', x: -470, y: 0 },
  { id: 'mcp', label: 'MCP', x: -160, y: -150 },
  { id: 'incidencias', label: 'Incidencias', x: -160, y: 0 },
  { id: 'tickets', label: 'Tickets', x: -160, y: 150 },
  { id: 'agent', label: 'Agente IA', x: 170, y: 0 },
  { id: 'output', label: 'Salida JSON', x: 470, y: 0 },
]

const EDGES: [NodeId, NodeId][] = [
  ['trigger', 'mcp'],
  ['trigger', 'incidencias'],
  ['trigger', 'tickets'],
  ['mcp', 'agent'],
  ['incidencias', 'agent'],
  ['tickets', 'agent'],
  ['agent', 'output'],
]

const ICONS: Record<NodeId, typeof Clock> = {
  trigger: Clock,
  mcp: Plug,
  incidencias: AlertTriangle,
  tickets: Ticket,
  agent: Bot,
  output: Braces,
}

const TOOL_OF_FN: Record<string, Herramienta> = {
  mcp_listar_herramientas: 'mcp',
  mcp_llamar_herramienta: 'mcp',
  incidencias_listar: 'incidencias',
  tickets_listar: 'tickets',
}

const TOOL_TEXT: Record<Herramienta, string> = {
  mcp: 'Lee las herramientas del MCP conectado al proyecto (pestaña MCP). Solo lectura: si el MCP permite escribir, no se usa.',
  incidencias: 'Errores de producción del proyecto: estado, ocurrencias y fechas, con recuentos por estado.',
  tickets: 'Tickets de cliente del proyecto: estado, prioridad y fechas, con recuentos por estado.',
}

export const INTERVALOS: { value: number; label: string }[] = [
  { value: 0, label: 'Manual' },
  { value: 15, label: 'Cada 15 min' },
  { value: 60, label: 'Cada hora' },
  { value: 360, label: 'Cada 6 horas' },
  { value: 1440, label: 'Diario' },
]

export function intervaloLabel(min: number): string {
  return INTERVALOS.find((i) => i.value === min)?.label || 'Manual'
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const x1 = a.x + 98
  const x2 = b.x - 104
  const mid = (x1 + x2) / 2
  return `M ${x1} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${x2} ${b.y}`
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}))
  return (data as { error?: string }).error || fallback
}

/** Un flujo como lienzo de nodos: disparador → herramientas → agente → salida JSON. */
export default function FlowCanvas({
  proyectoId,
  flujo,
  canEdit,
  onChanged,
  onDeleted,
}: {
  proyectoId: string
  flujo: Flujo
  canEdit: boolean
  onChanged: (f: Flujo) => void
  onDeleted: () => void
}) {
  const base = `/api/retencion/proyectos/${proyectoId}/flujos/${flujo.id}`
  const stageRef = useRef<HTMLDivElement>(null)
  const [cam, setCam] = useState({ x: 0, y: 0, scale: 0.75 })
  const pan = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const [recenter, setRecenter] = useState(0)

  const [selected, setSelected] = useState<NodeId | null>(null)
  const [wide, setWide] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])
  const [runIndex, setRunIndex] = useState(0)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const [name, setName] = useState(flujo.name)
  const [prompt, setPrompt] = useState(flujo.prompt)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(flujo.name)
    setPrompt(flujo.prompt)
  }, [flujo.id, flujo.name, flujo.prompt])

  useEffect(() => {
    const w = stageRef.current?.clientWidth || 900
    setCam({ x: 0, y: 0, scale: clamp((w - 48) / 1200, 0.45, 1) })
  }, [flujo.id, recenter])

  const loadRuns = () => {
    fetch(`${base}/runs`)
      .then(async (r) => (r.ok ? ((await r.json()) as { runs: Run[] }) : { runs: [] }))
      .then((d) => {
        setRuns(d.runs)
        setRunIndex(0)
      })
      .catch(() => setRuns([]))
  }

  useEffect(() => {
    setSelected(null)
    setError('')
    loadRuns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flujo.id])

  const lastRun = runs[runIndex]
  const usedTools = useMemo(() => {
    const set = new Set<Herramienta>()
    for (const t of lastRun?.trace || []) {
      const g = TOOL_OF_FN[t.tool]
      if (g && t.ok) set.add(g)
    }
    return set
  }, [lastRun])

  const isOn = (id: NodeId) => (id === 'mcp' || id === 'incidencias' || id === 'tickets' ? flujo.tools.includes(id) : true)
  const isDone = (id: NodeId) => {
    if (!lastRun || running) return false
    if (id === 'trigger') return true
    if (id === 'mcp' || id === 'incidencias' || id === 'tickets') return usedTools.has(id)
    return lastRun.status === 'ok'
  }

  const subOf = (id: NodeId): string => {
    if (id === 'trigger') return `${intervaloLabel(flujo.interval_minutes)}${flujo.enabled ? '' : ' · pausado'}`
    if (id === 'mcp' || id === 'incidencias' || id === 'tickets') return flujo.tools.includes(id) ? 'activada' : 'desactivada'
    if (id === 'agent') return flujo.prompt.slice(0, 40) || 'sin prompt'
    if (!lastRun) return 'sin ejecutar'
    return lastRun.status === 'ok' ? 'JSON listo' : lastRun.status === 'error' ? 'error' : 'en curso'
  }

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(base, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo guardar'))
      const d = (await res.json()) as { flujo: Flujo }
      onChanged(d.flujo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const toggleTool = (tool: Herramienta) => {
    const next = flujo.tools.includes(tool) ? flujo.tools.filter((t) => t !== tool) : [...flujo.tools, tool]
    if (next.length === 0) {
      setError('El agente necesita al menos una herramienta')
      return
    }
    void patch({ tools: next })
  }

  const runNow = async () => {
    setRunning(true)
    setError('')
    try {
      const res = await fetch(`${base}/run`, { method: 'POST' })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo ejecutar el flujo'))
      loadRuns()
      setSelected('output')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo ejecutar el flujo')
    } finally {
      setRunning(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`¿Borrar el flujo «${flujo.name}» y su historial?`)) return
    const res = await fetch(base, { method: 'DELETE' })
    if (res.ok) onDeleted()
    else setError(await readError(res, 'No se pudo borrar el flujo'))
  }

  const copyJson = async () => {
    if (!lastRun) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(lastRun.output, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('No se pudo copiar')
    }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    if (t.closest('[data-hud]') || t.closest('[data-sheet]') || t.closest('[data-node]')) return
    pan.current = { x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y }
    setPanning(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pan.current
    if (!p) return
    setCam((c) => ({ ...c, x: p.camX + (e.clientX - p.x), y: p.camY + (e.clientY - p.y) }))
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pan.current = null
    setPanning(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-sheet],[data-hud]')) return
    setCam((c) => ({ ...c, scale: clamp(c.scale * (e.deltaY > 0 ? 0.92 : 1.08), 0.45, 1.6) }))
  }

  const sheetTitle: Record<NodeId, string> = {
    trigger: 'Disparador',
    mcp: 'MCP del proyecto',
    incidencias: 'Incidencias',
    tickets: 'Tickets',
    agent: 'Agente IA',
    output: 'Salida JSON',
  }

  return (
    <div
      ref={stageRef}
      className={`${styles.stage} ${panning ? styles.stagePanning : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <div className={styles.world} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})` }}>
        <div className={styles.grid} />
        <svg className={styles.wires} viewBox="-2400 -2400 4800 4800">
          <defs>
            <marker id={`fa-${flujo.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#111827" />
            </marker>
            <marker id={`fd-${flujo.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#d4d4d8" />
            </marker>
          </defs>
          {EDGES.map(([from, to]) => {
            const a = NODES.find((n) => n.id === from)!
            const b = NODES.find((n) => n.id === to)!
            const lit = isOn(from) && isOn(to)
            return (
              <path
                key={`${from}-${to}`}
                d={edgePath(a, b)}
                fill="none"
                stroke={lit ? '#111827' : '#d4d4d8'}
                strokeWidth={lit ? 1.8 : 1.3}
                strokeDasharray={lit ? undefined : '5 6'}
                strokeLinecap="round"
                markerEnd={lit ? `url(#fa-${flujo.id})` : `url(#fd-${flujo.id})`}
              />
            )
          })}
        </svg>
        {NODES.map((n) => {
          const Icon = ICONS[n.id]
          const on = isOn(n.id)
          return (
            <button
              key={n.id}
              type="button"
              data-node={n.id}
              onClick={() => setSelected(selected === n.id ? null : n.id)}
              className={`${styles.node} ${selected === n.id ? styles.selected : ''} ${isDone(n.id) ? styles.done : ''} ${
                running && (n.id === 'agent' || (on && n.id !== 'output' && n.id !== 'trigger')) ? styles.running : ''
              }`}
              style={{ transform: `translate(${n.x}px, ${n.y}px)`, opacity: on ? 1 : 0.5 }}
            >
              <span className={styles.icon}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={styles.copy}>
                <span className={styles.title}>{n.label}</span>
                <span className={styles.sub}>{subOf(n.id)}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className={styles.hud} data-hud style={{ top: 16, left: 16 }}>
        <button type="button" className={styles.hudBtn} onClick={() => setRecenter((n) => n + 1)}>
          <Focus className="h-3.5 w-3.5" /> Recentrar
        </button>
        <button type="button" className={styles.hudBtn} onClick={() => setSelected('output')}>
          <History className="h-3.5 w-3.5" /> Ejecuciones
        </button>
        <button type="button" className={styles.hudBtn} onClick={runNow} disabled={running}>
          <Play className="h-3.5 w-3.5" /> {running ? 'Ejecutando…' : 'Ejecutar ahora'}
        </button>
        {canEdit && (
          <button type="button" className={styles.hudBtn} onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" /> Borrar flujo
          </button>
        )}
      </div>

      {error && !selected && (
        <div
          data-hud
          className="absolute left-4 top-16 z-[4] max-w-md rounded-2xl border-2 border-white bg-red-50 px-4 py-2 text-xs text-red-800 shadow"
        >
          {error}
        </div>
      )}

      {selected && (
        <aside className={`${styles.sheet} ${wide ? styles.sheetWide : ''}`} data-sheet onPointerDown={(e) => e.stopPropagation()}>
          <div className={styles.sheetHead}>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{flujo.name}</p>
              <h2 className="text-[15px] font-semibold text-gray-900">{sheetTitle[selected]}</h2>
            </div>
            <div className="flex items-center gap-1.5">
              {(selected === 'agent' || selected === 'output') && (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-50 text-gray-500"
                  onClick={() => setWide((w) => !w)}
                  aria-label={wide ? 'Reducir' : 'Ampliar'}
                >
                  {wide ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
              )}
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-50 text-gray-500"
                onClick={() => {
                  setSelected(null)
                  setWide(false)
                }}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className={styles.sheetBody}>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}

            {selected === 'trigger' && (
              <>
                <div className={styles.field}>
                  <label>Cuándo se ejecuta</label>
                  <select
                    value={flujo.interval_minutes}
                    disabled={!canEdit || saving}
                    onChange={(e) => void patch({ interval_minutes: Number(e.target.value) })}
                  >
                    {INTERVALOS.map((i) => (
                      <option key={i.value} value={i.value}>
                        {i.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className={styles.hudBtn}
                  disabled={!canEdit || saving}
                  onClick={() => void patch({ enabled: !flujo.enabled })}
                >
                  {flujo.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {flujo.enabled ? 'Pausar el disparador' : 'Reanudar el disparador'}
                </button>
                <p className="text-xs text-gray-500">
                  {flujo.last_run_at ? `Última ejecución: ${new Date(flujo.last_run_at).toLocaleString('es-ES')}. ` : 'Aún no se ha ejecutado. '}
                  {flujo.enabled && flujo.next_run_at
                    ? `Próxima: ${new Date(flujo.next_run_at).toLocaleString('es-ES')}.`
                    : flujo.interval_minutes === 0
                      ? 'Solo se ejecuta a mano.'
                      : 'Pausado.'}
                </p>
              </>
            )}

            {(selected === 'mcp' || selected === 'incidencias' || selected === 'tickets') && (
              <>
                <p className="text-sm text-gray-600">{TOOL_TEXT[selected]}</p>
                <button
                  type="button"
                  className={styles.hudBtn}
                  disabled={!canEdit || saving}
                  onClick={() => toggleTool(selected)}
                >
                  {flujo.tools.includes(selected) ? 'Desactivar en este flujo' : 'Activar en este flujo'}
                </button>
              </>
            )}

            {selected === 'agent' && (
              <>
                <div className={styles.field}>
                  <label>Nombre del flujo</label>
                  <input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label>Prompt</label>
                  <textarea
                    value={prompt}
                    disabled={!canEdit}
                    onChange={(e) => setPrompt(e.target.value)}
                    className={wide ? styles.promptBig : undefined}
                    rows={12}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  La respuesta siempre es un JSON. Si quieres una forma concreta, descríbela en el prompt (por ejemplo, qué
                  campos y con qué nombres).
                </p>
                <button
                  type="button"
                  className={styles.hudBtn}
                  disabled={!canEdit || saving || !name.trim() || prompt.trim().length < 10 || (name === flujo.name && prompt === flujo.prompt)}
                  onClick={() => void patch({ name: name.trim(), prompt: prompt.trim() })}
                >
                  <Save className="h-3.5 w-3.5" /> {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </>
            )}

            {selected === 'output' && (
              <>
                {runs.length === 0 ? (
                  <p className="text-sm text-gray-500">Todavía no se ha ejecutado. Pulsa «Ejecutar ahora».</p>
                ) : (
                  <>
                    <div className={styles.field}>
                      <label>Ejecución</label>
                      <select value={runIndex} onChange={(e) => setRunIndex(Number(e.target.value))}>
                        {runs.map((r, i) => (
                          <option key={r.id} value={i}>
                            {new Date(r.started_at).toLocaleString('es-ES')} · {r.trigger === 'cron' ? 'programada' : 'manual'} ·{' '}
                            {r.status === 'ok' ? 'ok' : r.status === 'error' ? 'error' : 'en curso'}
                          </option>
                        ))}
                      </select>
                    </div>
                    {lastRun?.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">{lastRun.error}</p>}
                    {lastRun?.output != null && (
                      <>
                        <div className="flex justify-end">
                          <button type="button" className={styles.hudBtn} onClick={copyJson}>
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copiar JSON
                          </button>
                        </div>
                        <pre className="max-h-[50vh] overflow-auto rounded-2xl bg-gray-950 p-3 text-xs leading-relaxed text-gray-100">
                          {JSON.stringify(lastRun.output, null, 2)}
                        </pre>
                      </>
                    )}
                    {lastRun && lastRun.trace.length > 0 && (
                      <div className={styles.field}>
                        <label>Herramientas usadas</label>
                        <ul className="mt-2 space-y-1.5">
                          {lastRun.trace.map((t, i) => (
                            <li key={i} className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-700">
                              <span className={t.ok ? 'text-emerald-700' : 'text-red-700'}>{t.ok ? '✓' : '✗'}</span>{' '}
                              <span className="font-medium">{t.tool}</span>
                              <span className="block truncate text-gray-500">{t.preview}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </aside>
      )}

      <p className={styles.hint}>Disparador → herramientas → agente → JSON · arrastra el lienzo · clic en una caja para configurar</p>
    </div>
  )
}
