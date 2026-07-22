import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { useAuth } from '@/components/AuthContext'
import { Eye, RefreshCw, AlertCircle } from 'lucide-react'

interface RetencionRow {
  id: string
  lead_id: number | null
  name: string
  config_ref: string | null
  status: string
  service_type: string
  setup_fee_eur: number | null
  monthly_fee_eur: number | null
  maint_plan: string | null
  updated_at: string
  lead_estado: string | null
  contact: {
    id: number
    nombre: string | null
    email: string | null
    empresa: string | null
    telefono: string | null
  } | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const maintLabel = (plan: string | null) => {
  if (plan === 'connect') return 'Buffalo Connect (10%)'
  if (plan === 'cloud') return 'Buffalo Cloud (15%)'
  return '—'
}

const statusLabel: Record<string, string> = {
  development: 'En desarrollo',
  active: 'Activo',
  paused: 'Pausado',
  churned: 'Baja',
}

const serviceLabel: Record<string, string> = {
  voice_agent: 'Agente de Voz',
  text_agent: 'Agente de Chat',
  dashboard_app: 'Dashboard',
}

export default function RetencionPage() {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = !authLoading && user?.role === 'admin'
  const [rows, setRows] = useState<RetencionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    fetch('/api/retencion/proyectos')
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

  useEffect(() => { load() }, [])

  const pageTitle = isAdmin ? 'Retención · Buffalo con mensualidad' : 'Proyectos'

  return (
    <Layout>
      <div className="w-full space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 h-10 border border-border text-sm font-medium rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">{pageTitle}</h2>
            {!loading && (
              <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full">
                {rows.length}
              </span>
            )}
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Cargando...</div>
          ) : rows.length === 0 && !error ? (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-400">
                {isAdmin
                  ? 'No hay proyectos Buffalo en marcha con mensualidad.'
                  : 'No tienes proyectos asignados en retención.'}
              </p>
              {isAdmin && (
                <p className="text-xs text-gray-300 mt-1">
                  Criterio: es_buffalo + has_mensualidad + status development/active/paused.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="text-left font-medium text-gray-500 px-5 py-3">Cliente</th>
                    <th className="text-left font-medium text-gray-500 px-5 py-3">Proyecto</th>
                    {isAdmin && (
                      <>
                        <th className="text-left font-medium text-gray-500 px-5 py-3">Plan</th>
                        <th className="text-right font-medium text-gray-500 px-5 py-3">Setup</th>
                        <th className="text-right font-medium text-gray-500 px-5 py-3">Mensualidad</th>
                      </>
                    )}
                    <th className="text-left font-medium text-gray-500 px-5 py-3">Estado</th>
                    <th className="text-right font-medium text-gray-500 px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const clientName = row.contact?.nombre || row.contact?.email || row.name
                    return (
                      <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-medium text-gray-900">{clientName}</div>
                          {row.contact?.empresa && row.contact.empresa !== clientName && (
                            <div className="text-xs text-gray-400 mt-0.5">{row.contact.empresa}</div>
                          )}
                          {row.contact?.email && (
                            <div className="text-xs text-gray-400 mt-0.5">{row.contact.email}</div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-gray-900">{row.name}</div>
                          {row.config_ref && (
                            <div className="text-[11px] font-mono text-gray-400 mt-0.5">{row.config_ref}</div>
                          )}
                          <div className="text-xs text-gray-400 mt-0.5">
                            {serviceLabel[row.service_type] || row.service_type}
                          </div>
                        </td>
                        {isAdmin && (
                          <>
                            <td className="px-5 py-4">
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700">
                                {maintLabel(row.maint_plan)}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right font-medium text-gray-700 tabular-nums">
                              {row.setup_fee_eur != null ? fmt(row.setup_fee_eur) : '—'}
                            </td>
                            <td className="px-5 py-4 text-right font-semibold text-gray-900 tabular-nums">
                              {row.monthly_fee_eur != null ? (
                                <>{fmt(row.monthly_fee_eur)}<span className="text-xs font-normal text-gray-400">/mes</span></>
                              ) : '—'}
                            </td>
                          </>
                        )}
                        <td className="px-5 py-4">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-700">
                            {statusLabel[row.status] || row.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/retencion/proyectos/${row.id}`}
                            className="inline-flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-500 rounded-lg hover:border-gray-300 hover:text-gray-900 transition-colors"
                            title="Ver proyecto"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
