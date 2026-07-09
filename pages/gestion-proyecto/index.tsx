import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { DeveloperTags } from '@/components/gestion-proyecto/ProjectDevelopersPanel'
import { AlertCircle, FolderKanban, RefreshCw } from 'lucide-react'
import type { ProjectListRow } from '@/lib/gestion-proyecto/types'

const statusLabel: Record<string, string> = {
  development: 'En desarrollo',
  active: 'Activo',
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

  const load = () => {
    setLoading(true)
    setError('')
    fetch('/api/gestion-proyecto/proyectos')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || d.hint || 'Error al cargar')
        setRows(d.proyectos || [])
      })
      .catch((e: Error) => {
        setRows([])
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
        <div className="flex justify-end">
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
              <p className="text-xs mt-1">
                Si es la primera vez, ejecuta `prisma/CREATE_PROJECT_GESTION_TABLES.sql` en PostgreSQL.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm text-gray-400">Cargando proyectos...</div>
        ) : rows.length === 0 && !error ? (
          <div className="rounded-2xl border border-gray-200 bg-white py-16 text-center">
            <FolderKanban className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No hay proyectos abiertos en este momento.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => {
              const clientName = row.contact?.empresa || row.contact?.nombre || row.contact?.email || 'Sin cliente'
              const openTasks = row.task_counts.pending + row.task_counts.in_progress
              return (
                <Link
                  key={row.id}
                  href={`/gestion-proyecto/proyectos/${row.id}`}
                  className="rounded-2xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400 uppercase tracking-wide">Proyecto</p>
                      <h2 className="text-lg font-semibold text-gray-900 truncate">{row.name}</h2>
                      <p className="text-sm text-gray-600 mt-1 truncate">{clientName}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                      {statusLabel[row.status] || row.status}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-gray-500">
                    <p>{serviceLabel[row.service_type] || row.service_type}</p>
                    {row.config_ref && <p className="font-mono text-[11px] text-gray-400">{row.config_ref}</p>}
                    {row.developers?.length > 0 && (
                      <DeveloperTags developers={row.developers} className="pt-1" />
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between text-xs">
                    <span className="text-gray-500">
                      {openTasks} tareas abiertas · {row.task_counts.done} hechas
                    </span>
                    <span className="font-medium text-indigo-600">Abrir →</span>
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
