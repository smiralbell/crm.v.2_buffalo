import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { useAuth } from '@/components/AuthContext'
import type { DeveloperDailyHoursPoint, DeveloperProjectHoursRow } from '@/lib/developer/work-charts'
import {
  FolderKanban,
  ListTodo,
  Ticket,
  HeartHandshake,
  FileText,
  Clock,
  Loader2,
  ArrowRight,
} from 'lucide-react'

const DeveloperWorkTimelineChart = dynamic(
  () => import('@/components/developer/DeveloperWorkTimelineChart'),
  { ssr: false, loading: () => <div className="h-56 bg-gray-50 rounded-xl animate-pulse" /> }
)
const DeveloperHoursByProjectChart = dynamic(
  () => import('@/components/developer/DeveloperHoursByProjectChart'),
  { ssr: false, loading: () => <div className="h-56 bg-gray-50 rounded-xl animate-pulse" /> }
)

interface Stats {
  projects_count: number
  open_tasks: number
  done_tasks: number
  estimated_hours_open: number
  estimated_hours_done: number
  tickets_open: number
  tickets_in_progress: number
  retention_projects: number
  retention_review_due: number
  invoices_count: number
  invoices_total_con_iva: number
  invoices_pending_draft: number
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

function developerFirstName(name: string | undefined, email: string | undefined): string {
  const trimmed = name?.trim()
  if (trimmed && trimmed.toLowerCase() !== 'developer') {
    return trimmed.split(/\s+/)[0]
  }
  const local = email?.split('@')[0]?.trim()
  return local || ''
}

interface Charts {
  daily_hours: DeveloperDailyHoursPoint[]
  hours_by_project: DeveloperProjectHoursRow[]
}

export default function DeveloperDashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [charts, setCharts] = useState<Charts | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/developer/dashboard')
      .then((r) => r.json())
      .then((d) => {
        setStats(d.stats || null)
        setCharts(d.charts || null)
        const name = d.user?.name || user?.name || user?.email?.split('@')[0] || ''
        setDisplayName(developerFirstName(name, d.user?.email || user?.email))
      })
      .catch(() => {
        setStats(null)
        setCharts(null)
      })
      .finally(() => setLoading(false))
  }, [user?.name, user?.email])

  const ticketsPending = (stats?.tickets_open ?? 0) + (stats?.tickets_in_progress ?? 0)
  const greetingName =
    displayName ||
    developerFirstName(user?.name, user?.email) ||
    user?.email?.split('@')[0] ||
    ''

  return (
    <Layout>
      <div className="w-full space-y-6 -mt-2">
        <div className="rounded-2xl bg-gray-900 text-white px-6 py-8">
          <p className="text-xs font-medium uppercase tracking-wider text-white/60">Tu panel</p>
          <div className="mt-1 flex items-center gap-1.5">
            <h1 className="text-2xl font-bold">
              Hola{greetingName ? `, ${greetingName}` : ''}
            </h1>
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Link
                href="/gestion-proyecto"
                className="rounded-2xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <FolderKanban className="h-5 w-5 text-indigo-600 mb-3" />
                <p className="text-xs text-gray-500">Proyectos asignados</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.projects_count}</p>
              </Link>

              <Link
                href="/gestion-proyecto"
                className="rounded-2xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <ListTodo className="h-5 w-5 text-violet-600 mb-3" />
                <p className="text-xs text-gray-500">Tareas abiertas</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.open_tasks}</p>
                <p className="text-[11px] text-gray-400 mt-1">{stats.done_tasks} completadas</p>
              </Link>

              <Link
                href="/tickets"
                className="rounded-2xl border border-sky-100 bg-sky-50/40 p-5 hover:bg-sky-50 transition-all"
              >
                <Ticket className="h-5 w-5 text-sky-600 mb-3" />
                <p className="text-xs text-sky-700">Tickets pendientes</p>
                <p className="text-3xl font-bold text-sky-900 mt-1">{ticketsPending}</p>
              </Link>

              <Link
                href="/retencion"
                className="rounded-2xl border border-amber-100 bg-amber-50/40 p-5 hover:bg-amber-50 transition-all"
              >
                <HeartHandshake className="h-5 w-5 text-amber-600 mb-3" />
                <p className="text-xs text-amber-800">Retención</p>
                <p className="text-3xl font-bold text-amber-900 mt-1">{stats.retention_projects}</p>
                {stats.retention_review_due > 0 && (
                  <p className="text-[11px] text-amber-700 mt-1 font-medium">
                    {stats.retention_review_due} por revisar este mes
                  </p>
                )}
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-900">Horas estimadas</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">En tareas abiertas</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {stats.estimated_hours_open}h
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">En tareas hechas</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {stats.estimated_hours_done}h
                    </p>
                  </div>
                </div>
              </div>

              <Link
                href="/developer/facturas"
                className="rounded-2xl border border-gray-200 bg-white p-6 hover:border-gray-300 transition-all block"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <h2 className="text-sm font-semibold text-gray-900">Facturación</h2>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{fmt(stats.invoices_total_con_iva)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.invoices_count} facturas · {stats.invoices_pending_draft} borradores
                </p>
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-gray-900">Actividad diaria</h2>
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                    Últimos 30 días
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                  Horas estimadas de tareas completadas cada día
                </p>
                <DeveloperWorkTimelineChart data={charts?.daily_hours ?? []} />
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-gray-900">Horas por proyecto</h2>
                  <Link
                    href="/gestion-proyecto"
                    className="text-[11px] font-medium text-gray-500 hover:text-gray-900"
                  >
                    Ver proyectos
                  </Link>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                  Total de horas en tareas hechas por proyecto asignado
                </p>
                <DeveloperHoursByProjectChart data={charts?.hours_by_project ?? []} />
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 text-center py-12">No se pudo cargar el resumen.</p>
        )}
      </div>
    </Layout>
  )
}
