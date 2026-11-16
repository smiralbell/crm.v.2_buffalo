import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { ensureRecurringInvoiceColumns } from '@/lib/invoices/recurring'
import { getRecurringEmailState, updateRecurringEmailSettings } from '@/lib/invoices/recurring-email'
import { normalizeSendTime, parseEmailList } from '@/lib/invoices/recurring-email-template'

/**
 * GET   /api/invoices/recurring/[id]/email → configuración del envío + historial
 * PATCH /api/invoices/recurring/[id]/email → guardar configuración
 */

const optionalText = z
  .string()
  .max(5000)
  .nullable()
  .optional()
  .transform((v) => (v == null ? v : v.trim() || null))

const patchSchema = z.object({
  email_enabled: z.boolean().optional(),
  email_to: optionalText,
  email_cc: optionalText,
  email_reply_to: optionalText,
  email_subject: optionalText,
  email_body: optionalText,
  email_send_day: z.number().int().min(1).max(31).nullable().optional(),
  email_send_time: z.string().nullable().optional(),
})

function badEmails(label: string, raw: string | null | undefined): string | null {
  const { invalid } = parseEmailList(raw)
  return invalid.length ? `${label}: «${invalid[0]}» no es un email válido` : null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  if (user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' })

  const id = req.query.id
  if (typeof id !== 'string' || !id) return res.status(400).json({ error: 'ID inválido' })

  try {
    await ensureRecurringInvoiceColumns()

    if (req.method === 'PATCH') {
      const parsed = patchSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Datos inválidos' })
      const data = parsed.data

      const problem =
        badEmails('Para', data.email_to) ||
        badEmails('CC', data.email_cc) ||
        badEmails('Responder a', data.email_reply_to)
      if (problem) return res.status(400).json({ error: problem })

      let sendTime: string | null | undefined = undefined
      if (data.email_send_time !== undefined) {
        sendTime = data.email_send_time ? normalizeSendTime(data.email_send_time) : null
        if (data.email_send_time && !sendTime) return res.status(400).json({ error: 'La hora tiene que ser HH:MM' })
      }

      if (data.email_enabled) {
        const current = await getRecurringEmailState(id)
        if (!current) return res.status(404).json({ error: 'Factura recurrente no encontrada' })
        const to = data.email_to !== undefined ? data.email_to : current.settings.email_to
        if (!parseEmailList(to || current.client_email).emails.length) {
          return res.status(400).json({ error: 'Para activar el envío falta un email: escríbelo en «Para» o en el cliente' })
        }
      }

      const ok = await updateRecurringEmailSettings(id, { ...data, email_send_time: sendTime })
      if (!ok) return res.status(404).json({ error: 'Factura recurrente no encontrada' })
    } else if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método no permitido' })
    }

    const state = await getRecurringEmailState(id)
    if (!state) return res.status(404).json({ error: 'Factura recurrente no encontrada' })
    return res.status(200).json(state)
  } catch (error) {
    console.error('[recurring-email]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
