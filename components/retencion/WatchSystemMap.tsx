import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { AlertTriangle, BookOpen, Bot, Database, MessageSquare } from 'lucide-react'
import type { WatchNodeId } from '@/lib/retencion/watch-store'
import styles from './WatchSystemMap.module.css'

export type MapNode = {
  id: WatchNodeId
  label: string
  sub: string
  x: number
  y: number
}

const DEFAULT_NODES: MapNode[] = [
  { id: 'agent', label: 'Agente', sub: 'vigilancia', x: 0, y: -24 },
  { id: 'prompt', label: 'Prompts', sub: 'agentes', x: -260, y: -170 },
  { id: 'knowledge', label: 'Knowledge', sub: 'contexto', x: 270, y: -130 },
  { id: 'db', label: 'Base de datos', sub: 'PostgreSQL', x: -250, y: 170 },
  { id: 'incidents', label: 'Incidencias', sub: 'abiertas', x: 240, y: 190 },
]

const EDGES: [WatchNodeId, WatchNodeId][] = [
  ['agent', 'db'],
  ['agent', 'knowledge'],
  ['agent', 'prompt'],
  ['agent', 'incidents'],
]

const ICONS: Record<WatchNodeId, typeof Bot> = {
  agent: Bot,
  db: Database,
  knowledge: BookOpen,
  prompt: MessageSquare,
  incidents: AlertTriangle,
}

const STORAGE = (proyectoId: string) => `retencion-map:${proyectoId}`

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n))
}

function loadPositions(proyectoId: string): MapNode[] {
  try {
    const raw = localStorage.getItem(STORAGE(proyectoId))
    if (!raw) return DEFAULT_NODES.map((n) => ({ ...n }))
    const parsed = JSON.parse(raw) as { id: WatchNodeId; x: number; y: number }[]
    return DEFAULT_NODES.map((n) => {
      const hit = parsed.find((p) => p.id === n.id)
      return hit ? { ...n, x: hit.x, y: hit.y } : { ...n }
    })
  } catch {
    return DEFAULT_NODES.map((n) => ({ ...n }))
  }
}

function curve(a: MapNode, b: MapNode): string {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  return `M ${a.x} ${a.y} Q ${mx - dy * 0.12} ${my + dx * 0.12} ${b.x} ${b.y}`
}

type Drag =
  | { kind: 'pan'; x: number; y: number; camX: number; camY: number }
  | { kind: 'node'; id: WatchNodeId; x: number; y: number; origX: number; origY: number; moved: boolean }

export default function WatchSystemMap({
  proyectoId,
  used,
  labels,
  selected,
  onSelect,
  children,
  toolbar,
}: {
  proyectoId: string
  used?: WatchNodeId[]
  labels: Record<WatchNodeId, string>
  selected: WatchNodeId | null
  onSelect: (id: WatchNodeId | null) => void
  children?: React.ReactNode
  toolbar?: React.ReactNode
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [nodes, setNodes] = useState<MapNode[]>(DEFAULT_NODES)
  const [cam, setCam] = useState({ x: 0, y: 0, scale: 1 })
  const drag = useRef<Drag | null>(null)
  const [panning, setPanning] = useState(false)
  const usedSet = useMemo(() => new Set(used?.length ? used : ['agent']), [used])

  useEffect(() => {
    setNodes(loadPositions(proyectoId))
    setCam({ x: 0, y: 0, scale: 1 })
  }, [proyectoId])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('[data-hud]') || target.closest('[data-sheet]')) return
    const nodeEl = target.closest('[data-node]') as HTMLElement | null
    if (nodeEl) {
      const id = nodeEl.dataset.node as WatchNodeId
      const node = nodes.find((n) => n.id === id)
      if (!node) return
      drag.current = { kind: 'node', id, x: e.clientX, y: e.clientY, origX: node.x, origY: node.y, moved: false }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y }
    setPanning(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') {
      setCam((c) => ({ ...c, x: d.camX + (e.clientX - d.x), y: d.camY + (e.clientY - d.y) }))
      return
    }
    const dx = (e.clientX - d.x) / cam.scale
    const dy = (e.clientY - d.y) / cam.scale
    if (Math.hypot(dx, dy) > 4) d.moved = true
    setNodes((prev) => {
      const next = prev.map((n) => (n.id === d.id ? { ...n, x: d.origX + dx, y: d.origY + dy } : n))
      localStorage.setItem(
        STORAGE(proyectoId),
        JSON.stringify(next.map((n) => ({ id: n.id, x: n.x, y: n.y })))
      )
      return next
    })
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    setPanning(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (d?.kind === 'node' && !d.moved) {
      onSelect(selected === d.id ? null : d.id)
    }
  }

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-sheet],[data-hud]')) return
    e.preventDefault()
    const el = stageRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const next = clamp(cam.scale * (e.deltaY > 0 ? 0.92 : 1.08), 0.55, 1.7)
    const wx = (cx - rect.width / 2 - cam.x) / cam.scale
    const wy = (cy - rect.height / 2 - cam.y) / cam.scale
    setCam({
      scale: next,
      x: cx - rect.width / 2 - wx * next,
      y: cy - rect.height / 2 - wy * next,
    })
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
      <div
        className={styles.world}
        style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})` }}
      >
        <div className={styles.grid} />
        <svg className={styles.wires} viewBox="-2400 -2400 4800 4800">
          {EDGES.map(([from, to]) => {
            const a = nodes.find((n) => n.id === from)
            const b = nodes.find((n) => n.id === to)
            if (!a || !b) return null
            const lit = usedSet.has(from) && usedSet.has(to)
            return (
              <path
                key={`${from}-${to}`}
                d={curve(a, b)}
                fill="none"
                stroke={lit ? '#111827' : '#d4d4d8'}
                strokeWidth={lit ? 1.6 : 1.2}
                strokeLinecap="round"
              />
            )
          })}
        </svg>
        {nodes.map((n) => {
          const Icon = ICONS[n.id]
          return (
            <button
              key={n.id}
              type="button"
              data-node={n.id}
              className={`${styles.node} ${selected === n.id ? styles.selected : ''} ${usedSet.has(n.id) ? styles.used : ''}`}
              style={{ transform: `translate(${n.x}px, ${n.y}px)` }}
            >
              <span className={styles.icon}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={styles.copy}>
                <span className={styles.title}>{n.label}</span>
                <span className={styles.sub}>{labels[n.id] || n.sub}</span>
              </span>
            </button>
          )
        })}
      </div>

      {toolbar && (
        <div className={styles.hud} data-hud style={{ top: 16, left: 16 }}>
          {toolbar}
        </div>
      )}

      {children}

      <p className={styles.hint}>Arrastra el mapa o las cajas · rueda para zoom · clic para configurar</p>
    </div>
  )
}

export { DEFAULT_NODES }
export type { WatchNodeId }
