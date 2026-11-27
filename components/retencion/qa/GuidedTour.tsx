import { useEffect, useState } from 'react'
import { Brain as BrainIcon, CheckCircle2, GitBranch, Loader2, Play, Radar, Sparkles, Square } from 'lucide-react'
import s from './qa.module.css'
import Flow1ConfigForm from './Flow1Config'
import type { BrainPublic, Flow1Config, TourStep } from '@/lib/retencion/qa/types'
import { DEFAULT_FLOW1 } from '@/lib/retencion/qa/types'

/**
 * Tutorial guiado de la calidad de un proyecto: ventanas que van indicando el siguiente
 * paso desde el principio (fuentes → rastreo → cerebro listo → flujo de cambios).
 */

const NUMBERED: TourStep[] = ['fuentes', 'rastreo', 'cerebro', 'flujo1']

function Dots({ step }: { step: TourStep }) {
  const idx = NUMBERED.indexOf(step)
  return (
    <div className={s.dots} aria-label={`Paso ${idx + 1} de ${NUMBERED.length}`}>
      {NUMBERED.map((k, i) => (
        <span key={k} className={`${s.dot} ${i === idx ? s.dotOn : i < idx ? s.dotDone : ''}`} />
      ))}
    </div>
  )
}

/** Anillo que resalta un elemento de la pantalla (data-tour="…"). */
function Spotlight({ target }: { target: string | null }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useEffect(() => {
    if (!target) {
      setRect(null)
      return
    }
    const find = () => {
      const el = document.querySelector(`[data-tour="${target}"]`)
      setRect(el ? el.getBoundingClientRect() : null)
    }
    find()
    const t = setInterval(find, 400)
    window.addEventListener('resize', find)
    return () => {
      clearInterval(t)
      window.removeEventListener('resize', find)
    }
  }, [target])
  if (!rect) return null
  const pad = 8
  return (
    <div
      className={s.spot}
      style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
      aria-hidden
    />
  )
}

export default function GuidedTour({
  projectName,
  step,
  brain,
  isAdmin,
  forced,
  onStep,
  onStart,
  onStop,
  onOpenSheet,
  onGoFlow,
  onSaveFlow1,
  onClose,
}: {
  projectName: string
  step: TourStep
  brain: BrainPublic | null
  isAdmin: boolean
  /** Abierto a mano con «Tutorial» aunque ya estuviera hecho. */
  forced: boolean
  onStep: (s: TourStep) => void
  onStart: () => Promise<void>
  onStop: () => Promise<void>
  onOpenSheet: (s: 'repo' | 'cerebro' | null) => void
  onGoFlow: (f: 'cerebro' | 'cambios') => void
  onSaveFlow1: (c: Flow1Config) => Promise<boolean>
  onClose: () => void
}) {
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [finished, setFinished] = useState(false)

  // Cada paso nuevo vuelve a mostrarse aunque se cerrara el anterior: así, si cierras
  // la ventana durante el rastreo, el aviso de «cerebro listo» aparece igual al terminar.
  useEffect(() => {
    setErr('')
    setHidden(false)
  }, [step, forced])

  if (!isAdmin || hidden) return null
  if (step === 'hecho' && !finished) return null

  const later = () => {
    setHidden(true)
    onClose()
  }

  if (finished) {
    return (
      <div className={s.tourFloat} role="dialog" aria-label="Todo listo">
        <span className={s.eyebrow}>Listo</span>
        <h3 className="text-lg font-semibold tracking-tight text-gray-900">Todo en marcha</h3>
        <p className="text-sm text-gray-500">Las normas que ha propuesto el cerebro te esperan en la bandeja. Apruébalas y serán la base de las pruebas.</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-gray-900 px-4 text-sm font-medium text-white"
            onClick={() => {
              setFinished(false)
              onGoFlow('cambios')
              onClose()
            }}
          >
            Abrir la bandeja
          </button>
          <button type="button" className={s.btn} onClick={() => { setFinished(false); onClose() }}>
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  if (step === 'bienvenida') {
    return (
      <div className={s.tourBackdrop}>
        <div className={s.tourModal} role="dialog" aria-label="Bienvenida">
          <span className={s.eyebrow}>Calidad · {projectName}</span>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Vamos a enseñarle este sistema a Buffalo</h2>
          <div className="flex flex-col gap-4">
            <div className={s.stepRow}>
              <span className={s.stepNum}><Radar className="h-4 w-4" /></span>
              <div>
                <p className="text-sm font-semibold text-gray-900">El cerebro</p>
                <p className="text-sm text-gray-500">Una araña lee el repositorio y los MCP enteros y entiende cómo funciona todo.</p>
              </div>
            </div>
            <div className={s.stepRow}>
              <span className={s.stepNum}><GitBranch className="h-4 w-4" /></span>
              <div>
                <p className="text-sm font-semibold text-gray-900">El flujo de cambios</p>
                <p className="text-sm text-gray-500">Cada mejora se convierte en una norma que se puede probar.</p>
              </div>
            </div>
            <div className={s.stepRow}>
              <span className={s.stepNum}><Sparkles className="h-4 w-4" /></span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Después</p>
                <p className="text-sm text-gray-500">Vigilar las conversaciones reales y proponer mejoras.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-gray-900 px-5 text-sm font-medium text-white"
              onClick={() => {
                onGoFlow('cerebro')
                onStep('fuentes')
              }}
            >
              Empezar
            </button>
            <button type="button" className={s.btn} style={{ height: 44 }} onClick={later}>
              Ahora no
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'fuentes') {
    return (
      <>
        <Spotlight target="fuentes" />
        <div className={s.tourFloat} role="dialog" aria-label="Paso 1: fuentes">
          <div className="flex items-center justify-between">
            <span className={s.eyebrow}>Paso 1 · Fuentes</span>
            <Dots step={step} />
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-gray-900">Dile dónde mirar</h3>
          <p className="text-sm text-gray-500">
            El CRM y los MCP ya están conectados. Pulsa <b className="text-gray-800">Repositorio</b> y elige el del proyecto en la lista de GitHub.
          </p>
          <div className="flex gap-2">
            <button type="button" className={s.btn} onClick={() => onOpenSheet('repo')}>
              Abrir repositorio
            </button>
            <button
              type="button"
              className={`${s.btn} ${s.btnDark} flex-1 justify-center`}
              onClick={() => {
                onOpenSheet(null)
                onStep('rastreo')
              }}
            >
              Siguiente
            </button>
          </div>
          <button type="button" className="self-start text-[12px] text-gray-400 hover:text-gray-600" onClick={later}>
            Seguir más tarde
          </button>
        </div>
      </>
    )
  }

  if (step === 'rastreo') {
    const running = brain?.status === 'running'
    const failed = brain?.status === 'error'
    const stopped = brain?.status === 'stopped'
    const current = brain?.phases.find((p) => p.status === 'running')
    return (
      <>
        <Spotlight target={running ? null : 'lanzar'} />
        <div className={s.tourFloat} role="dialog" aria-label="Paso 2: rastreo">
          <div className="flex items-center justify-between">
            <span className={s.eyebrow}>Paso 2 · Rastreo</span>
            <Dots step={step} />
          </div>
          {running ? (
            <>
              <div className="flex items-end justify-between">
                <h3 className="text-lg font-semibold tracking-tight text-gray-900">La araña está trabajando</h3>
                <span className="text-3xl font-semibold tabular-nums tracking-tight text-gray-900">{brain?.progress ?? 0}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${brain?.progress ?? 0}%` }} />
              </div>
              <p className="truncate text-sm text-gray-500">{current?.detail || 'Preparando…'}</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] text-gray-400">Puedes seguir trabajando. Te aviso al terminar.</p>
                <button type="button" className={s.btn} disabled={busy} onClick={() => void onStop()}>
                  <Square className="h-3 w-3" />
                  Parar
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold tracking-tight text-gray-900">{failed ? 'El rastreo falló' : stopped ? 'Rastreo parado' : 'Lanza la araña'}</h3>
              <p className="text-sm text-gray-500">
                {failed
                  ? brain?.error || 'Revisa las fuentes y vuelve a intentarlo.'
                  : stopped
                  ? 'Lo has parado. Cuando quieras, lánzalo otra vez desde el principio.'
                  : 'Lee todas las fuentes por trozos con un modelo barato y construye el cerebro. Tarda unos minutos y cuesta céntimos (el coste exacto, en la Araña).'}
              </p>
              <button
                type="button"
                disabled={busy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gray-900 px-5 text-sm font-medium text-white disabled:opacity-50"
                onClick={async () => {
                  setBusy(true)
                  setErr('')
                  try {
                    await onStart()
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Error')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {failed || stopped ? 'Lanzar otra vez' : 'Lanzar ahora'}
              </button>
              {err && <p className="text-sm text-red-700">{err}</p>}
            </>
          )}
        </div>
      </>
    )
  }

  if (step === 'cerebro') {
    const b = brain?.brain
    return (
      <div className={s.tourBackdrop}>
        <div className={s.tourModal} role="dialog" aria-label="Cerebro listo">
          <div className="flex items-center justify-between">
            <span className={s.eyebrow}>Paso 3 · Cerebro</span>
            <Dots step={step} />
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900">El cerebro está listo</h2>
          </div>
          {b && <p className="text-sm leading-relaxed text-gray-600">{b.resumen}</p>}
          {b && (
            <div className={s.stats}>
              <div className={s.stat}><strong>{b.entradas.length}</strong><span>Entradas</span></div>
              <div className={s.stat}><strong>{b.agentes.length}</strong><span>Agentes</span></div>
              <div className={s.stat}><strong>{b.herramientas.length}</strong><span>Herramientas</span></div>
              <div className={s.stat}><strong>{b.normas_propuestas.length}</strong><span>Normas</span></div>
            </div>
          )}
          {b && b.huecos.length > 0 && (
            <p className="text-[13px] text-amber-700">Hay {b.huecos.length} cosas que no ha podido saber. Las verás en el cerebro.</p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-gray-900 px-5 text-sm font-medium text-white"
              onClick={() => {
                onGoFlow('cambios')
                onStep('flujo1')
              }}
            >
              Siguiente: el flujo de cambios
            </button>
            <button
              type="button"
              className={s.btn}
              style={{ height: 44 }}
              onClick={() => {
                onOpenSheet('cerebro')
                setHidden(true)
              }}
            >
              <BrainIcon className="h-4 w-4" />
              Ver el cerebro
            </button>
          </div>
        </div>
      </div>
    )
  }

  // flujo1
  return (
    <div className={s.tourBackdrop}>
      <div className={s.tourModal} role="dialog" aria-label="Paso 4: flujo de cambios">
        <div className="flex items-center justify-between">
          <span className={s.eyebrow}>Paso 4 · Flujo de cambios</span>
          <Dots step={step} />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">¿De dónde llegan las mejoras?</h2>
          <p className="mt-1 text-sm text-gray-500">Elige una o varias. Cada mejora se convierte en una norma que espera tu aprobación.</p>
        </div>
        <Flow1ConfigForm
          initial={DEFAULT_FLOW1}
          saving={busy}
          submitLabel="Activar el flujo"
          onSave={async (c) => {
            setBusy(true)
            const ok = await onSaveFlow1(c)
            setBusy(false)
            if (ok) {
              setFinished(true)
              onStep('hecho')
            }
          }}
        />
        <button type="button" className="self-start text-[12px] text-gray-400 hover:text-gray-600" onClick={later}>
          Seguir más tarde
        </button>
      </div>
    </div>
  )
}
