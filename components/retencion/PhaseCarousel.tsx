'use client'

import { useCallback, useEffect, useRef, useState, Children, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type PhaseMeta = {
  id: string
  n: string
  title: string
  subtitle: string
}

type Props = {
  phases: PhaseMeta[]
  phase: number
  onPhaseChange: (index: number) => void
  children: ReactNode
  className?: string
}

/**
 * Carrusel de fases: stepper + contenido.
 * Navegación por stepper, teclado (←/→) y arrastre.
 */
export default function PhaseCarousel({
  phases,
  phase,
  onPhaseChange,
  children,
  className,
}: Props) {
  const drag = useRef<{ active: boolean; startX: number; delta: number }>({
    active: false,
    startX: 0,
    delta: 0,
  })
  const [dragPx, setDragPx] = useState(0)
  const [dragging, setDragging] = useState(false)

  const go = useCallback(
    (next: number) => {
      onPhaseChange(Math.max(0, Math.min(phases.length - 1, next)))
    },
    [onPhaseChange, phases.length]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        go(phase + 1)
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(phase - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, phase])

  useEffect(() => {
    setDragPx(0)
    setDragging(false)
  }, [phase])

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('button, a, input, textarea, select, [data-no-drag]')) return
    drag.current = { active: true, startX: e.clientX, delta: 0 }
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    drag.current.delta = e.clientX - drag.current.startX
    setDragPx(drag.current.delta)
  }

  const endDrag = () => {
    if (!drag.current.active) return
    const d = drag.current.delta
    drag.current.active = false
    setDragging(false)
    setDragPx(0)
    if (d < -90) go(phase + 1)
    else if (d > 90) go(phase - 1)
  }

  const slides = Children.toArray(children)

  return (
    <div className={cn('relative', className)}>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {phases.map((p, i) => {
          const active = i === phase
          const past = i < phase
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => go(i)}
              className={cn(
                'text-left rounded-xl border px-3 py-2 transition-all duration-300',
                active
                  ? 'border-zinc-900 bg-zinc-900 text-white shadow-md shadow-zinc-900/10'
                  : past
                    ? 'border-emerald-200 bg-emerald-50 hover:border-emerald-300'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                    active
                      ? 'bg-white text-zinc-900'
                      : past
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-100 text-zinc-600'
                  )}
                >
                  {p.n}
                </span>
                <div className="min-w-0 hidden sm:block">
                  <p
                    className={cn(
                      'text-[13px] font-semibold truncate leading-tight',
                      active ? 'text-white' : past ? 'text-emerald-900' : 'text-zinc-900'
                    )}
                  >
                    {p.title}
                  </p>
                  <p
                    className={cn(
                      'text-[10px] truncate mt-0.5',
                      active ? 'text-zinc-400' : past ? 'text-emerald-800/70' : 'text-zinc-500'
                    )}
                  >
                    {p.subtitle}
                  </p>
                </div>
                <p
                  className={cn(
                    'sm:hidden text-[12px] font-semibold',
                    active ? 'text-white' : past ? 'text-emerald-900' : 'text-zinc-800'
                  )}
                >
                  {p.title}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <div
        className="relative overflow-hidden px-1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ touchAction: 'pan-y' }}
      >
        {slides.map((child, i) => {
          const active = i === phase
          const offsetPct = (i - phase) * 100
          return (
            <div
              key={phases[i]?.id || i}
              aria-hidden={!active}
              className={cn(
                'w-full',
                active ? 'relative' : 'absolute left-0 right-0 top-0',
                !active && 'pointer-events-none',
                dragging
                  ? 'transition-none'
                  : 'transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'
              )}
              style={{
                transform: `translate3d(calc(${offsetPct}% + ${active ? dragPx : 0}px), 0, 0)`,
                opacity: active ? 1 : 0,
                zIndex: active ? 1 : 0,
              }}
            >
              {child}
            </div>
          )
        })}
      </div>
    </div>
  )
}
