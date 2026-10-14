import type { NextApiRequest, NextApiResponse } from 'next'
import { acceptInbound, hashBody } from '@/lib/ingest/events'
import { findActiveVoiceDemoByPhone, findPrincipalActiveVoiceDemo } from '@/lib/demos/store'
import { normalizePhoneNumber } from '@/lib/demos/phone'
import { retellFromNumber } from '@/lib/ingest/whatsapp'

/**
 * POST /api/demos/webhook-voz
 * Webhook inbound de Retell AI: hay que responder YA con el agente.
 * El evento se guarda en la ingesta para reintentos/depuración, sin retrasar la respuesta.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const fromRaw = retellFromNumber(req.body)
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
      demo = await findPrincipalActiveVoiceDemo()
    }

    if (!demo) {
      return res.status(200).json({})
    }

    const payload = { override_agent_id: demo.retell_agent_id }
    res.status(200).json({ call_inbound: payload })

    void acceptInbound({
      source: 'retell',
      externalId: `retell:${hashBody(JSON.stringify(req.body ?? {}))}`,
      eventType: 'call_inbound',
      payload: req.body,
      mode: 'defer',
    }).catch((err) => console.warn('[demos/webhook-voz] ingest', err))

    return
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (process.env.NODE_ENV === 'development') console.error('[demos/webhook-voz]', err)
    return res.status(500).json({ error: msg })
  }
}
