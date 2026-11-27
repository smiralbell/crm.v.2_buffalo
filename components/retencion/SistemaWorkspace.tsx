import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Brain, FlaskConical, Lightbulb, Loader2, MessagesSquare, Plus, RotateCcw, Workflow, X } from 'lucide-react'
import FlowCanvas, { intervaloLabel, type Flujo } from '@/components/retencion/FlowCanvas'
import QaWorkspace, { isQaView, type QaView } from '@/components/retencion/qa/QaWorkspace'

const PROMPT_EJEMPLO =
  'Cuenta los errores de este proyecto (incidencias): total, abiertos, resueltos y ocurrencias. ' +
  'Cuenta los tickets por estado. Si el MCP tiene herramientas de costes o facturación, calcula el coste ' +
  'total del último mes. Devuelve un JSON con: errores_total, errores_abiertos, tickets_abiertos, ' +
  'coste_total (null si no hay dato) y hallazgos (lista de frases).'

/**
 * Pestaña Sistema: arriba se elige el flujo (cerebro y pruebas de cambios de la calidad,
 * el informe del sistema de siempre o uno propio) y debajo se ve su lienzo de nodos.
 */
export default function SistemaWorkspace({
  proyectoId,
  proyectoName,
  canEdit,
  watchPanel,
  onWatchSelected,
  onGoMcp,
}: {
  proyectoId: string
  proyectoName: string
  canEdit: boolean
  watchPanel: ReactNode
  onWatchSelected: (isWatch: boolean) => void
  onGoMcp?: () => void
}) {
  const base = `/api/retencion/proyectos/${proyectoId}/flujos`
  const [flujos, setFlujos] = useState<Flujo[]>([])
  const [active, setActive] = useState<'watch' | string>('watch')
  const [creating, setCreating] = useState(false)
  const [watchHidden, setWatchHidden] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const select = useCallback(
    (id: 'watch' | string) => {
      setActive(id)
      onWatchSelected(id === 'watch')
    },
    [onWatchSelected]
  )

  useEffect(() => {
    fetch(base)
      .then(async (r) =>
        r.ok ? ((await r.json()) as { flujos: Flujo[]; watch_hidden?: boolean }) : { flujos: [], watch_hidden: false }
      )
      .then((d) => {
        setFlujos(d.flujos)
        setWatchHidden(Boolean(d.watch_hidden))
        if (d.watch_hidden && d.flujos[0]) select(d.flujos[0].id)
      })
      .catch(() => setFlujos([]))
      .finally(() => setLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base])

  /** Quita (o recupera) el informe del sistema, el flujo que viene por defecto. */
  const toggleWatch = async (hide: boolean) => {
    if (
      hide &&
      !window.confirm(
        'Se quita el «Informe del sistema» de esta pestaña y deja de ejecutarse solo. Lo puedes recuperar con «Recuperar informe». ¿Continuar?'
      )
    ) {
      return
    }
    setError('')
    try {
      const res = await fetch(`${base}/sistema`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watch_hidden: hide }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || 'No se pudo guardar')
      setWatchHidden(hide)
      if (hide) {
        if (flujos[0]) select(flujos[0].id)
        else onWatchSelected(false)
      } else {
        select('watch')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const create = async () => {
    setCreating(true)
    setError('')
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Flujo ${flujos.length + 1}`,
          prompt: PROMPT_EJEMPLO,
          interval_minutes: 0,
          enabled: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || 'No se pudo crear el flujo')
      const flujo = (data as { flujo: Flujo }).flujo
      setFlujos((prev) => [...prev, flujo])
      select(flujo.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el flujo')
    } finally {
      setCreating(false)
    }
  }

  const current = flujos.find((f) => f.id === active) || null

  const pill = (isActive: boolean) =>
    `inline-flex shrink-0 items-center gap-2 rounded-full border-2 px-3.5 h-9 text-xs font-medium transition-colors ${
      isActive
        ? 'border-gray-900 bg-gray-900 text-white'
        : 'border-white bg-white text-gray-700 shadow-sm hover:border-gray-200'
    }`

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto pb-1">
        <button type="button" className={pill(active === 'cerebro')} onClick={() => select('cerebro')} data-tour="flujo-cerebro">
          <Brain className="h-3.5 w-3.5" /> Cerebro
        </button>
        <button type="button" className={pill(active === 'cambios')} onClick={() => select('cambios')}>
          <FlaskConical className="h-3.5 w-3.5" /> Pruebas de cambios
        </button>
        <button type="button" className={pill(active === 'real')} onClick={() => select('real')}>
          <MessagesSquare className="h-3.5 w-3.5" /> Conversaciones reales
        </button>
        <button type="button" className={pill(active === 'mejoras')} onClick={() => select('mejoras')}>
          <Lightbulb className="h-3.5 w-3.5" /> Mejoras
        </button>
        <span className="mx-1 h-5 w-px shrink-0 bg-gray-200" aria-hidden />
        {!watchHidden && (
          <span className={`${pill(active === 'watch')} pr-1.5`}>
            <button type="button" className="inline-flex items-center gap-2" onClick={() => select('watch')}>
              <Workflow className="h-3.5 w-3.5" /> Informe del sistema
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => void toggleWatch(true)}
                className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full ${
                  active === 'watch' ? 'hover:bg-white/20' : 'hover:bg-gray-100'
                }`}
                title="Quitar el informe del sistema"
                aria-label="Quitar el informe del sistema"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        )}
        {flujos.map((f) => (
          <button key={f.id} type="button" className={pill(active === f.id)} onClick={() => select(f.id)}>
            <span className={`h-1.5 w-1.5 rounded-full ${f.enabled && f.interval_minutes > 0 ? 'bg-emerald-400' : 'bg-gray-300'}`} />
            {f.name}
            <span className={active === f.id ? 'text-gray-300' : 'text-gray-400'}>· {intervaloLabel(f.interval_minutes)}</span>
          </button>
        ))}
        {canEdit && (
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-dashed border-gray-300 px-3.5 h-9 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Nuevo flujo
          </button>
        )}
        {watchHidden && canEdit && (
          <button
            type="button"
            onClick={() => void toggleWatch(false)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 h-9 text-xs font-medium text-gray-500 hover:text-gray-900"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Recuperar informe
          </button>
        )}
        {error && <span className="shrink-0 text-xs text-red-700">{error}</span>}
      </div>

      <div className="relative min-h-0 flex-1">
        {/* Calidad: el panel si está elegido y, siempre, el tutorial (ventanas flotantes). */}
        <QaWorkspace
          proyectoId={proyectoId}
          proyectoName={proyectoName}
          view={isQaView(active) ? active : null}
          onView={(v: QaView) => select(v)}
          onGoMcp={onGoMcp}
        />
        {isQaView(active) ? null : !current && watchHidden ? (
          loaded && (
            <div className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-gray-300 text-sm text-gray-500">
              No hay flujos. Crea uno con «Nuevo flujo».
            </div>
          )
        ) : active === 'watch' || !current ? (
          watchPanel
        ) : (
          <div className="h-full overflow-hidden rounded-[28px]">
          <FlowCanvas
            key={current.id}
            proyectoId={proyectoId}
            flujo={current}
            canEdit={canEdit}
            onChanged={(f) => setFlujos((prev) => prev.map((x) => (x.id === f.id ? f : x)))}
            onDeleted={() => {
              setFlujos((prev) => prev.filter((x) => x.id !== current.id))
              select('watch')
            }}
          />
          </div>
        )}
      </div>
    </div>
  )
}
