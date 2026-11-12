import type { NextApiRequest, NextApiResponse } from 'next'
import {
  insertWebFormSubmission,
  webFormBearerMatches,
  webFormWebhookToken,
} from '@/lib/marketing/web-form-submissions'
import { applyWebFormCors, originHost } from '@/lib/marketing/web-form-cors'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { opsLink, sendOpsAlert } from '@/lib/ops-alerts'

export const config = {
  api: { bodyParser: { sizeLimit: '200kb' } },
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * POST /api/webhooks/webform
 * Un webhook para todas las webs Buffalo. Sin n8n.
 *   { site: "agenciabuffalo.es", page: "/contacto", form: { nombre, email, … } }
 *   (también acepta el formato plano de los formularios de la web).
 *
 * Autenticación (una de las dos):
 *   - Authorization: Bearer <WEBFORM_WEBHOOK_TOKEN>  (servidores, scripts)
 *   - Navegador desde un dominio autorizado (Origin) — CORS + límite por IP.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const corsOk = applyWebFormCors(req, res)

  if (req.method === 'OPTIONS') {
    // Preflight del navegador (Content-Type: application/json).
    return res.status(corsOk ? 204 : 403).end()
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'webform-webhook',
      auth: 'Authorization: Bearer <WEBFORM_WEBHOOK_TOKEN> o Origin de un dominio autorizado',
      example: {
        site: 'agenciabuffalo.es',
        page: '/contacto',
        form: {
          nombre: 'Ana López',
          email: 'ana@empresa.com',
          telefono: '+34600000000',
          empresa: 'Empresa',
          mensaje: 'Quiero una demo',
          tipo: 'Agente de llamadas',
        },
      },
    })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!webFormWebhookToken()) {
    return res.status(503).json({ error: 'Configura WEBFORM_WEBHOOK_TOKEN o INGEST_TOKEN' })
  }

  const hasBearer = /^Bearer\s+\S+/i.test(req.headers.authorization || '')
  if (hasBearer) {
    if (!webFormBearerMatches(req)) return res.status(401).json({ error: 'Unauthorized' })
  } else {
    if (!corsOk) return res.status(401).json({ error: 'Unauthorized' })
    const rl = checkRateLimit(`webform:${getClientIP(req)}`, 10, 60_000)
    if (!rl.allowed) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo en un minuto.' })
    }
  }

  try {
    // Si el formulario no dice de qué web viene, lo sacamos del Origin.
    let body: unknown = req.body
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const b = { ...(body as Record<string, unknown>) }
      const host = originHost(req.headers.origin)
      if (host && !b.site && !b.page_url && !b.page && !b.url) b.site = host
      body = b
    }

    const submission = await insertWebFormSubmission(body)

    // Aviso interno (email + Telegram + push). Nunca debe romper el envío.
    void (async () => {
      try {
        const who = submission.fullname || submission.email || 'Sin nombre'
        const lines = [
          `Nuevo formulario web: ${who}`,
          submission.company ? `Empresa: ${submission.company}` : '',
          submission.email ? `Email: ${submission.email}` : '',
          submission.phone ? `Teléfono: ${submission.phone}` : '',
          submission.service ? `Interés: ${submission.service}` : '',
          `Origen: ${submission.source || submission.site || '—'}${submission.page ? ` (${submission.page})` : ''}`,
          opsLink('/marketing'),
        ].filter(Boolean)
        await sendOpsAlert({
          subject: `Nuevo lead web: ${who}`,
          text: lines.join('\n'),
          telegramHtml: lines.map(escHtml).join('\n'),
          url: '/marketing',
        })
      } catch (e) {
        console.warn('[webhooks/webform] aviso', e)
      }
    })()

    return res.status(201).json({
      ok: true,
      id: submission.id,
      site: submission.site,
      page: submission.page,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (msg.includes('vacío')) return res.status(400).json({ error: msg })
    console.error('[webhooks/webform]', err)
    return res.status(500).json({ error: msg })
  }
}
