import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/AuthContext'
import BrainPanel, { type BrainData, type BrainSheet } from './BrainPanel'
import Flow1Panel, { type Flow1Sheet } from './Flow1Panel'
import GuidedTour from './GuidedTour'
import type { Flow1Config, TourStep } from '@/lib/retencion/qa/types'

export type QaView = 'cerebro' | 'cambios'

export function isQaView(v: unknown): v is QaView {
  return v === 'cerebro' || v === 'cambios'
}

/**
 * Calidad dentro de la pestaña Sistema: el cerebro, el flujo de cambios y el tutorial.
 * Con `view` null solo se monta el tutorial (ventanas flotantes) sobre el flujo que se esté viendo.
 */
export default function QaWorkspace({
  proyectoId,
  proyectoName,
  view,
  onView,
  onGoMcp,
}: {
  proyectoId: string
  proyectoName: string
  view: QaView | null
  onView: (v: QaView) => void
  onGoMcp?: () => void
}) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [data, setData] = useState<BrainData | null>(null)
  const [err, setErr] = useState('')
  const [brainSheet, setBrainSheet] = useState<BrainSheet>(null)
  const [flowSheet, setFlowSheet] = useState<Flow1Sheet>(null)
  const [tourForced, setTourForced] = useState(false)
  const [tourOverride, setTourOverride] = useState<TourStep | null>(null)
  const [flowReload, setFlowReload] = useState(0)
  const wasRunning = useRef(false)

  const api = `/api/retencion/proyectos/${proyectoId}/cerebro`

  const load = useCallback(async () => {
    try {
      const res = await fetch(api)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al cargar')
      setData(d as BrainData)
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  // Mientras la araña trabaja, se pregunta el progreso cada segundo y poco.
  const running = data?.brain.status === 'running'
  useEffect(() => {
    if (!running) {
      if (wasRunning.current) setFlowReload((n) => n + 1) // normas propuestas nuevas en la bandeja
      wasRunning.current = false
      return
    }
    wasRunning.current = true
    const t = setInterval(() => void load(), 1200)
    return () => clearInterval(t)
  }, [running, load])

  const setTourStep = async (step: TourStep) => {
    setTourOverride(step)
    const res = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tour_step: step }) })
    if (res.ok) setData((await res.json()) as BrainData)
    setTourOverride(null)
  }

  const start = async () => {
    const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error || 'No se pudo lanzar')
    setData(d as BrainData)
  }

  const saveFlow1 = async (c: Flow1Config): Promise<boolean> => {
    const res = await fetch(`/api/retencion/proyectos/${proyectoId}/flujo-cambios`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    })
    if (!res.ok) return false
    setFlowReload((n) => n + 1)
    return true
  }

  const tourStep: TourStep = tourOverride || (tourForced && data?.brain.tour_step === 'hecho' ? 'bienvenida' : data?.brain.tour_step || 'hecho')

  return (
    <>
      {view === 'cerebro' && (
        <div className="h-full">
          {err && !data && <p className="mb-2 text-sm text-red-700">{err}</p>}
          <BrainPanel
            proyectoId={proyectoId}
            data={data}
            isAdmin={isAdmin}
            sheet={brainSheet}
            onSheet={setBrainSheet}
            onStart={start}
            onSaved={setData}
            onGoMcp={onGoMcp || (() => undefined)}
            onGoInbox={() => {
              setBrainSheet(null)
              onView('cambios')
              setFlowSheet('bandeja')
            }}
            onTutorial={() => {
              setTourForced(true)
              void setTourStep('bienvenida')
            }}
          />
        </div>
      )}
      {view === 'cambios' && (
        <div className="h-full">
          <Flow1Panel
            proyectoId={proyectoId}
            isAdmin={isAdmin}
            brainReady={Boolean(data?.brain.brain)}
            repoSource={data?.brain.repo_source || data?.sources.repo_default || null}
            sheet={flowSheet}
            onSheet={setFlowSheet}
            onGoCerebro={() => onView('cerebro')}
            reloadKey={flowReload}
          />
        </div>
      )}

      {data && (
        <GuidedTour
          projectName={proyectoName}
          step={tourStep}
          brain={data.brain}
          isAdmin={isAdmin}
          forced={tourForced}
          onStep={(st) => void setTourStep(st)}
          onStart={start}
          onOpenSheet={(sh) => {
            onView('cerebro')
            setBrainSheet(sh)
          }}
          onGoFlow={(f) => {
            onView(f)
            // Al terminar el tutorial se abre la bandeja con las normas propuestas.
            if (f === 'cambios') setFlowSheet(data.brain.tour_step === 'hecho' ? 'bandeja' : null)
          }}
          onSaveFlow1={saveFlow1}
          onClose={() => setTourForced(false)}
        />
      )}
    </>
  )
}
