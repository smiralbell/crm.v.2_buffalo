import type { NextApiRequest, NextApiResponse } from 'next'
import { findActiveVoiceDemoByPhone } from '@/lib/demos/store'
import { normalizePhoneNumber } from '@/lib/demos/phone'

function extractFromNumber(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const root = body as Record<string, unknown>

  const inbound = root.call_inbound
  if (inbound && typeof inbound === 'object') {
    const from = (inbound as Record<string, unknown>).from_number
    if (typeof from === 'string' && from.trim()) return from.trim()
  }

  if (typeof root.from_number === 'string' && root.from_number.trim()) {
    return root.from_number.trim()
  }

  return null
}

/**
 * POST /api/demos/webhook-voz
 * Webhook inbound de Retell AI para enrutar llamadas a la demo correcta.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const fromRaw = extractFromNumber(req.body)
    if (!fromRaw) {
      return res.status(200).json({})
    }

    let phone = normalizePhoneNumber(fromRaw)
    if (!phone) phone = fromRaw

    let demo = await findActiveVoiceDemoByPhone(phone)

    if (!demo && phone.startsWith('+34')) {
      demo = await findActiveVoiceDemoByPhone(`+${phone.slice(3)}`)
    }
    if (!demo) {
      const digits = phone.replace(/\D/g, '')
      if (digits.length === 9 && /^[67]/.test(digits)) {
        demo = await findActiveVoiceDemoByPhone(`+34${digits}`)
      }
    }

    if (!demo) {
      return res.status(200).json({})
    }

    return res.status(200).json({
      call_inbound: {
        override_agent_id: demo.retell_agent_id,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (process.env.NODE_ENV === 'development') console.error('[demos/webhook-voz]', err)
    return res.status(500).json({ error: msg })
  }
}
