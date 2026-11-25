import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Focus,
  FolderKanban,
  LogIn,
  Mail,
  MessageSquare,
  PhoneCall,
  StickyNote,
  Receipt,
  User,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react'
import styles from '@/components/retencion/WatchSystemMap.module.css'
import type { ContextSource, LeadContext, SourceId, SourceItem } from '@/lib/leads/context-sources'

/**
 * Mapa del contexto de un lead: el lead en el centro y cada fuente (correos, reuniones,
 * mensajes, notas…) como un conector. Al pulsar una caja se ve todo su contenido.
 */

const ICON: Record<SourceId, LucideIcon> = {
  origen: LogIn,
  correos: Mail,
  reuniones: Video,
  mensajes: MessageSquare,
  escrito: StickyNote,
  notas: PhoneCall,
  documentos: FileText,
  facturas: Receipt,
  proyecto: FolderKanban,
}

/** Izquierda: lo que llega del cliente. Derecha: lo que hacemos nosotros. */
const LEFT: SourceId[] = ['origen', 'correos', 'reuniones', 'mensajes']
const RIGHT: SourceId[] = ['escrito', 'notas', 'documentos', 'facturas', 'proyecto']
const COL_X = 380
const ROW_GAP = 128

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function fecha(d: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
}

function positions(ids: SourceId[], side: -1 | 1): Map<SourceId, { x: number; y: number }> {
  const m = new Map<SourceId, { x: number; y: number }>()
  ids.forEach((id, i) => m.set(id, { x: side * COL_X, y: (i - (ids.length - 1) / 2) * ROW_GAP }))
  return m
}

function ItemCard({ item }: { item: SourceItem }) {
  const [open, setOpen] = useState(false)
  const long = (item.body?.length ?? 0) > 420
  const isInternal = item.link?.startsWith('/')
  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-gray-900">{item.title}</p>
        {item.date && <span className="shrink-0 text-[11px] text-gray-400">{fecha(item.date)}</span>}
      </div>
      {item.meta.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.meta.map((m) => (
            <span key={m.label} className="max-w-full truncate rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600">
              <span className="text-gray-400">{m.label}:</span> {m.value}
            </span>
          ))}
        </div>
      )}
      {item.body?.trim() && (
        <>
          <p className={`mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700 ${!open && long ? 'line-clamp-6' : ''}`}>
            {item.body.trim()}
          </p>
          {long && (
            <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-medium text-gray-500 hover:text-gray-900">
              {open ? 'Ver menos' : 'Ver todo'}
            </button>
          )}
        </>
      )}
      {item.link && (
        <a
          href={item.link}
          target={isInternal ? undefined : '_blank'}
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
        >
          Abrir <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </li>
  )
}

export default function LeadContextMap({ leadId }: { leadId: number }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [ctx, setCtx] = useState<LeadContext | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<SourceId | null>(null)
  const [cam, setCam] = useState({ x: 0, y: 0, scale: 0.8 })
  const pan = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const [recenter, setRecenter] = useState(0)
  const [busy, setBusy] = useState<'md' | 'copy' | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/leads/${leadId}/fuentes`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error((d as { error?: string }).error || 'No se pudo cargar el contexto')
        return d as LeadContext
      })
      .then(setCtx)
      .catch((e: Error) => setError(e.message))
  }, [leadId])

  useEffect(() => {
    const el = stageRef.current
    const w = el?.clientWidth || 800
    const h = el?.clientHeight || 520
    setCam({ x: 0, y: 0, scale: clamp(Math.min((w - 40) / 1000, (h - 40) / 640), 0.45, 1) })
  }, [recenter, ctx])

  const getMarkdown = useCallback(async () => {
    const res = await fetch(`/api/leads/${leadId}/contexto`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((d as { error?: string }).error || 'No se pudo exportar')
    return d as { markdown: string; fileName: string }
  }, [leadId])

  const download = async () => {
    setBusy('md')
    try {
      const { markdown, fileName } = await getMarkdown()
      const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar')
    } finally {
      setBusy(null)
    }
  }

  const copy = async () => {
    setBusy('copy')
    try {
      const { markdown } = await getMarkdown()
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo copiar')
    } finally {
      setBusy(null)
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
    setCam((c) => ({ ...c, scale: clamp(c.scale * (e.deltaY > 0 ? 0.92 : 1.08), 0.4, 1.5) }))
  }

  const sources = new Map<SourceId, ContextSource>((ctx?.sources || []).map((s) => [s.id, s]))
  const left = LEFT.filter((id) => sources.has(id))
  const right = RIGHT.filter((id) => sources.has(id))
  const pos = new Map<SourceId, { x: number; y: number }>([
    ...Array.from(positions(left, -1)),
    ...Array.from(positions(right, 1)),
  ])
  const current = selected ? sources.get(selected) : null

  const subOf = (s: ContextSource): string => {
    if (!s.items.length) return 'sin datos'
    if (s.id === 'origen') return s.items[0].title.replace(/^Entró por /, '')
    const last = s.items.map((i) => i.date).filter(Boolean).sort().pop() as string | undefined
    return `${s.items.length} · último ${last ? fecha(last) : '—'}`
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Todo el contexto</h2>
          <p className="text-xs text-gray-500">Cada caja es una fuente conectada al lead. Púlsala para ver todo su contenido.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            disabled={busy !== null}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title="Copia todo el contexto en Markdown para pegarlo en ChatGPT o Claude"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copiado' : 'Copiar para ChatGPT / Claude'}
          </button>
          <button
            type="button"
            onClick={() => void download()}
            disabled={busy !== null}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Exportar .md
          </button>
        </div>
      </div>

      <div style={{ height: 560 }}>
        <div
          ref={stageRef}
          className={`${styles.stage} ${panning ? styles.stagePanning : ''}`}
          style={{ minHeight: 0 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {!ctx ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
              {error || 'Cargando el contexto…'}
            </p>
          ) : (
            <div className={styles.world} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})` }}>
              <div className={styles.grid} />
              <svg className={styles.wires} viewBox="-2400 -2400 4800 4800">
                {Array.from(pos.entries()).map(([id, p]) => {
                  const s = sources.get(id)!
                  const has = s.items.length > 0
                  const lit = has && (selected === null || selected === id)
                  const d = p.x < 0 ? curve(p.x + 98, p.y, -110, 0) : curve(110, 0, p.x - 104, p.y)
                  return (
                    <path
                      key={id}
                      d={d}
                      fill="none"
                      stroke={lit ? '#111827' : '#d4d4d8'}
                      strokeWidth={lit ? 1.8 : 1.2}
                      strokeDasharray={has ? undefined : '5 6'}
                      strokeLinecap="round"
                    />
                  )
                })}
              </svg>

              {/* El lead, en el centro */}
              <div
                className={styles.node}
                style={{ transform: 'translate(0px, 0px)', width: 220, marginLeft: -110, cursor: 'default', borderColor: '#a7f3d0' }}
              >
                <span className={styles.icon} style={{ background: '#d1fae5', color: '#047857' }}>
                  <User className="h-4 w-4" />
                </span>
                <span className={styles.copy}>
                  <span className={styles.title}>{ctx.lead.nombre}</span>
                  <span className={styles.sub}>{ctx.lead.empresa || ctx.lead.email || 'Lead'}</span>
                </span>
              </div>

              {Array.from(pos.entries()).map(([id, p]) => {
                const s = sources.get(id)!
                const Icon = ICON[id]
                const has = s.items.length > 0
                return (
                  <button
                    key={id}
                    type="button"
                    data-node={id}
                    onClick={() => setSelected(selected === id ? null : id)}
                    className={`${styles.node} ${selected === id ? styles.selected : ''}`}
                    style={{ transform: `translate(${p.x}px, ${p.y}px)`, opacity: has ? 1 : 0.5 }}
                  >
                    <span className={styles.icon}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className={styles.copy}>
                      <span className={styles.title}>{s.label}</span>
                      <span className={styles.sub}>{subOf(s)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className={styles.hud} data-hud style={{ top: 14, left: 14 }}>
            <button type="button" className={styles.hudBtn} onClick={() => setRecenter((n) => n + 1)}>
              <Focus className="h-3.5 w-3.5" /> Recentrar
            </button>
          </div>

          {current && (
            <aside className={styles.sheet} data-sheet onPointerDown={(e) => e.stopPropagation()}>
              <div className={styles.sheetHead}>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {current.items.length} {current.items.length === 1 ? 'elemento' : 'elementos'}
                  </p>
                  <h3 className="text-[15px] font-semibold text-gray-900">{current.label}</h3>
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
                {current.items.length === 0 ? (
                  <p className="text-sm text-gray-500">No hay nada todavía en esta fuente.</p>
                ) : (
                  <ul className="space-y-2">
                    {current.items.map((it) => (
                      <ItemCard key={it.id} item={it} />
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </section>
  )
}
