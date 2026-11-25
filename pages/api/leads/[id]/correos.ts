import type { NextApiRequest, NextApiResponse } from 'next'
import { importLeadEmailHistory } from '@/lib/integrations/google/gmail-sync'
import {
  addExtraEmail,
  lastEmailImport,
  listExtraEmails,
  markEmailImport,
  normalizeEmail,
  removeExtraEmail,
} from '@/lib/leads/lead-extras'
import { isSessionError, requireLeadPage } from '@/lib/leads/lead-api-guard'

/**
 * Correos del lead.
 * GET: correos adicionales y la última importación del historial.
 * POST { email }: añade un correo adicional y trae su historial de Gmail.
 * POST { importar: true }: trae todo el historial de Gmail (correo principal y adicionales).
 * DELETE { email }: quita un correo adicional.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireLeadPage(req, res)
    if (!ctx) return
    const { leadId, user } = ctx

    if (req.method === 'GET') {
      const [emails, imported] = await Promise.all([listExtraEmails(leadId), lastEmailImport(leadId)])
      return res.json({ emails, last_import: imported })
    }

    if (req.method === 'POST') {
      const body = (req.body || {}) as { email?: string; importar?: boolean }
      if (body.email !== undefined) {
        const email = normalizeEmail(String(body.email))
        if (!email) return res.status(400).json({ error: 'Correo no válido' })
        await addExtraEmail(leadId, email, user.email ?? user.name ?? null)
      } else if (!body.importar) {
        return res.status(400).json({ error: 'Falta el correo' })
      }
      const r = await importLeadEmailHistory(leadId)
      await markEmailImport(leadId, r.inserted)
      const [emails, imported] = await Promise.all([listExtraEmails(leadId), lastEmailImport(leadId)])
      return res.json({ emails, last_import: imported, result: r })
    }

    if (req.method === 'DELETE') {
      const email = normalizeEmail(String((req.body || {}).email ?? req.query.email ?? ''))
      if (!email) return res.status(400).json({ error: 'Correo no válido' })
      await removeExtraEmail(leadId, email)
      return res.json({ emails: await listExtraEmails(leadId) })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (isSessionError(error)) return
    console.error('[leads/correos]', error)
    return res.status(500).json({ error: 'No se pudieron gestionar los correos' })
  }
}
