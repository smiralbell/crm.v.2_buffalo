import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
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
 * mensajes, notas…) como un conector. Es fijo y ocupa todo el ancho; al pulsar una caja
 * se ve todo su contenido en el panel lateral.
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

const NODE_W = 230
const NODE_H = 58
const HUB_W = 250
const ROW_GAP = 78
const PAD_Y = 34

function fecha(d: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
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

export default function LeadContextMap({
  leadId,
  refreshKey = 0,
  actions,
}: {
  leadId: number
  /** Cambia para volver a cargar (p. ej. tras importar correos o guardar una reunión) */
  refreshKey?: number
  /** Botones extra en la cabecera */
  actions?: ReactNode
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [ctx, setCtx] = useState<LeadContext | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<SourceId | null>(null)
  const [busy, setBusy] = useState<'md' | 'copy' | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/leads/${leadId}/fuentes`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error((d as { error?: string }).error || 'No se pudo cargar el contexto')
        return d as LeadContext
      })
      .then((d) => {
        setCtx(d)
        setError('')
      })
      .catch((e: Error) => setError(e.message))
  }, [leadId, refreshKey])

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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

  const sources = new Map<SourceId, ContextSource>((ctx?.sources || []).map((s) => [s.id, s]))
  const left = LEFT.filter((id) => sources.has(id))
  const right = RIGHT.filter((id) => sources.has(id))
  const current = selected ? sources.get(selected) : null

  // Geometría: columnas pegadas a los bordes, el lead en el centro
  const rows = Math.max(left.length, right.length, 1)
  const height = PAD_Y * 2 + (rows - 1) * ROW_GAP + NODE_H
  const cy = height / 2
  const wide = width >= 760
  const nodeW = Math.min(NODE_W, Math.max(170, (width - HUB_W - 120) / 2))
  const leftX = 28
  const rightX = width - 28 - nodeW
  const hubX = (width - HUB_W) / 2
  const rowY = (i: number, n: number) => cy + (i - (n - 1) / 2) * ROW_GAP - NODE_H / 2

  const subOf = (s: ContextSource): string => {
    if (!s.items.length) return 'sin datos'
    if (s.id === 'origen') return s.items[0].title.replace(/^Entró por /, '')
    const last = s.items.map((i) => i.date).filter(Boolean).sort().pop() as string | undefined
    return `${s.items.length} · último ${last ? fecha(last) : '—'}`
  }

  const nodeButton = (id: SourceId, style?: CSSProperties) => {
    const s = sources.get(id)!
    const Icon = ICON[id]
    const has = s.items.length > 0
    const isSel = selected === id
    return (
      <button
        key={id}
        type="button"
        onClick={() => setSelected(isSel ? null : id)}
        style={style}
        className={`flex items-center gap-3 rounded-2xl border bg-white px-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
          isSel ? 'border-gray-900 shadow-md ring-2 ring-gray-900/10' : 'border-gray-200 shadow-sm'
        } ${has ? '' : 'opacity-55'}`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            has ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-gray-900">{s.label}</span>
          <span className="block truncate text-[11px] text-gray-500">{subOf(s)}</span>
        </span>
      </button>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Todo el contexto</h2>
          <p className="text-xs text-gray-500">Cada caja es una fuente conectada. Púlsala para ver todo su contenido.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions}
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

      <div
        ref={boxRef}
        className="relative w-full bg-gray-50/70 [background-image:radial-gradient(#d4d4d8_1px,transparent_1px)] [background-size:18px_18px]"
        style={{ height: wide ? height : undefined, minHeight: 200 }}
      >
        {!ctx ? (
          <p className="flex h-[200px] items-center justify-center text-sm text-gray-400">{error || 'Cargando el contexto…'}</p>
        ) : wide ? (
          <>
            <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
              {[...left.map((id, i) => ({ id, side: -1, y: rowY(i, left.length) + NODE_H / 2 })),
                ...right.map((id, i) => ({ id, side: 1, y: rowY(i, right.length) + NODE_H / 2 }))].map(({ id, side, y }) => {
                const s = sources.get(id)!
                const has = s.items.length > 0
                const lit = has && (selected === null || selected === id)
                const d =
                  side < 0
                    ? curve(leftX + nodeW, y, hubX, cy)
                    : curve(hubX + HUB_W, cy, rightX, y)
                return (
                  <path
                    key={id}
                    d={d}
                    fill="none"
                    stroke={lit ? '#111827' : '#d4d4d8'}
                    strokeWidth={lit ? 1.6 : 1.2}
                    strokeDasharray={has ? undefined : '5 6'}
                    strokeLinecap="round"
                  />
                )
              })}
            </svg>

            {/* El lead, en el centro */}
            <div
              className="absolute flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-3.5 shadow-sm"
              style={{ left: hubX, top: cy - 33, width: HUB_W, height: 66 }}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <User className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-900">{ctx.lead.nombre}</span>
                <span className="block truncate text-xs text-gray-500">
                  {ctx.lead.es_cliente ? 'Cliente' : 'Lead'}
                  {ctx.lead.empresa ? ` · ${ctx.lead.empresa}` : ''}
                </span>
              </span>
            </div>

            {left.map((id, i) =>
              nodeButton(id, { position: 'absolute', left: leftX, top: rowY(i, left.length), width: nodeW, height: NODE_H })
            )}
            {right.map((id, i) =>
              nodeButton(id, { position: 'absolute', left: rightX, top: rowY(i, right.length), width: nodeW, height: NODE_H })
            )}
          </>
        ) : (
          // Pantallas estrechas: las fuentes en rejilla, sin conectores
          <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
            {[...left, ...right].map((id) => nodeButton(id, { height: NODE_H }))}
          </div>
        )}

        {current && (
          <aside className={styles.sheet} style={{ position: 'absolute' }}>
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
    </section>
  )
}
