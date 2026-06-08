import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/webhooks/instantly
 * Recibe webhooks de Instantly (Email Outreach)
 * Requiere Bearer token en header Authorization
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verificar token
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '')
  const expectedToken = process.env.INSTANTLY_WEBHOOK_TOKEN || 'buf-instantly-2026'

  if (token !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const payload = req.body

  try {
    // Intentar crear la tabla si no existe
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "instantly_webhooks" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "event_type" VARCHAR(255),
        "email" VARCHAR(255),
        "campaign_id" VARCHAR(255),
        "campaign_name" VARCHAR(255),
        "payload" JSONB,
        "status" VARCHAR(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Extraer datos del payload
    const eventType = payload.type || payload.event_type || 'unknown'
    const email = payload.email || payload.recipient || null
    const campaignId = payload.campaign_id || payload.campaign || null
    const campaignName = payload.campaign_name || null
    const status = payload.status || payload.state || null

    // Guardar webhook
    await prisma.$executeRawUnsafe(
      `INSERT INTO "instantly_webhooks" ("event_type", "email", "campaign_id", "campaign_name", "payload", "status")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      eventType,
      email,
      campaignId,
      campaignName,
      JSON.stringify(payload),
      status
    )

    console.log(`[Instantly] ${eventType} | ${email}`)

    return res.status(200).json({ ok: true, event: eventType, email })

  } catch (err: unknown) {
    console.error('Webhook error:', err)
    const msg = err instanceof Error ? err.message : 'Error'
    return res.status(500).json({ error: msg })
  }
}
