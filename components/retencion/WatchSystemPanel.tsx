import { useCallback, useEffect, useMemo, useState } from 'react'
import { Play, Save, X, Focus } from 'lucide-react'
import { useAuth } from '@/components/AuthContext'
import WatchSystemMap, { type WatchNodeId } from '@/components/retencion/WatchSystemMap'
import styles from './WatchSystemMap.module.css'
import type { WatchPublic } from '@/lib/retencion/watch-store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const INTERVALS = [
  { minutes: 0, label: 'Pausado' },
  { minutes: 15, label: 'Cada 15 minutos' },
  { minutes: 30, label: 'Cada 30 minutos' },
  { minutes: 60, label: 'Cada hora' },
  { minutes: 180, label: 'Cada 3 horas' },
  { minutes: 360, label: 'Cada 6 horas' },
  { minutes: 1440, label: 'Cada día' },
]

const TITLES: Record<WatchNodeId, string> = {
  agent: 'Agente de vigilancia',
  db: 'Base de datos',
  knowledge: 'Knowledge',
  prompt: 'Prompts de los agentes',
  incidents: 'Incidencias',
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
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [watch, setWatch] = useState<WatchPublic | null>(null)
  const [dbUrl, setDbUrl] = useState('')
  const [knowledge, setKnowledge] = useState('')
  const [agentPrompt, setAgentPrompt] = useState('')
  const [watchPrompt, setWatchPrompt] = useState('')
  const [every, setEvery] = useState(60)
  const [selected, setSelected] = useState<WatchNodeId | null>(null)
  const [openIncidents, setOpenIncidents] = useState(0)
  const [recenter, setRecenter] = useState(0)

  const apply = (w: WatchPublic) => {
    setWatch(w)
    setKnowledge(w.knowledge || '')
    setAgentPrompt(w.agent_prompt || '')
    setWatchPrompt(w.watch_prompt || '')
    const mins = w.every_minutes && w.every_minutes > 0 ? w.every_minutes : 0
    setEvery(mins)
    onIntervalLabel?.(INTERVALS.find((i) => i.minutes === mins)?.label || 'Pausado')
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
      apply(data.watch as WatchPublic)
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const save = async () => {
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const body: Record<string, unknown> = {
        knowledge,
        agent_prompt: agentPrompt,
        watch_prompt: watchPrompt,
        every_minutes: every,
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
      setOkMsg('Guardado')
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
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falló la revisión')
      apply(data.watch as WatchPublic)
      setOkMsg(data.result?.ok ? 'Revisión hecha' : data.result?.error || 'Revisión con errores')
      setSelected('agent')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falló la revisión')
    } finally {
      setRunning(false)
    }
  }

  const labels = useMemo<Record<WatchNodeId, string>>(
    () => ({
      agent: INTERVALS.find((i) => i.minutes === every)?.label || 'Pausado',
      db: watch?.db_connected ? watch.db_name || watch.db_host || 'conectada' : 'sin conectar',
      knowledge: knowledge.trim() ? `${knowledge.trim().length} caracteres` : 'vacía',
      prompt: agentPrompt.trim() ? 'configurado' : 'sin prompt',
      incidents: openIncidents ? `${openIncidents} abierta${openIncidents === 1 ? '' : 's'}` : 'ninguna abierta',
    }),
    [every, watch, knowledge, agentPrompt, openIncidents]
  )

  return (
    <div className="relative h-full min-h-[560px] overflow-hidden rounded-[28px] border-2 border-white bg-[#eef0f3] shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      <WatchSystemMap
        key={`${proyectoId}-${recenter}`}
        proyectoId={proyectoId}
        used={watch?.last_graph?.used}
        labels={labels}
        selected={selected}
        onSelect={setSelected}
        toolbar={
          <>
            <button type="button" className={styles.hudBtn} onClick={() => setRecenter((n) => n + 1)}>
              <Focus className="h-3.5 w-3.5" />
              Recentrar
            </button>
            <button
              type="button"
              className={styles.hudBtn}
              onClick={runNow}
              disabled={!isAdmin || running || loading}
            >
              <Play className="h-3.5 w-3.5" />
              {running ? 'Revisando…' : 'Ejecutar ahora'}
            </button>
          </>
        }
      >
        {selected && (
          <aside className={styles.sheet} data-sheet onPointerDown={(e) => e.stopPropagation()}>
            <div className={styles.sheetHead}>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Configurar</p>
                <h2 className="text-[15px] font-semibold text-gray-900">{TITLES[selected]}</h2>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-50 text-gray-500"
                onClick={() => setSelected(null)}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={styles.sheetBody}>
              {selected === 'agent' && (
                <>
                  <div className={styles.field}>
                    <label>Prompt de vigilancia</label>
                    <textarea value={watchPrompt} onChange={(e) => setWatchPrompt(e.target.value)} disabled={!isAdmin} />
                  </div>
                  {watch?.last_report && (
                    <div className={styles.field}>
                      <label>
                        Última revisión
                        {watch.last_at
                          ? ` · ${new Date(watch.last_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`
                          : ''}
                      </label>
                      <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl bg-gray-50 px-3 py-2 text-[12px] text-gray-800">
                        {watch.last_report}
                      </pre>
                    </div>
                  )}
                </>
              )}

              {selected === 'db' && (
                <div className={styles.field}>
                  <label>URL PostgreSQL externa</label>
                  <input
                    type="text"
                    value={dbUrl}
                    onChange={(e) => setDbUrl(e.target.value)}
                    disabled={!isAdmin}
                    placeholder={watch?.db_connected ? `${watch.db_host || ''} / ${watch.db_name || ''}` : 'postgresql://…'}
                  />
                  <p className="mt-1.5 text-xs text-gray-400">
                    {watch?.db_connected
                      ? 'Ya hay una conexión. Pega otra URL solo si quieres cambiarla. Solo lectura (SELECT).'
                      : 'Solo lectura (SELECT).'}
                  </p>
                </div>
              )}

              {selected === 'knowledge' && (
                <div className={styles.field}>
                  <label>Knowledge del proyecto</label>
                  <textarea
                    value={knowledge}
                    onChange={(e) => setKnowledge(e.target.value)}
                    disabled={!isAdmin}
                    style={{ minHeight: 280 }}
                  />
                </div>
              )}

              {selected === 'prompt' && (
                <div className={styles.field}>
                  <label>Prompt de los agentes de producción</label>
                  <textarea
                    value={agentPrompt}
                    onChange={(e) => setAgentPrompt(e.target.value)}
                    disabled={!isAdmin}
                    style={{ minHeight: 280 }}
                  />
                </div>
              )}

              {selected === 'incidents' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    {openIncidents
                      ? `Hay ${openIncidents} incidencia${openIncidents === 1 ? '' : 's'} abierta${openIncidents === 1 ? '' : 's'}. El agente las lee en cada pasada.`
                      : 'No hay incidencias abiertas. El webhook de la pestaña Incidencias es el que alimenta esta caja.'}
                  </p>
                  {onGoIncidents && (
                    <button type="button" className={styles.hudBtn} onClick={onGoIncidents}>
                      Ir a incidencias
                    </button>
                  )}
                </div>
              )}

              {selected !== 'incidents' && (
                <button
                  type="button"
                  onClick={save}
                  disabled={!isAdmin || saving || loading}
                  className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Guardando…' : 'Guardar'}
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
            <DialogTitle>Frecuencia del agente</DialogTitle>
            <DialogDescription>
              Cada cuánto tiempo el agente revisa la base de datos, la knowledge y los prompts de este proyecto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className={styles.field}>
              <label>Ejecutar</label>
              <select value={every} onChange={(e) => setEvery(Number(e.target.value))} disabled={!isAdmin}>
                {INTERVALS.map((i) => (
                  <option key={i.minutes} value={i.minutes}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
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
