import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { isPushConfigured, sendPush } from '@/lib/push'

/** Manda una notificación de prueba a los móviles del usuario que la pide. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  if (!isPushConfigured()) return res.status(503).json({ error: 'Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY' })

  const result = await sendPush(
    { title: 'Buffalo CRM', body: 'Las notificaciones funcionan en este dispositivo.', url: '/alertas', tag: 'push-test' },
    { emails: [user.email] }
  )
  return res.status(200).json({ ok: true, ...result })
}
