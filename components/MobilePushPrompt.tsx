import { useEffect, useState } from 'react'
import { BellRing, Share, X } from 'lucide-react'
import { useAuth } from '@/components/AuthContext'
import { enablePush, getPushState, type PushClientState } from '@/lib/push-client'

const DISMISS_KEY = 'crm-push-prompt-dismissed-at'
/** Si lo cierras, vuelve a salir a los 3 días (hasta que estén activadas). */
const DISMISS_MS = 3 * 24 * 60 * 60 * 1000

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0)
    return at > 0 && Date.now() - at < DISMISS_MS
  } catch {
    return false
  }
}

/**
 * Solo móvil: invita a activar los avisos en este dispositivo (o a instalar la app en iPhone,
 * que es requisito para recibirlos). Se oculta solo cuando ya están activados.
 */
export default function MobilePushPrompt() {
  const { user } = useAuth()
  const [state, setState] = useState<PushClientState | null>(null)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    // Los avisos automáticos van a los admins.
    if (user?.role !== 'admin') return
    if (!window.matchMedia('(max-width: 767px)').matches || dismissedRecently()) return
    let cancelled = false
    void getPushState()
      .then((res) => {
        if (cancelled) return
        setState(res.state)
        setPublicKey(res.publicKey)
        setHidden(false)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user?.role])

  if (hidden || !state || !['off', 'ios-install', 'denied'].includes(state)) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {}
    setHidden(true)
  }

  const activate = async () => {
    if (!publicKey) return
    setBusy(true)
    setError(null)
    try {
      const next = await enablePush(publicKey)
      setState(next)
      if (next === 'on') setHidden(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron activar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm md:hidden">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
          <BellRing className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          {state === 'ios-install' ? (
            <>
              <p className="text-sm font-semibold text-gray-900">Instala la app para recibir avisos</p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                En Safari toca <Share className="inline h-3.5 w-3.5 -mt-0.5" /> <b>Compartir</b> →{' '}
                <b>Añadir a pantalla de inicio</b> y ábrela desde el icono.
              </p>
            </>
          ) : state === 'denied' ? (
            <>
              <p className="text-sm font-semibold text-gray-900">Los avisos están bloqueados</p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                Actívalos en Ajustes → Notificaciones → Buffalo y vuelve a abrir la app.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-900">Recibe los avisos en este móvil</p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                Leads nuevos, tickets, incidencias y recordatorios, como notificación.
              </p>
              <button
                type="button"
                onClick={activate}
                disabled={busy}
                className="mt-2.5 inline-flex h-9 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white active:bg-gray-700 disabled:opacity-60"
              >
                {busy ? 'Activando…' : 'Activar notificaciones'}
              </button>
            </>
          )}
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Ahora no"
          className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
