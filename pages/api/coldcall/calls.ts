import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyCallOutcome } from '@/lib/coldcall/call-outcomes'
import { parseReunionDatetimeInput } from '@/lib/coldcall/meeting-datetime'
import { assertProspectAccess, getColdCallScope } from '@/lib/coldcall/scope'
import { resolveCrmUserFkId } from '@/lib/crm-users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const scope = await getColdCallScope(user)

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
          ? parseReunionDatetimeInput(reunion_fecha)
          : null

      if (resultado === 'reunion_agendada' && !retryAt) {
        return res.status(400).json({
          error: 'Falta la fecha de la reunión. Indica día y hora o agenda en Cal.com.',
        })
      }

      if (resultado === 'llamar_tarde' && !retryAt) {
        return res.status(400).json({
          error: 'Indica cuándo volver a llamar.',
        })
      }

      const createdById = await resolveCrmUserFkId(user.id)

      let callId: number
      try {
        const rows = await prisma.$queryRaw<{ id: number }[]>`
          INSERT INTO coldcall_calls (
            prospect_id, duracion, resultado, notas, whatsapp_enviado, email_enviado, reunion_fecha, created_by_user_id
          )
          VALUES (
            ${prospectId},
            ${duracion ? parseInt(duracion, 10) : null},
            ${resultado},
            ${notas ?? null},
            ${!!whatsapp_enviado},
            ${!!email_enviado},
            ${retryAt},
            ${createdById}
          )
          RETURNING id
        `
        callId = rows[0].id
      } catch {
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
        callId = call.id
      }

      const call = { id: callId }

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
