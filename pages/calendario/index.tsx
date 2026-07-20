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
      <div className="rounded-2xl border border-gray-200 bg-white py-20 text-center text-sm text-gray-400">
        Cargando calendario…
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
      setBanner('Google Calendar conectado correctamente.')
      void router.replace('/calendario', undefined, { shallow: true })
      void loadStatus()
    }
    if (typeof router.query.error === 'string' && router.query.error) {
      setError(router.query.error)
      void router.replace('/calendario', undefined, { shallow: true })
    }
  }, [router.isReady, router.query.connected, router.query.error, router, loadStatus])

  const disconnect = async () => {
    if (!window.confirm('¿Desconectar Google Calendar de este usuario?')) return
    setDisconnecting(true)
    setError('')
    try {
      const res = await fetch('/api/integrations/google/disconnect', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al desconectar')
      setBanner('Google Calendar desconectado.')
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
      <div className="w-full max-w-6xl mx-auto space-y-5 pb-12 -mt-1">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              <Calendar className="h-3.5 w-3.5" />
              Integraciones
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Calendario</h1>
            <p className="mt-1 text-sm text-gray-500">
              Eventos del calendario principal de Google (zona Europe/Madrid).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {loading ? (
              <span className="inline-flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Comprobando…
              </span>
            ) : showCalendar ? (
              <>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  Conectado como{' '}
                  <span className="font-semibold">{status?.email || 'cuenta Google'}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void disconnect()}
                  disabled={disconnecting}
                  className="gap-2"
                >
                  {disconnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2Off className="h-4 w-4" />
                  )}
                  Desconectar Google
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  window.location.href = '/api/integrations/google/connect'
                }}
                className="gap-2 bg-gray-900 hover:bg-gray-800"
              >
                <Calendar className="h-4 w-4" />
                Conectar Google Calendar
              </Button>
            )}
          </div>
        </div>

        {banner && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {banner}
          </div>
        )}

        {(error || status?.needs_reauth) && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                {status?.needs_reauth ? 'Reconexión necesaria' : error}
              </p>
              {status?.needs_reauth && (
                <p className="text-xs mt-1 text-amber-800/80">
                  El refresh token ya no es válido. Vuelve a conectar Google Calendar.
                </p>
              )}
              {status?.needs_reauth && (
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = '/api/integrations/google/connect'
                  }}
                  className="inline-flex mt-3 text-xs font-semibold underline"
                >
                  Reconectar Google Calendar
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && !showCalendar && !status?.needs_reauth && (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16 text-center px-6">
            <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900">Google Calendar no conectado</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Conecta tu cuenta para ver mes, semana y día con eventos reales (incluidos
              recurrentes y de día completo).
            </p>
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
