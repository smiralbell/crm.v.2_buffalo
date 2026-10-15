import { useCallback, useEffect, useState } from 'react'
import { BellRing, BellOff, Send, Smartphone } from 'lucide-react'
import { disablePush, enablePush, getPushState, type PushClientState } from '@/lib/push-client'

type State = 'loading' | PushClientState

/** Activa / desactiva los avisos push del CRM en este dispositivo. */
export default function PushNotificationsCard() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [publicKey, setPublicKey] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await getPushState()
    setPublicKey(res.publicKey)
    setState(res.state)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function enable() {
    if (!publicKey) return
    setBusy(true)
    setMessage(null)
    try {
      const next = await enablePush(publicKey)
      setState(next)
      if (next === 'on') setMessage('Listo. Te llegarán los avisos del CRM a este dispositivo.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudieron activar')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    setMessage(null)
    try {
      await disablePush()
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setMessage(data.sent > 0 ? 'Prueba enviada.' : 'No hay ningún dispositivo tuyo suscrito.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error al enviar la prueba')
    } finally {
      setBusy(false)
    }
  }

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50'

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
          {state === 'on' ? <BellRing className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Avisos en el móvil</p>
            <p className="text-xs text-muted-foreground">
              Leads de Meta, tickets, incidencias, recordatorios y objetivo anual, como notificación del móvil.
            </p>
          </div>

          {state === 'loading' && <p className="text-xs text-muted-foreground">Comprobando…</p>}

          {state === 'ios-install' && (
            <p className="text-xs text-foreground">
              En iPhone primero instala la app: en Safari toca <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>,
              ábrela desde el icono y vuelve a esta pantalla para activar los avisos.
            </p>
          )}

          {state === 'unsupported' && (
            <p className="text-xs text-muted-foreground">Este navegador no admite notificaciones push.</p>
          )}

          {state === 'not-configured' && (
            <p className="text-xs text-muted-foreground">
              Falta configurar VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en el servidor.
            </p>
          )}

          {state === 'denied' && (
            <p className="text-xs text-foreground">
              Las notificaciones están bloqueadas para el CRM. Actívalas en los ajustes del móvil (Notificaciones →
              Buffalo) o del navegador, y recarga.
            </p>
          )}

          {state === 'off' && (
            <button type="button" className={btn} onClick={enable} disabled={busy}>
              <BellRing className="h-3.5 w-3.5" />
              Activar notificaciones
            </button>
          )}

          {state === 'on' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-emerald-700">Activadas en este dispositivo</span>
              <button type="button" className={btn} onClick={test} disabled={busy}>
                <Send className="h-3.5 w-3.5" />
                Enviar prueba
              </button>
              <button type="button" className={btn} onClick={disable} disabled={busy}>
                <BellOff className="h-3.5 w-3.5" />
                Desactivar
              </button>
            </div>
          )}

          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </div>
      </div>
    </div>
  )
}
