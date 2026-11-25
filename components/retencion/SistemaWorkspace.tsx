import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Loader2, Plus, Workflow } from 'lucide-react'
import FlowCanvas, { intervaloLabel, type Flujo } from '@/components/retencion/FlowCanvas'

const PROMPT_EJEMPLO =
  'Cuenta los errores de este proyecto (incidencias): total, abiertos, resueltos y ocurrencias. ' +
  'Cuenta los tickets por estado. Si el MCP tiene herramientas de costes o facturación, calcula el coste ' +
  'total del último mes. Devuelve un JSON con: errores_total, errores_abiertos, tickets_abiertos, ' +
  'coste_total (null si no hay dato) y hallazgos (lista de frases).'

/**
 * Pestaña Sistema: arriba se elige el flujo (el informe del sistema de siempre o uno propio)
 * y debajo se ve su lienzo de nodos.
 */
export default function SistemaWorkspace({
  proyectoId,
  canEdit,
  watchPanel,
  onWatchSelected,
}: {
  proyectoId: string
  canEdit: boolean
  watchPanel: ReactNode
  onWatchSelected: (isWatch: boolean) => void
}) {
  const base = `/api/retencion/proyectos/${proyectoId}/flujos`
  const [flujos, setFlujos] = useState<Flujo[]>([])
  const [active, setActive] = useState<'watch' | string>('watch')
  const [creating, setCreating] = useState(false)
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
      .then(async (r) => (r.ok ? ((await r.json()) as { flujos: Flujo[] }) : { flujos: [] }))
      .then((d) => setFlujos(d.flujos))
      .catch(() => setFlujos([]))
  }, [base])

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
        <button type="button" className={pill(active === 'watch')} onClick={() => select('watch')}>
          <Workflow className="h-3.5 w-3.5" /> Informe del sistema
        </button>
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
        {error && <span className="shrink-0 text-xs text-red-700">{error}</span>}
      </div>

      <div className="relative min-h-0 flex-1">
        {active === 'watch' || !current ? (
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
