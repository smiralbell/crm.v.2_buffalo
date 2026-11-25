import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { canSeeClientPrices } from '@/lib/price-visibility'
import { useAuth } from '@/components/AuthContext'
import { DeveloperTags } from '@/components/gestion-proyecto/ProjectDevelopersPanel'
import { AlertCircle, CheckCircle2, FolderKanban, RefreshCw, Trash2, Wallet } from 'lucide-react'
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
  done: 'Finalizado',
}

const serviceLabel: Record<string, string> = {
  voice_agent: 'Agente de Voz',
  text_agent: 'Agente de Chat',
  dashboard_app: 'Dashboard',
  automation: 'Automatización',
  lead_gen: 'Generación de leads',
  geo_seo: 'GEO / SEO',
}

function sameText(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Título de caja: cliente asociado grande, empresa debajo. Sin repetir el nombre del proyecto. */
function cardIdentity(row: ProjectListRow): { title: string; subtitle: string | null } {
  const nombre = (row.contact?.nombre || '').trim()
  const empresa = (row.contact?.empresa || '').trim()
  if (nombre && empresa && !sameText(nombre, empresa)) {
    return { title: nombre, subtitle: empresa }
  }
  if (nombre) return { title: nombre, subtitle: null }
  if (empresa) return { title: empresa, subtitle: null }
  return { title: row.contact?.email || row.name || 'Sin cliente', subtitle: null }
}

export default function GestionProyectoPage() {
  const { user } = useAuth()
  const isDeveloper = user?.role === 'developer'
  const showMoney = canSeeClientPrices(user?.role)
  const [rows, setRows] = useState<ProjectListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const isAdmin = user?.role === 'admin'
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

  const removeProject = async (row: ProjectListRow) => {
    const who = cardIdentity(row).title
    const ok = window.confirm(
      `¿Eliminar el proyecto de ${who}?\n\n` +
        'Dejará de estar en marcha y desaparecerá de esta lista. ' +
        'Se borra también la configuración del lead. No se puede deshacer desde aquí.'
    )
    if (!ok) return
    setDeletingId(row.id)
    setError('')
    try {
      const res = await fetch(`/api/gestion-proyecto/proyectos/${row.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el proyecto')
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el proyecto')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Layout>
      <div className="w-full space-y-4 -mt-2 lg:-mt-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showMoney && (
            <div className="inline-flex w-full sm:w-auto items-stretch h-10 rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex flex-1 sm:flex-initial items-center gap-2 px-3.5 border-r border-gray-100">
                <Wallet className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <div className="leading-tight min-w-0">
                  <p className="text-[9px] font-medium uppercase tracking-wide text-gray-400">
                    Proyectos
                  </p>
                  <p className="text-xs font-semibold text-gray-900 tabular-nums truncate">
                    {loading ? '…' : fmtEur(money.setup_total_eur)}
                  </p>
                </div>
              </div>
              <div className="flex flex-1 sm:flex-initial items-center px-3.5">
                <div className="leading-tight min-w-0">
                  <p className="text-[9px] font-medium uppercase tracking-wide text-gray-400">
                    Mensualidades
                  </p>
                  <p className="text-xs font-semibold text-gray-900 tabular-nums truncate">
                    {loading ? '…' : `${fmtEur(money.monthly_total_eur)}/mes`}
                  </p>
                </div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 h-10 flex-1 sm:flex-initial border border-gray-200 text-sm font-medium text-gray-700 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
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
              Configura un proyecto en Onboarding y pulsa «Poner en marcha».
            </p>
            <Link
              href="/onboarding"
              className="inline-flex mt-4 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Ir a Onboarding →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => {
              const href = `/gestion-proyecto/proyectos/${row.id}`
              const { title, subtitle } = cardIdentity(row)
              const openTasks =
                row.task_counts.pending +
                row.task_counts.in_progress +
                (row.task_counts.buffalo_validation ?? 0)
              const inProduction = row.status === 'active'
              const isFinalized = row.status === 'done'
              const cardTone = inProduction
                ? 'rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 via-emerald-50/80 to-white p-5 shadow-sm shadow-emerald-100 hover:border-emerald-400 hover:shadow-md transition-all ring-1 ring-emerald-200/60'
                : isFinalized
                  ? 'rounded-2xl border border-sky-300 bg-gradient-to-br from-sky-50 via-sky-50/70 to-white p-5 shadow-sm shadow-sky-100 hover:border-sky-400 hover:shadow-md transition-all ring-1 ring-sky-200/60'
                  : 'rounded-2xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-sm transition-all'
              const muted = inProduction
                ? 'text-emerald-900/60'
                : isFinalized
                  ? 'text-sky-900/60'
                  : 'text-gray-500'
              const titleCls = inProduction
                ? 'text-emerald-950'
                : isFinalized
                  ? 'text-sky-950'
                  : 'text-gray-900'
              const eyebrowCls = inProduction
                ? 'text-emerald-700/80 font-semibold'
                : isFinalized
                  ? 'text-sky-700/80 font-semibold'
                  : 'text-gray-400'
              const subCls = inProduction
                ? 'text-emerald-800/70'
                : isFinalized
                  ? 'text-sky-800/70'
                  : 'text-gray-600'
              const ctaCls = inProduction
                ? 'text-emerald-800'
                : isFinalized
                  ? 'text-sky-800'
                  : 'text-gray-700'
              return (
                <Link key={row.id} href={href} className={cardTone}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-xs uppercase tracking-wide ${eyebrowCls}`}>
                        {inProduction
                            ? 'En producción'
                            : isFinalized
                              ? 'Finalizado'
                              : 'Proyecto Buffalo'}
                      </p>
                      <h2 className={`text-lg font-semibold truncate ${titleCls}`}>{title}</h2>
                      {subtitle && (
                        <p className={`text-sm mt-1 truncate ${subCls}`}>{subtitle}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                                              <span
                          className={
                            inProduction
                              ? 'inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm'
                              : isFinalized
                                ? 'inline-flex items-center gap-1 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm'
                                : 'inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-800'
                          }
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {inProduction ? 'Producción' : isFinalized ? 'Finalizado' : 'Buffalo'}
                        </span>
                      <span
                        className={
                          inProduction
                            ? 'rounded-full bg-emerald-600/10 border border-emerald-300 px-2.5 py-1 text-[11px] font-semibold text-emerald-800'
                            : isFinalized
                              ? 'rounded-full bg-sky-600/10 border border-sky-300 px-2.5 py-1 text-[11px] font-semibold text-sky-800'
                              : 'rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600'
                        }
                      >
                        {statusLabel[row.status] || row.status}
                      </span>
                    </div>
                  </div>

                  <div className={`mt-4 space-y-2 text-sm ${muted}`}>
                                          <>
                        <p>{serviceLabel[row.service_type] || row.service_type}</p>
                        {row.config_ref && (
                          <p
                            className={`font-mono text-[11px] ${
                              inProduction
                                ? 'text-emerald-700/50'
                                : isFinalized
                                  ? 'text-sky-700/50'
                                  : 'text-gray-400'
                            }`}
                          >
                            {row.config_ref}
                          </p>
                        )}
                        {row.developers?.length > 0 && (
                          <DeveloperTags developers={row.developers} className="pt-1" />
                        )}
                      </>
                  </div>

                  <div className="mt-5 flex items-center justify-between text-xs">
                    <span className={subCls}>
                      {inProduction
                          ? 'Entregado · en producción'
                          : isFinalized
                            ? 'Cerrado · sin producción'
                            : `${openTasks} tareas abiertas · ${row.task_counts.done} hechas`}
                    </span>
                    <div className="flex items-center gap-3">
                      {isAdmin && (
                        <button
                          type="button"
                          disabled={deletingId === row.id}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void removeProject(row)
                          }}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {deletingId === row.id ? 'Eliminando…' : 'Eliminar'}
                        </button>
                      )}
                      <span className={`font-medium ${ctaCls}`}>Abrir →</span>
                    </div>
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
