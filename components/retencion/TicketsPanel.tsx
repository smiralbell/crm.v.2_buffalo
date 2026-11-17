import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Link2, Loader2, RefreshCw, Ticket } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import TicketConnectionDetails, {
  type TicketConnection,
  type TicketProjectConfig,
} from '@/components/tickets/TicketConnectionDetails'
import { PRIORITY_LABELS, STATUS_LABELS, type TicketPriority, type TicketStatus } from '@/lib/tickets/ingest'
import { cn } from '@/lib/utils'

interface TicketRow {
  id: string
  title: string
  priority: string
  status: string
  last_client_summary: string
  assignee_name: string | null
  created_at: string
}

type Filter = 'unresolved' | 'all' | 'resolved'

const PRIORITY_CLASS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-50 text-blue-800',
  high: 'bg-amber-50 text-amber-800',
  critical: 'bg-red-50 text-red-800',
}

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-sky-50 text-sky-800',
  in_progress: 'bg-violet-50 text-violet-800',
  resolved: 'bg-emerald-50 text-emerald-800',
  closed: 'bg-gray-100 text-gray-600',
}

const RESOLVED = new Set(['resolved', 'closed'])

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric' })
}

/** Pestaña Tickets de un proyecto de Retención: sus tickets y cómo conectar su panel. */
export default function TicketsPanel({
  proyectoId,
  proyectoName,
  connectionOpen,
  onConnectionOpenChange,
}: {
  proyectoId: string
  proyectoName: string
  connectionOpen: boolean
  onConnectionOpenChange: (open: boolean) => void
}) {
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [project, setProject] = useState<TicketProjectConfig | null>(null)
  const [conn, setConn] = useState<TicketConnection | null>(null)
  const [filter, setFilter] = useState<Filter>('unresolved')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tRes, cRes] = await Promise.all([
        fetch(`/api/tickets?project_id=${encodeURIComponent(proyectoId)}&limit=100`),
        fetch('/api/tickets/config'),
      ])
      const tData = await tRes.json().catch(() => ({}))
      if (!tRes.ok) throw new Error(tData.error || 'No se pudieron cargar los tickets')
      setTickets(tData.tickets || [])
      const cData = await cRes.json().catch(() => ({}))
      if (cRes.ok) {
        setConn(cData.connection || null)
        const found = (cData.projects || []).find((p: TicketProjectConfig) => p.id === proyectoId)
        setProject(
          found || {
            id: proyectoId,
            name: proyectoName,
            config_ref: null,
            ticket_callback_url: null,
            ticket_callback_token: null,
            ticket_count: 0,
          }
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [proyectoId, proyectoName])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, resolved: 0, closed: 0 }
    for (const t of tickets) if (t.status in c) c[t.status as keyof typeof c] += 1
    return c
  }, [tickets])

  const visible = useMemo(
    () =>
      tickets.filter((t) =>
        filter === 'all' ? true : filter === 'resolved' ? RESOLVED.has(t.status) : !RESOLVED.has(t.status)
      ),
    [tickets, filter]
  )

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'unresolved', label: 'Sin resolver', count: counts.open + counts.in_progress },
    { id: 'resolved', label: 'Resueltos', count: counts.resolved + counts.closed },
    { id: 'all', label: 'Todos', count: tickets.length },
  ]

  return (
    <div className="space-y-5">
      <Dialog open={connectionOpen} onOpenChange={onConnectionOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[28px] border-2 border-white sm:rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Conexión de tickets · {proyectoName}</DialogTitle>
            <DialogDescription>
              Todo lo que necesita el panel de este cliente para mandar tickets al CRM y recibir vuestras respuestas.
            </DialogDescription>
          </DialogHeader>
          {project && conn ? (
            <TicketConnectionDetails key={project.id} project={project} conn={conn} onSaved={() => void load()} />
          ) : (
            <div className="flex justify-center py-10 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['open', 'Abiertos'],
            ['in_progress', 'En curso'],
            ['resolved', 'Resueltos'],
            ['closed', 'Cerrados'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{counts[key]}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                filter === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              )}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-gray-400">{t.count}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          aria-label="Actualizar"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}

      {loading && !tickets.length ? (
        <div className="py-12 text-center text-sm text-gray-400">Cargando tickets…</div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100">
            <Ticket className="h-5 w-5 text-gray-500" />
          </div>
          <p className="font-medium text-gray-800">
            {tickets.length === 0 ? 'Este cliente aún no tiene tickets' : 'Nada en este filtro'}
          </p>
          {tickets.length === 0 && (
            <>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Cuando su panel esté conectado, los tickets que abra aparecerán aquí.
              </p>
              <button
                type="button"
                onClick={() => onConnectionOpenChange(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                <Link2 className="h-4 w-4" />
                Ver cómo conectarlo
              </button>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tickets/${t.id}`}
                className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-gray-300 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{t.title}</p>
                  {t.last_client_summary && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{t.last_client_summary}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                  <span className={cn('rounded-full px-2 py-0.5 font-medium', PRIORITY_CLASS[t.priority] || PRIORITY_CLASS.medium)}>
                    {PRIORITY_LABELS[t.priority as TicketPriority] || t.priority}
                  </span>
                  <span className={cn('rounded-full px-2 py-0.5 font-medium', STATUS_CLASS[t.status] || STATUS_CLASS.open)}>
                    {STATUS_LABELS[t.status as TicketStatus] || t.status}
                  </span>
                  {t.assignee_name && <span className="text-gray-500">{t.assignee_name}</span>}
                  <span className="text-gray-400">{fmtDate(t.created_at)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
