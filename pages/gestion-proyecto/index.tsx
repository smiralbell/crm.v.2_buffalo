import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { canSeeClientPrices } from '@/lib/price-visibility'
import { useAuth } from '@/components/AuthContext'
import { DeveloperTags } from '@/components/gestion-proyecto/ProjectDevelopersPanel'
import { AlertCircle, ArrowRight, FolderKanban, Trash2 } from 'lucide-react'
import type { ProjectListRow } from '@/lib/gestion-proyecto/types'

const fmtEur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

type StatusKey = 'development' | 'active' | 'paused' | 'done'

const STATUS: Record<StatusKey, { label: string; dot: string; badge: string }> = {
  development: { label: 'En desarrollo', dot: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700 ring-sky-200' },
  active: { label: 'En producción', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  paused: { label: 'Pausado', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  done: { label: 'Finalizado', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-600 ring-gray-200' },
}
const STATUS_ORDER: StatusKey[] = ['development', 'active', 'paused', 'done']

function statusOf(row: ProjectListRow): StatusKey {
  return (STATUS_ORDER as string[]).includes(row.status) ? (row.status as StatusKey) : 'development'
}

function sameText(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Cliente como título y empresa debajo, sin repetir. */
function cardIdentity(row: ProjectListRow): { title: string; subtitle: string | null } {
  const nombre = (row.contact?.nombre || '').trim()
  const empresa = (row.contact?.empresa || '').trim()
  if (nombre && empresa && !sameText(nombre, empresa)) return { title: nombre, subtitle: empresa }
  if (nombre) return { title: nombre, subtitle: null }
  if (empresa) return { title: empresa, subtitle: null }
  return { title: row.contact?.email || row.name || 'Sin cliente', subtitle: null }
}

function taskStats(row: ProjectListRow) {
  const open = row.task_counts.pending + row.task_counts.in_progress + (row.task_counts.buffalo_validation ?? 0)
  const total = open + row.task_counts.done
  return { open, done: row.task_counts.done, total, pct: total ? Math.round((row.task_counts.done / total) * 100) : 0 }
}

export default function GestionProyectoPage() {
  const { user } = useAuth()
  const showMoney = canSeeClientPrices(user?.role)
  const isAdmin = user?.role === 'admin'
  const [rows, setRows] = useState<ProjectListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [money, setMoney] = useState({ setup_total_eur: 0, monthly_total_eur: 0 })

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    fetch('/api/gestion-proyecto/proyectos')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || d.hint || 'Error al cargar')
        setRows(d.proyectos || [])
        setMoney({
          setup_total_eur: Number(d.money?.setup_total_eur) || 0,
          monthly_total_eur: Number(d.money?.monthly_total_eur) || 0,
        })
        setError('')
      })
      .catch((e: Error) => {
        if (!silent) setRows([])
        setError(e.message)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    // Al volver a la pestaña se actualiza solo
    const onFocus = () => load(true)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const removeProject = async (row: ProjectListRow) => {
    const who = cardIdentity(row).title
    const ok = window.confirm(
      `¿Eliminar el proyecto de ${who}?\n\nDejará de estar en marcha y desaparecerá de esta lista. ` +
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

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { development: 0, active: 0, paused: 0, done: 0 }
    for (const r of rows) c[statusOf(r)]++
    return c
  }, [rows])

  const openTasks = useMemo(
    () => rows.reduce((a, r) => a + (statusOf(r) === 'done' ? 0 : taskStats(r).open), 0),
    [rows]
  )

  // Primero en desarrollo, luego en producción, pausados y finalizados
  const visible = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          STATUS_ORDER.indexOf(statusOf(a)) - STATUS_ORDER.indexOf(statusOf(b)) ||
          b.updated_at.localeCompare(a.updated_at)
      ),
    [rows]
  )

  const kpis = [
    { label: 'En desarrollo', value: String(counts.development) },
    { label: 'En producción', value: String(counts.active) },
    { label: 'Tareas abiertas', value: String(openTasks) },
    ...(showMoney
      ? [
          { label: 'Setup total', value: fmtEur(money.setup_total_eur) },
          { label: 'Mensualidades', value: `${fmtEur(money.monthly_total_eur)}/mes` },
        ]
      : [{ label: 'Finalizados', value: String(counts.done) }]),
  ]

  return (
    <Layout>
      <div className="w-full space-y-6 -mt-2 lg:-mt-3">
        <div className={`grid grid-cols-2 gap-3 ${showMoney ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{k.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{loading ? '…' : k.value}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm text-gray-400">Cargando proyectos…</div>
        ) : visible.length === 0 && !error ? (
          <div className="rounded-2xl border border-gray-200 bg-white py-16 text-center">
            <FolderKanban className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">No hay proyectos Buffalo en marcha.</p>
            <p className="mt-1 text-xs text-gray-400">Los proyectos aparecen aquí cuando se ponen en marcha.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((row) => {
              const { title, subtitle } = cardIdentity(row)
              const st = STATUS[statusOf(row)]
              const tasks = taskStats(row)
              const finished = statusOf(row) === 'done'
              return (
                <Link
                  key={row.id}
                  href={`/gestion-proyecto/proyectos/${row.id}`}
                  className="group flex flex-col items-center rounded-2xl border border-gray-200 bg-white px-6 pb-5 pt-6 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg hover:shadow-gray-200/70"
                >
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${st.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>

                  <h2 className="mt-4 w-full truncate text-lg font-semibold text-gray-900">{title}</h2>
                  <p className="mt-1 w-full truncate text-sm text-gray-500">{subtitle || row.name}</p>

                  {!finished && tasks.total > 0 && (
                    <div className="mt-5 w-full">
                      <div className="mb-1.5 flex justify-between text-[11px] text-gray-500">
                        <span>
                          {tasks.open} abiertas · {tasks.done} hechas
                        </span>
                        <span className="tabular-nums">{tasks.pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-gray-900" style={{ width: `${tasks.pct}%` }} />
                      </div>
                    </div>
                  )}

                  {row.developers?.length > 0 && (
                    <DeveloperTags developers={row.developers} className="mt-5 justify-center" />
                  )}

                  <div className="mt-6 flex w-full items-center justify-between gap-2 border-t border-gray-100 pt-4 text-xs" style={{ marginTop: 'auto' }}>
                    <span className="text-gray-400">Actualizado {fmtDate(row.updated_at)}</span>
                    <div className="flex items-center gap-1">
                      {isAdmin && (
                        <button
                          type="button"
                          disabled={deletingId === row.id}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void removeProject(row)
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                          title="Eliminar proyecto"
                          aria-label="Eliminar proyecto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <span className="inline-flex items-center gap-1 font-medium text-gray-700 group-hover:text-gray-900">
                        Abrir <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
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
