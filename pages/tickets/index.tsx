import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RefreshCw, AlertCircle, Settings, FolderKanban, Clock } from 'lucide-react'
import TicketsWebhookGuideDownload from '@/components/tickets/TicketsWebhookGuideDownload'
import { PRIORITY_LABELS, STATUS_LABELS, type TicketPriority, type TicketStatus } from '@/lib/tickets/ingest'

interface TicketRow {
  id: string
  project_id: string
  project_name: string
  config_ref: string | null
  title: string
  priority: string
  status: string
  last_client_summary: string
  assignee_user_id: number | null
  assignee_name: string | null
  created_at: string
}

interface ProjectFilter {
  id: string
  name: string
  config_ref: string | null
  ticket_count: number
}

interface TicketStats {
  total: number
  unresolved: number
  open: number
  in_progress: number
  resolved: number
  closed: number
  projects_with_tickets: number
  last_7_days: number
}

const priorityClass: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-50 text-blue-800',
  high: 'bg-amber-50 text-amber-800',
  critical: 'bg-red-50 text-red-800',
}

const statusClass: Record<string, string> = {
  open: 'bg-sky-50 text-sky-800',
  in_progress: 'bg-violet-50 text-violet-800',
  resolved: 'bg-emerald-50 text-emerald-800',
  closed: 'bg-gray-100 text-gray-600',
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function TicketsPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [projects, setProjects] = useState<ProjectFilter[]>([])
  const [stats, setStats] = useState<TicketStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (projectFilter) params.set('project_id', projectFilter)
      const res = await fetch(`/api/tickets?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setTickets(data.tickets || [])
      setProjects(data.projects || [])
      setStats(data.stats || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
      setTickets([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, projectFilter])

  useEffect(() => {
    load()
  }, [load])

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select
            value={statusFilter || 'all'}
            onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="h-10 w-[min(100%,200px)] sm:w-[200px] rounded-xl border-gray-200 bg-white text-gray-700 shadow-sm focus:ring-gray-300">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-gray-200 shadow-lg">
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={projectFilter || 'all'}
            onValueChange={(v) => setProjectFilter(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="h-10 w-[min(100%,240px)] sm:w-[240px] rounded-xl border-gray-200 bg-white text-gray-700 shadow-sm focus:ring-gray-300">
              <SelectValue placeholder="Proyecto" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-gray-200 shadow-lg max-h-72">
              <SelectItem value="all">Todos los proyectos</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.ticket_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TicketsWebhookGuideDownload />
          <Link
            href="/tickets/config"
            className="inline-flex items-center gap-2 px-4 h-10 border border-gray-200 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50"
          >
            <Settings className="h-4 w-4" />
            Configurar respuestas
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 h-10 border border-gray-200 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <button
              type="button"
              onClick={() => setStatusFilter('')}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-2xl font-semibold text-gray-900 mt-0.5">{stats.total}</p>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('open')}
              className="rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3 text-left hover:bg-sky-50 transition-colors"
            >
              <p className="text-xs text-sky-700">Sin resolver</p>
              <p className="text-2xl font-semibold text-sky-900 mt-0.5">{stats.unresolved}</p>
              <p className="text-[11px] text-sky-600/80 mt-0.5">
                {stats.open} abiertos · {stats.in_progress} en progreso
              </p>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('resolved')}
              className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-left hover:bg-emerald-50 transition-colors"
            >
              <p className="text-xs text-emerald-700">Resueltos</p>
              <p className="text-2xl font-semibold text-emerald-900 mt-0.5">{stats.resolved}</p>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('closed')}
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left hover:bg-gray-100/80 transition-colors"
            >
              <p className="text-xs text-gray-500">Cerrados</p>
              <p className="text-2xl font-semibold text-gray-900 mt-0.5">{stats.closed}</p>
            </button>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <FolderKanban className="h-3 w-3" />
                Proyectos
              </p>
              <p className="text-2xl font-semibold text-gray-900 mt-0.5">{stats.projects_with_tickets}</p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3">
              <p className="text-xs text-violet-700 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Últimos 7 días
              </p>
              <p className="text-2xl font-semibold text-violet-900 mt-0.5">{stats.last_7_days}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="overflow-x-auto p-0 sm:p-6 sm:pt-6">
            {loading ? (
              <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>
            ) : tickets.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400 px-6">
                No hay incidencias todavía.
              </div>
            ) : (
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 font-medium">Incidencia</th>
                    <th className="px-4 py-3 font-medium">Proyecto</th>
                    <th className="px-4 py-3 font-medium">Developer</th>
                    <th className="px-4 py-3 font-medium">Prioridad</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Último mensaje</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-gray-100 hover:bg-gray-50/80 cursor-pointer"
                      onClick={() => router.push(`/tickets/${t.id}`)}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/tickets/${t.id}`} className="font-medium text-gray-900 hover:underline">
                          {t.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{t.project_name}</td>
                      <td className="px-4 py-3">
                        {t.assignee_name ? (
                          <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[11px] font-medium text-indigo-800">
                            {t.assignee_name}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={priorityClass[t.priority] || priorityClass.medium}>
                          {PRIORITY_LABELS[t.priority as TicketPriority] || t.priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={statusClass[t.status] || statusClass.open}>
                          {STATUS_LABELS[t.status as TicketStatus] || t.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[240px]">
                        <span className="line-clamp-2 text-sm leading-snug">
                          {t.last_client_summary}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
