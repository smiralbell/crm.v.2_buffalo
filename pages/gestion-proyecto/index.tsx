import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { DeveloperTags } from '@/components/gestion-proyecto/ProjectDevelopersPanel'
import { AlertCircle, CheckCircle2, FolderKanban, RefreshCw, Ticket, Wallet } from 'lucide-react'
import type { ProjectListRow } from '@/lib/gestion-proyecto/types'

const fmtEur = (n: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

const statusLabel: Record<string, string> = {
  development: 'En desarrollo',
  active: 'En producción',
  paused: 'Pausado',
}

const serviceLabel: Record<string, string> = {
  voice_agent: 'Agente de Voz',
  text_agent: 'Agente de Chat',
  dashboard_app: 'Dashboard',
  automation: 'Automatización',
  lead_gen: 'Generación de leads',
  geo_seo: 'GEO / SEO',
}

export default function GestionProyectoPage() {
  const [rows, setRows] = useState<ProjectListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [money, setMoney] = useState({
    setup_total_eur: 0,
    monthly_total_eur: 0,
    projects_count: 0,
  })

  const load = () => {
    setLoading(true)
    setError('')
    fetch('/api/gestion-proyecto/proyectos')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || d.hint || 'Error al cargar')
        setRows(d.proyectos || [])
        setMoney({
          setup_total_eur: Number(d.money?.setup_total_eur) || 0,
          monthly_total_eur: Number(d.money?.monthly_total_eur) || 0,
          projects_count: Number(d.money?.projects_count) || 0,
        })
      })
      .catch((e: Error) => {
        setRows([])
        setMoney({ setup_total_eur: 0, monthly_total_eur: 0, projects_count: 0 })
        setError(e.message)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <Layout>
      <div className="w-full max-w-7xl mx-auto space-y-4 -mt-2 lg:-mt-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="inline-flex items-stretch h-10 rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-3.5 border-r border-gray-100">
              <Wallet className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <div className="leading-tight">
                <p className="text-[9px] font-medium uppercase tracking-wide text-gray-400">
                  Proyectos
                </p>
                <p className="text-xs font-semibold text-gray-900 tabular-nums">
                  {loading ? '…' : fmtEur(money.setup_total_eur)}
                </p>
              </div>
            </div>
            <div className="flex items-center px-3.5">
              <div className="leading-tight">
                <p className="text-[9px] font-medium uppercase tracking-wide text-gray-400">
                  Mensualidades
                </p>
                <p className="text-xs font-semibold text-gray-900 tabular-nums">
                  {loading ? '…' : `${fmtEur(money.monthly_total_eur)}/mes`}
                </p>
              </div>
            </div>
          </div>
          <Link
            href="/tickets"
            className="inline-flex items-center gap-2 px-4 h-10 border border-gray-200 text-sm font-medium text-gray-700 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <Ticket className="h-4 w-4" />
            Tickets
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 h-10 border border-gray-200 text-sm font-medium text-gray-700 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm text-gray-400">Cargando proyectos...</div>
        ) : rows.length === 0 && !error ? (
          <div className="rounded-2xl border border-gray-200 bg-white py-16 text-center">
            <FolderKanban className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No hay proyectos Buffalo en marcha.</p>
            <p className="text-xs text-gray-400 mt-1">
              Configura un lead en Onboarding y pulsa «Poner en marcha».
            </p>
            <Link
              href="/onboarding?tab=projects"
              className="inline-flex mt-4 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Ir a Onboarding →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => {
              const isAssignment = row.kind === 'assignment'
              const href = isAssignment
                ? `/gestion-proyecto/asignaciones/${row.id}`
                : `/gestion-proyecto/proyectos/${row.id}`
              const clientName = isAssignment
                ? 'Asignación interna'
                : row.contact?.empresa ||
                  row.contact?.nombre ||
                  row.contact?.email ||
                  'Sin cliente'
              const openTasks =
                row.task_counts.pending +
                row.task_counts.in_progress +
                (row.task_counts.buffalo_validation ?? 0)
              const assignmentStatusLabel: Record<string, string> = {
                pending: 'Pendiente',
                in_progress: 'En curso',
                done: 'Hecha',
                cancelled: 'Cancelada',
              }
              const inProduction = !isAssignment && row.status === 'active'
              return (
                <Link
                  key={row.id}
                  href={href}
                  className={
                    inProduction
                      ? 'rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 via-emerald-50/80 to-white p-5 shadow-sm shadow-emerald-100 hover:border-emerald-400 hover:shadow-md transition-all ring-1 ring-emerald-200/60'
                      : 'rounded-2xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-sm transition-all'
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className={`text-xs uppercase tracking-wide ${
                          inProduction ? 'text-emerald-700/80 font-semibold' : 'text-gray-400'
                        }`}
                      >
                        {isAssignment
                          ? 'Tarea puntual'
                          : inProduction
                            ? 'En producción'
                            : 'Proyecto Buffalo'}
                      </p>
                      <h2
                        className={`text-lg font-semibold truncate ${
                          inProduction ? 'text-emerald-950' : 'text-gray-900'
                        }`}
                      >
                        {row.name}
                      </h2>
                      <p
                        className={`text-sm mt-1 truncate ${
                          inProduction ? 'text-emerald-800/70' : 'text-gray-600'
                        }`}
                      >
                        {clientName}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {!isAssignment && (
                        <span
                          className={
                            inProduction
                              ? 'inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm'
                              : 'inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-800'
                          }
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {inProduction ? 'Producción' : 'Buffalo'}
                        </span>
                      )}
                      <span
                        className={
                          inProduction
                            ? 'rounded-full bg-emerald-600/10 border border-emerald-300 px-2.5 py-1 text-[11px] font-semibold text-emerald-800'
                            : 'rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600'
                        }
                      >
                        {isAssignment
                          ? assignmentStatusLabel[row.status] || row.status
                          : statusLabel[row.status] || row.status}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`mt-4 space-y-2 text-sm ${
                      inProduction ? 'text-emerald-900/60' : 'text-gray-500'
                    }`}
                  >
                    {isAssignment ? (
                      <>
                        {row.assignment_summary && (
                          <p className="line-clamp-2">{row.assignment_summary}</p>
                        )}
                        {row.due_date && (
                          <p className="text-xs text-gray-400">
                            Entrega: {new Date(row.due_date).toLocaleDateString('es-ES')}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p>{serviceLabel[row.service_type] || row.service_type}</p>
                        {row.config_ref && (
                          <p
                            className={`font-mono text-[11px] ${
                              inProduction ? 'text-emerald-700/50' : 'text-gray-400'
                            }`}
                          >
                            {row.config_ref}
                          </p>
                        )}
                        {row.developers?.length > 0 && (
                          <DeveloperTags developers={row.developers} className="pt-1" />
                        )}
                      </>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between text-xs">
                    <span className={inProduction ? 'text-emerald-800/70' : 'text-gray-500'}>
                      {isAssignment
                        ? row.status === 'done'
                          ? 'Completada'
                          : 'Asignación activa'
                        : inProduction
                          ? 'Entregado · en producción'
                          : `${openTasks} tareas abiertas · ${row.task_counts.done} hechas`}
                    </span>
                    <span
                      className={`font-medium ${
                        inProduction ? 'text-emerald-800' : 'text-gray-700'
                      }`}
                    >
                      Abrir →
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
