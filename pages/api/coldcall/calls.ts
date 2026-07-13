import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyCallOutcome } from '@/lib/coldcall/call-outcomes'
import { assertProspectAccess, getColdCallScope } from '@/lib/coldcall/scope'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const scope = getColdCallScope(user)

    if (req.method === 'POST') {
      const { prospect_id, duracion, resultado, notas, whatsapp_enviado, email_enviado, reunion_fecha } =
        req.body

      if (!prospect_id || !resultado) {
        return res.status(400).json({ error: 'prospect_id y resultado son obligatorios' })
      }

      const prospectId = parseInt(prospect_id, 10)
      if (Number.isNaN(prospectId)) {
        return res.status(400).json({ error: 'prospect_id inválido' })
      }

      try {
        await assertProspectAccess(scope, prospectId)
      } catch {
        return res.status(403).json({ error: 'Acceso denegado' })
      }

      const retryAt =
        reunion_fecha &&
        ['reunion_agendada', 'llamar_tarde'].includes(resultado)
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
