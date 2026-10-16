import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { useAuth } from '@/components/AuthContext'
import WatchReportActions from '@/components/retencion/WatchReportActions'
import type { WatchPublic, WatchRunPublic } from '@/lib/retencion/watch-store'
import { AlertCircle, ArrowLeft } from 'lucide-react'

function when(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

export default function WatchInformesPage() {
  const router = useRouter()
  const { loading: authLoading } = useAuth()
  const id = typeof router.query.id === 'string' ? router.query.id : ''
  const runQ = typeof router.query.run === 'string' ? router.query.run : ''
  const [watch, setWatch] = useState<WatchPublic | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/retencion/proyectos/${id}/watch`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setWatch(data.watch as WatchPublic)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (!authLoading && id) void load()
  }, [authLoading, id, load])

  const informes = useMemo(
    () => (watch?.runs || []).filter((r) => r.ok && r.report),
    [watch]
  )

  useEffect(() => {
    if (!informes.length) return
    if (runQ && informes.some((r) => r.id === runQ)) setSelectedId(runQ)
    else if (!selectedId) setSelectedId(informes[0].id)
  }, [informes, runQ, selectedId])

  const selected: WatchRunPublic | undefined = informes.find((r) => r.id === selectedId)

  const pick = (runId: string) => {
    setSelectedId(runId)
    void router.replace(
      { pathname: `/retencion/proyectos/${id}/informes`, query: { run: runId } },
      undefined,
      { shallow: true }
    )
  }

  return (
    <Layout>
      <div className="w-full space-y-4 pb-12">
        <div className="flex items-center gap-3">
          <Link
            href={`/retencion/proyectos/${id}?tab=sistema`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Volver al flujo"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Sistema</p>
            <h1 className="text-lg font-semibold text-gray-900">Informes</h1>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {loading && <p className="py-16 text-center text-sm text-gray-400">Cargando informes…</p>}

        {!loading && !informes.length && (
          <p className="rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
            Todavía no hay informes. En Sistema pulsa Ejecutar ahora o espera al cron.
          </p>
        )}

        {!loading && informes.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-2">
              {informes.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pick(r.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left ${
                    selectedId === r.id
                      ? 'border-gray-900 bg-white shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">
                    {r.trigger === 'cron' ? 'Cron' : 'Manual'}
                  </p>
                  <p className="text-xs text-gray-400">{when(r.finished_at || r.created_at)}</p>
                </button>
              ))}
            </aside>
            <article className="rounded-2xl border border-gray-200 bg-white p-5">
              {selected?.report ? (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-gray-500">
                      {selected.trigger === 'cron' ? 'Cron' : 'Manual'} ·{' '}
                      {when(selected.finished_at || selected.created_at)}
                    </p>
                    <WatchReportActions markdown={selected.report} title={`informe-${selected.id}`} />
                  </div>
                  <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800">
                    {selected.report}
                  </pre>
                </>
              ) : (
                <p className="text-sm text-gray-500">Elige un informe.</p>
              )}
            </article>
          </div>
        )}
      </div>
    </Layout>
  )
}
