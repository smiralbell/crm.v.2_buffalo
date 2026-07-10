import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAdminAPI } from '@/lib/auth'
import {
  getSmtpPublicStatus,
  sendMail,
  SmtpConfigError,
  verifySmtpConnection,
} from '@/lib/mail/smtp'

const testSchema = z.object({
  to: z.string().email('Email de destino inválido'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)

    if (req.method === 'GET') {
      return res.status(200).json(getSmtpPublicStatus())
    }

    if (req.method === 'POST') {
      const { to } = testSchema.parse(req.body)
      const status = getSmtpPublicStatus()
      if (!status.configured) {
        return res.status(400).json({ error: status.error || 'SMTP no configurado' })
      }

      await verifySmtpConnection()

      const now = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
      const info = await sendMail({
        to,
        subject: 'Prueba SMTP · Buffalo CRM',
        text: `Correo de prueba enviado correctamente desde Buffalo CRM.\n\nFecha: ${now}\nServidor: ${status.host}:${status.port}`,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
            <h2 style="margin:0 0 12px">Prueba SMTP · Buffalo CRM</h2>
            <p>Correo de prueba enviado correctamente.</p>
            <p><strong>Fecha:</strong> ${now}</p>
            <p><strong>Servidor:</strong> ${status.host}:${status.port}</p>
          </div>
        `,
      })

      return res.status(200).json({
        ok: true,
        message: `Correo de prueba enviado a ${to}`,
        messageId: info.messageId,
        accepted: info.accepted,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof SmtpConfigError) {
      return res.status(400).json({ error: error.message })
    }
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[mail/test]', error)
    const msg = error instanceof Error ? error.message : 'Error al enviar correo'
    return res.status(500).json({ error: msg })
  }
}
