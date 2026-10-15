/* Service worker de Buffalo CRM: solo recibe notificaciones push (sin caché offline). */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Buffalo CRM', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Buffalo CRM'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/brand/icon-192.png',
      badge: '/brand/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/dashboard' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }
      await self.clients.openWindow(target)
    })()
  )
})
