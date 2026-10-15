import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import {
  deletePushSubscription,
  isPushConfigured,
  savePushSubscription,
  vapidPublicKey,
} from '@/lib/push'

/** GET: clave pública VAPID · POST: guardar suscripción del móvil · DELETE: quitarla. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method === 'GET') {
    return res.status(200).json({ configured: isPushConfigured(), publicKey: vapidPublicKey() })
  }

  const sub = req.body?.subscription ?? req.body
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint.trim() : ''
  if (!/^https:\/\//i.test(endpoint)) {
    return res.status(400).json({ error: 'Suscripción no válida' })
  }

  try {
    if (req.method === 'POST') {
      const p256dh = String(sub?.keys?.p256dh || '')
      const auth = String(sub?.keys?.auth || '')
      if (!p256dh || !auth) return res.status(400).json({ error: 'Faltan claves de la suscripción' })
      await savePushSubscription(user, { endpoint, keys: { p256dh, auth } }, req.headers['user-agent'])
      return res.status(200).json({ ok: true })
    }
    if (req.method === 'DELETE') {
      await deletePushSubscription(endpoint)
      return res.status(200).json({ ok: true })
    }
  } catch (e) {
    console.error('[push] subscription', e)
    return res.status(500).json({ error: 'No se pudo guardar la suscripción' })
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
