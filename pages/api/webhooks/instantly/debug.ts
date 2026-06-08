import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/webhooks/instantly/debug
 * Endpoint de debug SIN autenticación - captura TODO
 * Para debuggear qué llega realmente de Instantly
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const payload = req.body
  const headers = req.headers

  try {
    // Crear tabla si no existe
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "instantly_webhooks_debug" (
        "id" SERIAL NOT NULL PRIMARY KEY,
        "payload" JSONB,
        "headers" JSONB,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Guardar TODO
    await prisma.$executeRawUnsafe(
      `INSERT INTO "instantly_webhooks_debug" ("payload", "headers") VALUES ($1::jsonb, $2::jsonb)`,
      JSON.stringify(payload),
      JSON.stringify(headers)
    )

    // Loguear a console para ver en tiempo real
    console.log('📧 WEBHOOK RECIBIDO:')
    console.log('Payload:', JSON.stringify(payload, null, 2))
    console.log('Headers:', JSON.stringify(headers, null, 2))

    return res.status(200).json({ ok: true, received: true })

  } catch (err: unknown) {
    console.error('Debug webhook error:', err)
    return res.status(500).json({ error: String(err) })
  }
}
