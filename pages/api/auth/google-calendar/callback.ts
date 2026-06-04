// GET /api/auth/google-calendar/callback → intercambia code por tokens y muestra el refresh_token
import type { NextApiRequest, NextApiResponse } from 'next'
import { getOAuth2Client } from '@/lib/google-calendar'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query
  if (!code) return res.status(400).send('Missing code')

  const client = getOAuth2Client()
  const { tokens } = await client.getToken(code as string)

  // Devuelve la pantalla con el refresh_token para copiarlo al .env
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Google Calendar conectado</title>
    <style>
      body { font-family: sans-serif; background: #f9f9f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; max-width: 600px; width: 100%; }
      h1 { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
      p { color: #6b7280; font-size: 14px; margin-bottom: 16px; }
      .token { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; font-family: monospace; font-size: 13px; word-break: break-all; }
      .step { background: #fef9c3; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; font-size: 13px; margin-top: 16px; }
    </style>
    </head>
    <body>
    <div class="card">
      <h1>✅ Google Calendar conectado</h1>
      <p>Copia este Refresh Token y pégalo en tu archivo <code>.env</code>:</p>
      <div class="token">GOOGLE_REFRESH_TOKEN=${tokens.refresh_token || '(ya tenías uno guardado)'}</div>
      <div class="step">
        <strong>Paso siguiente:</strong><br>
        Abre el .env del CRM y añade:<br><br>
        <code>GOOGLE_REFRESH_TOKEN=${tokens.refresh_token || '(el token de arriba)'}</code>
      </div>
      <p style="margin-top:16px;font-size:12px;color:#9ca3af">Puedes cerrar esta ventana cuando lo hayas copiado.</p>
    </div>
    </body>
    </html>
  `)
}
