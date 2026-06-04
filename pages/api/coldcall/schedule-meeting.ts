import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { createCalendarEvent } from '@/lib/google-calendar'
import nodemailer from 'nodemailer'

function emailHtml(params: {
  nombreProspecto: string
  nombreDespacho:  string
  fechaFormateada: string
  horaFormateada:  string
  duracion:        number
  meetLink:        string
}) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 32px 16px; }
  .container { max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
  .header { background: #111827; padding: 28px 32px; }
  .header h1 { color: white; font-size: 20px; font-weight: 700; margin: 0 0 4px; }
  .header p { color: #9ca3af; font-size: 13px; margin: 0; }
  .body { padding: 28px 32px; }
  .body p { color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
  .meeting-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }
  .meeting-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 14px; color: #374151; }
  .meeting-row:last-child { margin-bottom: 0; }
  .label { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; width: 70px; }
  .value { color: #111827; font-weight: 600; }
  .btn { display: inline-block; background: #111827; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 8px 0; }
  .footer { padding: 20px 32px; border-top: 1px solid #f3f4f6; }
  .footer p { color: #9ca3af; font-size: 12px; margin: 0; line-height: 1.6; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Buffalo AI</h1>
    <p>agenciabuffalo.es</p>
  </div>
  <div class="body">
    <p>Hola ${params.nombreProspecto},</p>
    <p>Confirmo nuestra reunión para ver en directo cómo funciona el sistema de Buffalo AI para <strong>${params.nombreDespacho}</strong>.</p>

    <div class="meeting-card">
      <div class="meeting-row">
        <span class="label">Fecha</span>
        <span class="value">${params.fechaFormateada}</span>
      </div>
      <div class="meeting-row">
        <span class="label">Hora</span>
        <span class="value">${params.horaFormateada} (hora de Madrid)</span>
      </div>
      <div class="meeting-row">
        <span class="label">Duración</span>
        <span class="value">${params.duracion} minutos</span>
      </div>
      <div class="meeting-row">
        <span class="label">Formato</span>
        <span class="value">Google Meet (videollamada)</span>
      </div>
    </div>

    <p>Únete a la reunión con este enlace:</p>
    <a href="${params.meetLink}" class="btn">Unirse a Google Meet</a>

    <p style="margin-top: 20px;">No hay ningún compromiso. Simplemente os lo enseñamos y decidís si tiene encaje para vuestro despacho.</p>
    <p>Si necesitáis cambiar la hora o tenéis cualquier pregunta, respondéis directamente a este correo.</p>
    <p>¡Hasta pronto!</p>
    <p><strong>Sergi Masoliver</strong><br>CEO, Buffalo AI</p>
  </div>
  <div class="footer">
    <p>Buffalo AI Global Digital Solutions, S.L. · agenciabuffalo.es<br>Este correo ha sido enviado porque habéis mostrado interés en nuestros servicios.</p>
  </div>
</div>
</body>
</html>`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuthAPI(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()

  const {
    prospect_id,
    email_prospecto,
    nombre_prospecto,
    nombre_despacho,
    fecha_inicio,   // ISO string
    duracion = 20,
  } = req.body

  if (!email_prospecto || !fecha_inicio) {
    return res.status(400).json({ error: 'email_prospecto y fecha_inicio son obligatorios' })
  }

  const emailOrganizador = process.env.GMAIL_USER || ''
  const fechaInicio = new Date(fecha_inicio)

  try {
    // 1. Crear evento en Google Calendar con Meet link
    const { meetLink, eventId } = await createCalendarEvent({
      titulo:           `Demo Buffalo AI · ${nombre_despacho || nombre_prospecto}`,
      descripcion:      `Reunión para ver en directo cómo funciona el sistema de atención al cliente con IA de Buffalo AI.\n\nDespacho: ${nombre_despacho || '—'}\nContacto: ${nombre_prospecto || '—'}`,
      fechaInicio,
      duracionMin:      duracion,
      emailProspecto:   email_prospecto,
      emailOrganizador,
    })

    // 2. Enviar email de confirmación
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    const fechaFormateada = fechaInicio.toLocaleDateString('es-ES', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const horaFormateada = fechaInicio.toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
    })

    const html = emailHtml({
      nombreProspecto: nombre_prospecto || 'estimado/a',
      nombreDespacho:  nombre_despacho  || nombre_prospecto || '',
      fechaFormateada,
      horaFormateada,
      duracion,
      meetLink,
    })

    await transporter.sendMail({
      from:    `"Sergi Masoliver · Buffalo AI" <${process.env.GMAIL_USER}>`,
      to:      email_prospecto,
      cc:      process.env.GMAIL_USER,
      subject: `Confirmación de reunión · Demo Buffalo AI · ${fechaFormateada}`,
      html,
    })

    return res.json({ ok: true, meetLink, eventId })

  } catch (err: unknown) {
    console.error('schedule-meeting error:', err)
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return res.status(500).json({ error: message })
  }
}
