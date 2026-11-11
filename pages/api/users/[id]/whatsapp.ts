import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminAPI } from '@/lib/auth'
import { findCrmUserById } from '@/lib/crm-users'
import {
  PhoneTakenError,
  getUserWhatsAppPhone,
  isTeamRole,
  setUserWhatsAppPhone,
} from '@/lib/team-agent/identity'
import { isWhatsAppAgentEnabled } from '@/lib/whatsapp-agent/config'

/** Solo admin: móvil con el que un developer / PM habla con el agente de WhatsApp. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
  } catch {
    return
  }
  const id = parseInt(String(req.query.id), 10)
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' })

  try {
    const user = await findCrmUserById(id)
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    if (req.method === 'GET') {
      return res.status(200).json({
        phone: await getUserWhatsAppPhone(id),
        role_allowed: isTeamRole(user.role),
        active: user.active,
        agent_enabled: isWhatsAppAgentEnabled(),
      })
    }

    if (req.method === 'PUT') {
      if (!isTeamRole(user.role)) {
        return res.status(400).json({ error: 'Solo developers y project managers pueden usar el agente del equipo' })
      }
      try {
        const phone = await setUserWhatsAppPhone(id, (req.body || {}).phone)
        return res.status(200).json({ phone })
      } catch (e) {
        if (e instanceof PhoneTakenError) {
          return res.status(409).json({ error: `Ese móvil ya lo tiene ${e.takenBy}` })
        }
        return res.status(400).json({ error: e instanceof Error ? e.message : 'Móvil no válido' })
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[users/[id]/whatsapp]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
