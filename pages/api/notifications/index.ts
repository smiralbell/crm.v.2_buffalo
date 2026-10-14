import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { listNotifications, markNotificationsRead, unreadCount } from '@/lib/notifications'

/**
 * GET  /api/notifications            → { items, unread }
 * POST /api/notifications { ids? }   → marca como leídas (todas si no hay ids)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }

  try {
    if (req.method === 'GET') {
      const [items, unread] = await Promise.all([listNotifications(user.id), unreadCount(user.id)])
      return res.status(200).json({ items, unread })
    }
    if (req.method === 'POST') {
      const ids = Array.isArray(req.body?.ids)
        ? (req.body.ids as unknown[]).map(String).filter((s) => /^\d+$/.test(s))
        : undefined
      const updated = await markNotificationsRead(user.id, ids)
      return res.status(200).json({ ok: true, updated })
    }
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Tabla aún sin crear (migraciones pendientes): la campana simplemente sale vacía
    if (msg.includes('notifications') && msg.includes('does not exist')) {
      return res.status(200).json({ items: [], unread: 0 })
    }
    return res.status(500).json({ error: msg })
  }
}
