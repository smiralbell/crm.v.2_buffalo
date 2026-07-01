import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { readFormSessionCookie, verifyFormSession } from '@/lib/demos/form-access'
import {
  launchOutboundCall,
  outboundErrorHint,
  outboundErrorMessage,
  recordFailedOutboundCall,
} from '@/lib/demos/launch-outbound-call'
import { demoRowToListItem, getDemoByPublicToken } from '@/lib/demos/public-form-store'

const bodySchema = z.object({
  variables: z.record(z.string()),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const token = req.query.token as string
  if (!token) return res.status(400).json({ error: 'Token inválido' })

  const demoRow = await getDemoByPublicToken(token)
  if (!demoRow) return res.status(404).json({ error: 'Formulario no encontrado' })

  const cookie = readFormSessionCookie(req.headers.cookie)
  const demoId = verifyFormSession(cookie, token)
  if (demoId !== demoRow.demo_id) {
    return res.status(401).json({ error: 'Acceso no autorizado. Introduce la contraseña.' })
  }

  try {
    const { variables } = bodySchema.parse(req.body)
    const demo = demoRowToListItem(demoRow)
    const result = await launchOutboundCall(demo, variables)

    return res.status(200).json({
      ok: true,
      call_id: result.call_id,
      call_status: result.call_status,
      numero_destino: result.numero_destino,
    })
  } catch (err) {
    await recordFailedOutboundCall(demoRow.demo_id, req.body?.variables ?? {}, err)

    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos' })
    }

    console.error('[formulario/llamar POST]', err)
    return res.status(500).json({
      error: outboundErrorMessage(err),
      hint: outboundErrorHint(err),
    })
  }
}
