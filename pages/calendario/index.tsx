import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Calendar, Link2Off, Loader2 } from 'lucide-react'

const GoogleCalendarBoard = dynamic(
  () => import('@/components/calendario/GoogleCalendarBoard'),
  {
    ssr: false,
    loading: () => (
      <div className="overflow-hidden rounded-[1.75rem] border border-gray-200/80 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="h-8 w-40 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-8 w-44 animate-pulse rounded-2xl bg-gray-100" />
        </div>
        <div className="grid grid-cols-7 gap-px bg-gray-100 p-px">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[72px] bg-white p-2">
              <div className="h-5 w-5 animate-pulse rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    ),
  }
)

type Status = {
  connected: boolean
  email: string | null
  needs_reauth: boolean
}

export default function CalendarioPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [banner, setBanner] = useState('')
  const [error, setError] = useState('')

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/integrations/google/status')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error de estado')
      setStatus({
        connected: Boolean(data.connected),
        email: data.email || null,
        needs_reauth: Boolean(data.needs_reauth),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      setStatus({ connected: false, email: null, needs_reauth: false })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (!router.isReady) return
    if (router.query.connected === '1') {
      setBanner('Conectado correctamente')
      void router.replace('/calendario', undefined, { shallow: true })
      void loadStatus()
    }
    if (typeof router.query.error === 'string' && router.query.error) {
      setError(router.query.error)
      void router.replace('/calendario', undefined, { shallow: true })
    }
  }, [router.isReady, router.query.connected, router.query.error, router, loadStatus])

  useEffect(() => {
    if (!banner) return
    const t = window.setTimeout(() => setBanner(''), 3200)
    return () => window.clearTimeout(t)
  }, [banner])

  const disconnect = async () => {
    if (!window.confirm('¿Desconectar Google Calendar?')) return
    setDisconnecting(true)
    setError('')
    try {
      const res = await fetch('/api/integrations/google/disconnect', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al desconectar')
      setBanner('Desconectado')
      await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setDisconnecting(false)
    }
  }

  const showCalendar = status?.connected && !status.needs_reauth

  return (
    <Layout>
      <div className="w-full max-w-6xl mx-auto space-y-4 pb-10 -mt-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gray-900 text-white shadow-sm">
              <Calendar className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
                Calendario
              </h1>
              {showCalendar && status?.email ? (
                <p className="truncate text-xs text-gray-500 mt-0.5">{status.email}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {loading ? (
              <span className="inline-flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-2 text-xs text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                …
              </span>
            ) : showCalendar ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void disconnect()}
                disabled={disconnecting}
                className="h-9 gap-2 rounded-2xl border-gray-200 text-xs font-semibold"
              >
                {disconnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2Off className="h-3.5 w-3.5" />
                )}
                Desconectar
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  window.location.href = '/api/integrations/google/connect'
                }}
                className="h-9 gap-2 rounded-2xl bg-gray-900 px-4 text-xs font-semibold hover:bg-gray-800"
              >
                <Calendar className="h-3.5 w-3.5" />
                Conectar Google
              </Button>
            )}
          </div>
        </div>

        {banner && (
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
            {banner}
          </div>
        )}

        {(error || status?.needs_reauth) && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="h-[18px] w-[18px] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-medium text-sm">
                {status?.needs_reauth ? 'Hay que volver a conectar Google' : error}
              </p>
              {status?.needs_reauth && (
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = '/api/integrations/google/connect'
                  }}
                  className="mt-2 inline-flex rounded-xl bg-amber-900/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900"
                >
                  Reconectar
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && !showCalendar && !status?.needs_reauth && (
          <div className="relative overflow-hidden rounded-[1.75rem] border border-dashed border-gray-200 bg-gradient-to-b from-white to-gray-50 px-6 py-20 text-center">
            <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-gray-900 text-white shadow-lg shadow-gray-900/15">
              <Calendar className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-gray-900">Conecta Google Calendar</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-gray-500">
              Mes, semana y día con tus eventos reales.
            </p>
            <Button
              type="button"
              onClick={() => {
                window.location.href = '/api/integrations/google/connect'
              }}
              className="mt-6 h-10 gap-2 rounded-2xl bg-gray-900 px-5 text-sm font-semibold hover:bg-gray-800"
            >
              Continuar con Google
            </Button>
          </div>
        )}

        {showCalendar && (
          <GoogleCalendarBoard
            onNeedsReauth={() => {
              setStatus((prev) =>
                prev
                  ? { ...prev, connected: false, needs_reauth: true }
                  : { connected: false, email: null, needs_reauth: true }
              )
            }}
          />
        )}
      </div>
    </Layout>
  )
}
