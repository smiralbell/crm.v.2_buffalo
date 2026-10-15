import type { NextApiRequest, NextApiResponse } from 'next'
import { isPushConfigured, sendPush } from '@/lib/push'

/**
 * Para n8n u otros sistemas: POST con `Authorization: Bearer <PUSH_WEBHOOK_SECRET>`
 * (o CRON_SECRET si no hay uno propio).
 * Body: { title, body?, url?, tag?, emails?: string[] } — sin emails llega a los admins.
 */
function expectedSecret(): string | null {
  return process.env.PUSH_WEBHOOK_SECRET?.trim() || process.env.CRON_SECRET?.trim() || null
}

function authorize(req: NextApiRequest, expected: string): boolean {
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret.trim() : ''
  const provided = bearer || querySecret
  return provided.length > 0 && provided === expected
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const expected = expectedSecret()
  if (!expected) return res.status(503).json({ error: 'PUSH_WEBHOOK_SECRET no configurado' })
  if (!authorize(req, expected)) return res.status(401).json({ error: 'No autorizado' })
  if (!isPushConfigured()) return res.status(503).json({ error: 'Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY' })

  const b = req.body || {}
  const title = typeof b.title === 'string' ? b.title.trim() : ''
  if (!title) return res.status(400).json({ error: 'Falta title' })
  const emails = Array.isArray(b.emails) ? b.emails.filter((e: unknown) => typeof e === 'string') : undefined

  const result = await sendPush(
    {
      title,
      body: typeof b.body === 'string' ? b.body : undefined,
      url: typeof b.url === 'string' ? b.url : undefined,
      tag: typeof b.tag === 'string' ? b.tag : undefined,
    },
    { emails }
  )
  return res.status(200).json({ ok: true, ...result })
}
