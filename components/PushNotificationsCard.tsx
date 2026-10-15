import { useCallback, useEffect, useState } from 'react'
import { BellRing, BellOff, Send, Smartphone } from 'lucide-react'

type State =
  | 'loading'
  | 'unsupported'
  | 'ios-install'
  | 'not-configured'
  | 'denied'
  | 'off'
  | 'on'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration('/')) || navigator.serviceWorker.register('/sw.js')
}

/** Activa / desactiva los avisos push del CRM en este dispositivo. */
export default function PushNotificationsCard() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [publicKey, setPublicKey] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (!supported) {
      setState(isIos() && !isStandalone() ? 'ios-install' : 'unsupported')
      return
    }
    try {
      const res = await fetch('/api/push/subscription')
      const data = await res.json()
      if (!data.configured || !data.publicKey) {
        setState('not-configured')
        return
      }
      setPublicKey(data.publicKey)
    } catch {
      setState('not-configured')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    const reg = await getRegistration()
    const sub = await reg.pushManager.getSubscription()
    setState(sub ? 'on' : 'off')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function enable() {
    if (!publicKey) return
    setBusy(true)
    setMessage(null)
    try {
      // En iPhone el permiso solo se puede pedir tras un toque, y con la app ya instalada.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return
      }
      const reg = await getRegistration()
      await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }))
      const res = await fetch('/api/push/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Error al guardar')
      setState('on')
      setMessage('Listo. Te llegarán los avisos del CRM a este dispositivo.')
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
      const reg = await getRegistration()
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
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
