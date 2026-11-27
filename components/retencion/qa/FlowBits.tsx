import type { LucideIcon } from 'lucide-react'
import s from './qa.module.css'

/** Piezas comunes de los mapas de calidad: nodos, cables y anillo de progreso. */

export type NodeState = 'idle' | 'running' | 'done' | 'error' | 'dim'

export function FlowNode({
  icon: Icon,
  title,
  sub,
  state = 'idle',
  selected,
  big,
  badge,
  onClick,
  children,
  tour,
}: {
  icon: LucideIcon
  title: string
  sub?: string
  state?: NodeState
  selected?: boolean
  big?: boolean
  badge?: number | string | null
  onClick?: () => void
  children?: React.ReactNode
  tour?: string
}) {
  const cls = [
    s.node,
    big ? s.big : '',
    selected ? s.selected : '',
    state === 'running' ? s.running : '',
    state === 'done' ? s.done : '',
    state === 'error' ? s.error : '',
    state === 'dim' ? s.dim : '',
  ].join(' ')
  return (
    <button type="button" className={cls} onClick={onClick} data-tour={tour}>
      {badge != null && badge !== 0 && badge !== '' && <span className={s.badge}>{badge}</span>}
      {children ?? (
        <span className={s.icon}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      )}
      <span className={s.copy} style={big ? { alignItems: 'center' } : undefined}>
        <span className={s.title}>{title}</span>
        {sub && <span className={s.sub}>{sub}</span>}
      </span>
    </button>
  )
}

/** Cables de N nodos apilados (76 px de alto, 14 px de separación) a uno central. */
export function FanWire({ count, lit, reverse }: { count: number; lit?: boolean[]; reverse?: boolean }) {
  const h = count * 76 + (count - 1) * 14
  const mid = h / 2
  const color = (i: number) => (lit?.[i] ? '#111827' : '#d4d4d8')
  return (
    <svg className={s.wire} viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ height: h }} aria-hidden>
      {Array.from({ length: count }).map((_, i) => {
        const y = 38 + i * 90
        const d = reverse ? `M 4 ${mid} C 50 ${mid}, 50 ${y}, 96 ${y}` : `M 4 ${y} C 50 ${y}, 50 ${mid}, 96 ${mid}`
        return <path key={i} d={d} fill="none" stroke={color(i)} strokeWidth={lit?.[i] ? 1.8 : 1.3} vectorEffect="non-scaling-stroke" />
      })}
    </svg>
  )
}

export function LineWire({ lit }: { lit?: boolean }) {
  return (
    <svg className={s.wire} viewBox="0 0 100 20" preserveAspectRatio="none" style={{ height: 20 }} aria-hidden>
      <defs>
        <marker id="qa-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={lit ? '#111827' : '#d4d4d8'} />
        </marker>
      </defs>
      <path
        d="M 6 10 L 92 10"
        stroke={lit ? '#111827' : '#d4d4d8'}
        strokeWidth={lit ? 1.8 : 1.3}
        vectorEffect="non-scaling-stroke"
        markerEnd="url(#qa-arrow)"
      />
    </svg>
  )
}

export function ProgressRing({ value, done }: { value: number; done?: boolean }) {
  const r = 32
  const c = 2 * Math.PI * r
  return (
    <svg className={s.ring} viewBox="0 0 76 76" role="img" aria-label={`${value} %`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="#eef0f3" strokeWidth="6" />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke={done ? '#10b981' : '#111827'}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(c * value) / 100} ${c}`}
        transform="rotate(-90 38 38)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="38" y="43" textAnchor="middle" className={s.ringText}>
        {value}%
      </text>
    </svg>
  )
}

export function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}
