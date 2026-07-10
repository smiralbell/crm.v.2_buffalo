import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyCallOutcome } from '@/lib/coldcall/call-outcomes'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)

    if (req.method === 'POST') {
      const { prospect_id, duracion, resultado, notas, whatsapp_enviado, email_enviado, reunion_fecha } =
        req.body

      if (!prospect_id || !resultado) {
        return res.status(400).json({ error: 'prospect_id y resultado son obligatorios' })
      }

      const prospectId = parseInt(prospect_id, 10)
      const retryAt =
        reunion_fecha && (resultado === 'reunion_agendada' || resultado === 'llamar_tarde')
          ? new Date(reunion_fecha)
          : null

      const call = await prisma.coldCallCall.create({
        data: {
          prospect_id: prospectId,
          duracion: duracion ? parseInt(duracion, 10) : null,
          resultado,
          notas,
          whatsapp_enviado: !!whatsapp_enviado,
          email_enviado: !!email_enviado,
          reunion_fecha: retryAt,
        },
      })

      await applyCallOutcome({
        prospectId,
        outcome: resultado,
        notas,
        userId: user.id,
        retryAt,
      })

      return res.status(201).json(call)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch {
    return
  }
}
