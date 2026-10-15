/** Lado navegador de las notificaciones push (suscribir este dispositivo). */

export type PushClientState =
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

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration('/')) || navigator.serviceWorker.register('/sw.js')
}

/** Estado de los avisos en este dispositivo + clave pública VAPID si el servidor la tiene. */
export async function getPushState(): Promise<{ state: PushClientState; publicKey: string | null }> {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supported) {
    return { state: isIos() && !isStandalone() ? 'ios-install' : 'unsupported', publicKey: null }
  }
  let publicKey: string | null = null
  try {
    const res = await fetch('/api/push/subscription')
    const data = await res.json()
    if (!data.configured || !data.publicKey) return { state: 'not-configured', publicKey: null }
    publicKey = data.publicKey
  } catch {
    return { state: 'not-configured', publicKey: null }
  }
  if (Notification.permission === 'denied') return { state: 'denied', publicKey }
  const reg = await getRegistration()
  const sub = await reg.pushManager.getSubscription()
  return { state: sub ? 'on' : 'off', publicKey }
}

/**
 * Pide permiso y guarda la suscripción en el CRM.
 * En iPhone el permiso solo se puede pedir tras un toque, y con la app ya instalada.
 */
export async function enablePush(publicKey: string): Promise<PushClientState> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
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
  return 'on'
}

export async function disablePush(): Promise<void> {
  const reg = await getRegistration()
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await fetch('/api/push/subscription', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  await sub.unsubscribe()
}
