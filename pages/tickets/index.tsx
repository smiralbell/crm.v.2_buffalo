import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, AlertCircle, Settings } from 'lucide-react'
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
  created_at: string
}

interface ProjectFilter {
  id: string
  name: string
  config_ref: string | null
  ticket_count: number
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

        <div className="flex flex-wrap gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700"
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 min-w-[200px]"
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.ticket_count})
              </option>
            ))}
          </select>
        </div>

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
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 font-medium">Incidencia</th>
                    <th className="px-4 py-3 font-medium">Proyecto</th>
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
