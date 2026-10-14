import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAdminAPI } from '@/lib/auth'
import { query } from '@/lib/db'
import { toE164 } from '@/lib/identity/normalize'

/**
 * GET/PATCH /api/users/[id]/whatsapp
 * Número de WhatsApp del usuario y si recibe avisos urgentes y el briefing diario.
 */
const patchSchema = z.object({
  whatsapp_phone: z.string().max(40).nullable().optional(),
  notify_whatsapp: z.boolean().optional(),
  briefing_whatsapp: z.boolean().optional(),
})

type Row = { whatsapp_phone: string | null; notify_whatsapp: boolean; briefing_whatsapp: boolean }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
  } catch {
    return
  }
  const id = parseInt(String(req.query.id), 10)
  if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' })

  try {
    if (req.method === 'GET') {
      const { rows } = await query<Row>(
        `SELECT whatsapp_phone, COALESCE(notify_whatsapp, FALSE) AS notify_whatsapp,
                COALESCE(briefing_whatsapp, FALSE) AS briefing_whatsapp
           FROM crm_users WHERE id = $1`,
        [id]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' })
      return res.status(200).json(rows[0])
    }

    if (req.method === 'PATCH') {
      const data = patchSchema.parse(req.body)
      let phone: string | null | undefined = undefined
      if (data.whatsapp_phone !== undefined) {
        const raw = data.whatsapp_phone?.trim() || ''
        phone = raw ? toE164(raw) : null
        if (raw && !phone) return res.status(400).json({ error: 'Teléfono no válido' })
      }
      const { rows } = await query<Row>(
        `UPDATE crm_users
            SET whatsapp_phone = CASE WHEN $2::boolean THEN $3 ELSE whatsapp_phone END,
                notify_whatsapp = COALESCE($4, notify_whatsapp),
                briefing_whatsapp = COALESCE($5, briefing_whatsapp),
                updated_at = NOW()
          WHERE id = $1
          RETURNING whatsapp_phone, notify_whatsapp, briefing_whatsapp`,
        [id, phone !== undefined, phone ?? null, data.notify_whatsapp ?? null, data.briefing_whatsapp ?? null]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' })
      return res.status(200).json(rows[0])
    }

    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0]?.message || 'Datos inválidos' })
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('whatsapp_phone') && msg.includes('does not exist')) {
      return res.status(503).json({ error: 'Faltan migraciones: ejecuta npm run db:migrate' })
    }
    return res.status(500).json({ error: msg })
  }
}
