import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Focus, History, Maximize2, Minimize2, Play, RefreshCw, Save, X } from 'lucide-react'
import { useAuth } from '@/components/AuthContext'
import WatchSystemMap, { type WatchNodeId } from '@/components/retencion/WatchSystemMap'
import WatchReportActions from '@/components/retencion/WatchReportActions'
import styles from './WatchSystemMap.module.css'
import type { WatchPublic, WatchRunPublic } from '@/lib/retencion/watch-store'
import {
  DEFAULT_WATCH_MODEL,
  WATCH_MODELS,
  watchModelLabel,
} from '@/lib/retencion/watch-models'
import {
  formatWatchInterval,
  minutesToParts,
  partsToMinutes,
  type WatchIntervalUnit,
} from '@/lib/retencion/watch-interval'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const TITLES: Record<WatchNodeId, string> = {
  cron: 'Cron',
  db: 'Base de datos',
  incidents: 'Incidencias',
  reports: 'Últimos 5 informes',
  clean: 'Limpieza',
  ai: 'IA · Informe',
}

function tableKey(schema: string, table: string) {
  return `${schema}.${table}`
}

function colKey(schema: string, table: string, column: string) {
  return `${schema}.${table}.${column}`
}

function formatNextRun(iso: string | null | undefined): string {
  if (!iso) return 'pausado'
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 20_000) return 'ahora'
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `en ${min} min`
  const h = Math.round(min / 60)
  return h === 1 ? 'en 1 h' : `en ${h} h`
}

function formatDuration(run: WatchRunPublic): string {
  const from = new Date(run.started_at || run.created_at).getTime()
  const to = run.finished_at ? new Date(run.finished_at).getTime() : Date.now()
  const s = Math.max(0, Math.round((to - from) / 1000))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function WatchSystemPanel({
  proyectoId,
  onGoIncidents,
  scheduleOpen,
  onScheduleOpenChange,
  onIntervalLabel,
}: {
  proyectoId: string
  onGoIncidents?: () => void
  scheduleOpen: boolean
  onScheduleOpenChange: (open: boolean) => void
  onIntervalLabel?: (label: string) => void
}) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [watch, setWatch] = useState<WatchPublic | null>(null)
  const [dbUrl, setDbUrl] = useState('')
  const [watchPrompt, setWatchPrompt] = useState('')
  const [watchModel, setWatchModel] = useState(DEFAULT_WATCH_MODEL)
  const [paused, setPaused] = useState(true)
  const [amount, setAmount] = useState(1)
  const [unit, setUnit] = useState<WatchIntervalUnit>('hours')
  const [selected, setSelected] = useState<WatchNodeId | null>(null)
  const [openIncidents, setOpenIncidents] = useState(0)
  const [recenter, setRecenter] = useState(0)
  const [excludedTables, setExcludedTables] = useState<string[]>([])
  const [excludedColumns, setExcludedColumns] = useState<string[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [openRun, setOpenRun] = useState<WatchRunPublic | null>(null)
  const [liveUsed, setLiveUsed] = useState<WatchNodeId[]>([])
  const [showExec, setShowExec] = useState(false)
  const [promptMax, setPromptMax] = useState(false)

  const apply = (w: WatchPublic) => {
    setWatch(w)
    setWatchPrompt(w.watch_prompt || '')
    setWatchModel(w.watch_model || DEFAULT_WATCH_MODEL)
    setExcludedTables(w.excluded_tables || [])
    setExcludedColumns(w.excluded_columns || [])
    const parts = minutesToParts(w.every_minutes && w.every_minutes > 0 ? w.every_minutes : 0)
    setPaused(parts.paused)
    setAmount(parts.amount)
    setUnit(parts.unit)
    onIntervalLabel?.(formatWatchInterval(w.every_minutes))
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [wRes, iRes] = await Promise.all([
        fetch(`/api/retencion/proyectos/${proyectoId}/watch`),
        fetch(`/api/retencion/proyectos/${proyectoId}/incidents`),
      ])
      const data = await wRes.json()
      if (!wRes.ok) throw new Error(data.error || 'Error al cargar')
      const w = data.watch as WatchPublic
      apply(w)
      if (w.db_connected && !(w.schema && w.schema.length)) {
        const sRes = await fetch(`/api/retencion/proyectos/${proyectoId}/watch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sync_schema' }),
        })
        const sData = await sRes.json()
        if (sRes.ok && sData.watch) apply(sData.watch as WatchPublic)
      }
      if (iRes.ok) {
        const inc = await iRes.json()
        const list = Array.isArray(inc.incidents) ? inc.incidents : []
        setOpenIncidents(list.filter((x: { status?: string }) => x.status === 'open').length)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [proyectoId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const t = window.setInterval(() => {
      if (running) return
      void fetch(`/api/retencion/proyectos/${proyectoId}/watch`)
        .then((r) => r.json())
        .then((data) => {
          if (data.watch) apply(data.watch as WatchPublic)
        })
        .catch(() => undefined)
    }, 20_000)
    return () => window.clearInterval(t)
  }, [proyectoId, running])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const save = async (extra: Record<string, unknown> = {}) => {
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const body: Record<string, unknown> = {
        watch_prompt: watchPrompt,
        watch_model: watchModel,
        every_minutes: paused ? 0 : partsToMinutes(amount, unit),
        excluded_tables: excludedTables,
        excluded_columns: excludedColumns,
        ...extra,
      }
      if (dbUrl.trim()) body.client_db_url = dbUrl.trim()
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/watch`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      apply(data.watch as WatchPublic)
      setDbUrl('')
      setOkMsg(data.warning ? String(data.warning) : 'Guardado')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const runNow = async () => {
    setRunning(true)
    setError('')
    setOkMsg('')
    setLiveUsed(['cron'])
    const poll = window.setInterval(() => {
      void fetch(`/api/retencion/proyectos/${proyectoId}/watch`)
        .then((r) => r.json())
        .then((data) => {
          const w = data.watch as WatchPublic | undefined
          if (w?.live_used?.length) setLiveUsed(w.live_used)
          if (w) apply(w)
        })
        .catch(() => undefined)
    }, 700)
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falló el flujo')
      apply(data.watch as WatchPublic)
      const done = (data.watch as WatchPublic | undefined)?.last_graph?.used
      setLiveUsed(done && done.length ? done : ['cron', 'db', 'incidents', 'reports', 'clean', 'ai'])
      setOkMsg(data.result?.ok ? 'Flujo ejecutado' : data.result?.error || 'Flujo con errores')
      setSelected('ai')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falló el flujo')
    } finally {
      window.clearInterval(poll)
      setRunning(false)
      window.setTimeout(() => setLiveUsed([]), 1600)
    }
  }

  const syncSchema = async () => {
    setSyncing(true)
    setError('')
    setOkMsg('')
    try {
      const body: Record<string, unknown> = { action: 'sync_schema' }
      if (dbUrl.trim()) body.client_db_url = dbUrl.trim()
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo sincronizar')
      apply(data.watch as WatchPublic)
      setDbUrl('')
      setOkMsg('Conectada y esquema sincronizado')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const labels = useMemo<Record<WatchNodeId, string>>(
    () => ({
      cron: paused
        ? 'pausado'
        : `${formatWatchInterval(partsToMinutes(amount, unit))} · ${formatNextRun(watch?.next_run_at)}`,
      db: watch?.db_connected
        ? `${watch.schema.length} tablas`
        : 'sin conectar',
      incidents: watch?.last_graph?.incidents_new != null
        ? `${watch.last_graph.incidents_new} nuevas`
        : openIncidents
          ? `${openIncidents} abiertas`
          : 'sin nuevas',
      reports: watch?.runs?.length ? `${watch.runs.length} últimos` : 'ninguno',
      clean: watch?.last_pack ? 'listo' : 'pendiente',
      ai: watchModelLabel(watchModel),
    }),
    [paused, amount, unit, watch, openIncidents, watchModel]
  )

  const scheduleFields = (
    <>
      <label className="flex items-center gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={paused}
          onChange={(e) => setPaused(e.target.checked)}
          disabled={!isAdmin}
        />
        Pausado
      </label>
      {!paused && (
        <div className="grid grid-cols-[1fr_140px] gap-2">
          <div className={styles.field}>
            <label>Cada</label>
            <input
              type="number"
              min={1}
              max={999}
              value={amount}
              disabled={!isAdmin}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className={styles.field}>
            <label>Unidad</label>
            <select
              value={unit}
              disabled={!isAdmin}
              onChange={(e) => setUnit(e.target.value as WatchIntervalUnit)}
            >
              <option value="minutes">minutos</option>
              <option value="hours">horas</option>
              <option value="days">días</option>
            </select>
          </div>
        </div>
      )}
      <p className="text-xs text-gray-400">
        {paused
          ? 'El cron no corre hasta que lo actives.'
          : `Empieza el flujo ${formatWatchInterval(partsToMinutes(amount, unit)).toLowerCase()}.`}
      </p>
    </>
  )

  return (
    <div className="relative h-full min-h-[560px] overflow-hidden rounded-[28px] border-2 border-white bg-[#eef0f3] shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      <WatchSystemMap
        key={`${proyectoId}-${recenter}`}
        proyectoId={proyectoId}
        used={openRun?.graph?.used || watch?.last_graph?.used}
        progress={liveUsed}
        activeId={running && liveUsed.length ? liveUsed[liveUsed.length - 1] : null}
        labels={labels}
        selected={selected}
        onSelect={(id) => {
          setShowExec(false)
          setOpenRun(null)
          setPromptMax(false)
          setSelected(id)
        }}
        toolbar={
          <>
            <button type="button" className={styles.hudBtn} onClick={() => setRecenter((n) => n + 1)}>
              <Focus className="h-3.5 w-3.5" />
              Recentrar
            </button>
            <button
              type="button"
              className={styles.hudBtn}
              onClick={() => {
                setSelected(null)
                setShowExec(true)
              }}
            >
              <History className="h-3.5 w-3.5" />
              Ejecuciones
            </button>
            <button
              type="button"
              className={styles.hudBtn}
              onClick={runNow}
              disabled={!isAdmin || running || loading}
            >
              <Play className="h-3.5 w-3.5" />
              {running ? 'Ejecutando…' : 'Ejecutar ahora'}
            </button>
          </>
        }
      >
        {(selected || showExec) && (
          <aside
            className={`${styles.sheet} ${promptMax ? styles.sheetWide : ''}`}
            data-sheet
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHead}>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  {showExec ? 'Historial' : 'Flujo'}
                </p>
                <h2 className="text-[15px] font-semibold text-gray-900">
                  {showExec ? 'Ejecuciones' : selected ? TITLES[selected] : ''}
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-50 text-gray-500"
                onClick={() => {
                  setSelected(null)
                  setShowExec(false)
                  setPromptMax(false)
                }}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={styles.sheetBody}>
              {showExec && (
                <>
                  <p className="text-sm text-gray-600">
                    Cada pasada (manual o cron) queda aquí, como en n8n. Clic para ver qué cajas corrieron.
                  </p>
                  {watch?.runs?.length ? (
                    <div className={styles.reportList}>
                      {watch.runs.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className={`${styles.reportItem} ${openRun?.id === r.id ? styles.selected : ''}`}
                          onClick={() => setOpenRun(openRun?.id === r.id ? null : r)}
                        >
                          <strong>
                            {r.running ? 'En curso' : r.ok ? 'OK' : 'Error'} · {r.trigger === 'cron' ? 'Cron' : 'Manual'}
                          </strong>
                          <span>
                            {new Date(r.started_at || r.created_at).toLocaleString('es-ES', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}{' '}
                            · {formatDuration(r)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Aún no hay ejecuciones.</p>
                  )}
                  {openRun && (
                    <div className="space-y-2">
                      {openRun.error && <p className="text-sm text-red-700">{openRun.error}</p>}
                      {openRun.report && (
                        <Link
                          href={`/retencion/proyectos/${proyectoId}/informes?run=${openRun.id}`}
                          className="text-sm font-medium text-gray-900 underline"
                        >
                          Ver informe
                        </Link>
                      )}
                    </div>
                  )}
                </>
              )}

              {selected === 'cron' && (
                <>
                  <p className="text-sm text-gray-600">
                    El cron dispara el flujo solo. El servidor lo revisa cada minuto; mientras tengas esta pantalla abierta se mantiene despierto.
                  </p>
                  <p className="text-sm text-gray-800">
                    Próxima: <b>{formatNextRun(watch?.next_run_at)}</b>
                    {watch?.last_at
                      ? ` · última ${new Date(watch.last_at).toLocaleString('es-ES', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}`
                      : ''}
                  </p>
                  {scheduleFields}
                </>
              )}

              {selected === 'db' && (
                <>
                  <div className={styles.field}>
                    <label>URL PostgreSQL de este cliente</label>
                    <input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={dbUrl}
                      onChange={(e) => setDbUrl(e.target.value)}
                      disabled={!isAdmin}
                      placeholder={
                        watch?.db_connected
                          ? `Conectada · ${watch.db_host || ''} / ${watch.db_name || ''} · pega otra para cambiar`
                          : 'postgres://usuario:clave@host:5432/basedatos'
                      }
                    />
                    <p className="mt-1.5 text-xs text-gray-400">
                      Pega la <b>URL de conexión externa</b> de EasyPanel tal cual. El host externo es el del panel (panel.…) y el puerto el de Exponer (4523): no lo cambies.
                    </p>
                  </div>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.hudBtn}
                      disabled={!isAdmin || syncing || (!dbUrl.trim() && !watch?.db_connected)}
                      onClick={() => void syncSchema()}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {syncing
                        ? 'Sincronizando…'
                        : dbUrl.trim()
                          ? 'Conectar y sincronizar'
                          : 'Sincronizar esquema'}
                    </button>
                    {watch?.db_connected && (
                      <button
                        type="button"
                        className={styles.hudBtn}
                        disabled={!isAdmin || saving}
                        onClick={() => void save({ clear_db_url: true })}
                      >
                        Desconectar
                      </button>
                    )}
                  </div>
                  {okMsg && selected === 'db' && <p className="text-sm text-emerald-700">{okMsg}</p>}
                  {error && selected === 'db' && <p className="text-sm text-red-700">{error}</p>}

                  {watch?.schema?.length ? (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        Tablas · marca lo que quieres excluir
                      </p>
                      <div className={styles.schemaList}>
                        {watch.schema.map((t) => {
                          const tk = tableKey(t.schema, t.table)
                          const tableOff = excludedTables.includes(tk)
                          const open = Boolean(expanded[tk])
                          return (
                            <div key={tk} className={styles.schemaTable}>
                              <div className={styles.schemaHead}>
                                <input
                                  className={styles.check}
                                  type="checkbox"
                                  checked={tableOff}
                                  disabled={!isAdmin}
                                  onChange={() =>
                                    setExcludedTables((prev) =>
                                      prev.includes(tk) ? prev.filter((x) => x !== tk) : [...prev, tk]
                                    )
                                  }
                                />
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 truncate text-left"
                                  onClick={() => setExpanded((p) => ({ ...p, [tk]: !p[tk] }))}
                                >
                                  {tk}
                                </button>
                                <span className="text-[11px] font-normal text-gray-400">
                                  {t.columns.length}
                                </span>
                              </div>
                              {open && (
                                <div className={styles.schemaCols}>
                                  {t.columns.map((c) => {
                                    const ck = colKey(t.schema, t.table, c.column)
                                    return (
                                      <label key={ck} className={styles.schemaCol}>
                                        <input
                                          className={styles.check}
                                          type="checkbox"
                                          checked={excludedColumns.includes(ck)}
                                          disabled={!isAdmin || tableOff}
                                          onChange={() =>
                                            setExcludedColumns((prev) =>
                                              prev.includes(ck)
                                                ? prev.filter((x) => x !== ck)
                                                : [...prev, ck]
                                            )
                                          }
                                        />
                                        {c.column}
                                        <span>{c.data_type}</span>
                                      </label>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      {watch?.db_connected
                        ? 'Aún no hay esquema. Pulsa sincronizar.'
                        : 'Conecta la URL para leer tablas y columnas.'}
                    </p>
                  )}
                </>
              )}

              {selected === 'incidents' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    En cada cron se recogen las incidencias nuevas (o actualizadas) desde la última ejecución.
                    {watch?.last_graph?.incidents_new != null
                      ? ` Última pasada: ${watch.last_graph.incidents_new}.`
                      : ''}
                    {openIncidents ? ` Ahora hay ${openIncidents} abierta${openIncidents === 1 ? '' : 's'}.` : ''}
                  </p>
                  {onGoIncidents && (
                    <button type="button" className={styles.hudBtn} onClick={onGoIncidents}>
                      Ir a incidencias
                    </button>
                  )}
                </div>
              )}

              {selected === 'reports' && (
                <>
                  <p className="text-sm text-gray-600">
                    Los informes recientes alimentan la IA. La lista completa está en su página.
                  </p>
                  <Link
                    href={`/retencion/proyectos/${proyectoId}/informes`}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-gray-900 px-4 text-sm font-medium text-white"
                  >
                    Abrir informes
                  </Link>
                  {watch?.runs?.filter((r) => r.ok && r.report).slice(0, 5).length ? (
                    <div className={styles.reportList}>
                      {watch.runs
                        .filter((r) => r.ok && r.report)
                        .slice(0, 5)
                        .map((r) => (
                          <Link
                            key={r.id}
                            href={`/retencion/proyectos/${proyectoId}/informes?run=${r.id}`}
                            className={styles.reportItem}
                          >
                            <strong>{r.trigger === 'cron' ? 'Cron' : 'Manual'}</strong>
                            <span>
                              {new Date(r.finished_at || r.created_at).toLocaleString('es-ES', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                          </Link>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Todavía no hay informes.</p>
                  )}
                </>
              )}

              {selected === 'clean' && (
                <>
                  <p className="text-sm text-gray-600">
                    Junta base, incidencias e informes previos en un paquete estructurado. La IA solo ve esto.
                  </p>
                  {watch?.last_pack ? (
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-gray-50 px-3 py-2 text-[11px] text-gray-800">
                      {JSON.stringify(watch.last_pack, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-gray-500">Aún no hay paquete. Se genera en cada ejecución.</p>
                  )}
                </>
              )}

              {selected === 'ai' && (
                <>
                  <div className={styles.field}>
                    <label>Modelo OpenRouter</label>
                    <select
                      value={watchModel}
                      disabled={!isAdmin}
                      onChange={(e) => setWatchModel(e.target.value)}
                    >
                      {!WATCH_MODELS.some((m) => m.id === watchModel) && watchModel && (
                        <option value={watchModel}>{watchModel}</option>
                      )}
                      {WATCH_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} · {m.hint}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-gray-400">
                      El informe se genera con OpenRouter. Recomendado: Qwen 3.7 Flash (1 millón de tokens y el más barato).
                    </p>
                  </div>
                  <div className={styles.field}>
                    <div className="flex items-center justify-between gap-2">
                      <label>Prompt del informe</label>
                      <button
                        type="button"
                        className={styles.hudBtn}
                        onClick={() => setPromptMax((v) => !v)}
                      >
                        {promptMax ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                        {promptMax ? 'Reducir' : 'Ampliar'}
                      </button>
                    </div>
                    <textarea
                      value={watchPrompt}
                      onChange={(e) => setWatchPrompt(e.target.value)}
                      disabled={!isAdmin}
                      className={promptMax ? styles.promptBig : undefined}
                      style={promptMax ? undefined : { minHeight: 160 }}
                    />
                  </div>
                  {watch?.last_report && (
                    <div className={styles.field}>
                      <label>
                        Último informe
                        {watch.last_at
                          ? ` · ${new Date(watch.last_at).toLocaleString('es-ES', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}`
                          : ''}
                      </label>
                      <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl bg-gray-50 px-3 py-2 text-[12px] text-gray-800">
                        {watch.last_report}
                      </pre>
                      <div className="mt-2">
                        <WatchReportActions markdown={watch.last_report} title="informe-sistema" />
                      </div>
                    </div>
                  )}
                </>
              )}

              {(selected === 'cron' ||
                selected === 'db' ||
                selected === 'ai') && (
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!isAdmin || saving || loading}
                  className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Guardando…' : selected === 'db' && dbUrl.trim() ? 'Conectar y guardar' : 'Guardar'}
                </button>
              )}
              {okMsg && <p className="text-sm text-emerald-700">{okMsg}</p>}
              {error && <p className="text-sm text-red-700">{error}</p>}
            </div>
          </aside>
        )}
      </WatchSystemMap>

      <Dialog open={scheduleOpen} onOpenChange={onScheduleOpenChange}>
        <DialogContent className="max-w-md rounded-[28px] border-2 border-white sm:rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Frecuencia del flujo</DialogTitle>
            <DialogDescription>
              El cron dispara las cajas en orden y solo toma datos nuevos desde la última pasada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {scheduleFields}
            <button
              type="button"
              onClick={async () => {
                await save()
                onScheduleOpenChange(false)
              }}
              disabled={!isAdmin || saving || loading}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            {error && <p className="text-sm text-red-700">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
