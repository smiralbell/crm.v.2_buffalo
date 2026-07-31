/** GET /api/auth/google-drive/callback → muestra el refresh token para el .env */
import type { NextApiRequest, NextApiResponse } from 'next'
import { getDriveOAuth2Client } from '@/lib/integrations/google/drive-auth'

function htmlPage(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: sans-serif; background: #f9f9f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; max-width: 640px; width: 100%; }
  h1 { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
  p { color: #6b7280; font-size: 14px; margin-bottom: 16px; line-height: 1.5; }
  .token { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; font-family: monospace; font-size: 13px; word-break: break-all; }
  .step { background: #fef9c3; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; font-size: 13px; margin-top: 16px; }
  .err { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #991b1b; }
  a.btn { display: inline-block; margin-top: 16px; background: #111; color: #fff; text-decoration: none; padding: 10px 14px; border-radius: 8px; font-size: 13px; }
  code { font-size: 12px; }
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const err = typeof req.query.error === 'string' ? req.query.error : ''
  const errDesc =
    typeof req.query.error_description === 'string' ? req.query.error_description : ''
  const code = typeof req.query.code === 'string' ? req.query.code : ''

  if (err) {
    return res.status(400).send(
      htmlPage(
        'Error Google Drive',
        `<h1>Google denegó el acceso</h1>
         <div class="err"><strong>${err}</strong><br>${errDesc || ''}</div>
         <p>Vuelve a empezar el flujo (no abras el callback a mano).</p>
         <a class="btn" href="/api/auth/google-drive">Reintentar conexión</a>`
      )
    )
  }

  if (!code) {
    return res.status(400).send(
      htmlPage(
        'Falta code',
        `<h1>Falta el código de Google</h1>
         <div class="err">Has abierto el callback sin pasar por el consentimiento de Google (<code>code</code> vacío).</div>
         <p>Haz clic en el botón: te redirigirá a Google y, al aceptar, volverás aquí con el token.</p>
         <a class="btn" href="/api/auth/google-drive">Conectar Google Drive</a>
         <div class="step" style="margin-top:16px">
           <strong>Checklist:</strong><br>
           1) Estar logueado en el CRM<br>
           2) En Google Cloud, URI autorizada exacta:<br>
           <code>http://localhost:3000/api/auth/google-drive/callback</code><br>
           3) Reiniciar el server tras tocar el .env<br>
           4) Usar la cuenta Drive de Buffalo
         </div>`
      )
    )
  }

  try {
    const client = getDriveOAuth2Client()
    const { tokens } = await client.getToken(code)
    const refresh =
      tokens.refresh_token ||
      '(Google no devolvió refresh_token. Revoca el acceso en https://myaccount.google.com/permissions y vuelve a conectar.)'

    return res.send(
      htmlPage(
        'Google Drive conectado',
        `<h1>Google Drive (facturas) conectado</h1>
         <p>Copia esto en tu <code>.env</code> y reinicia el server:</p>
         <div class="token">GOOGLE_DRIVE_REFRESH_TOKEN=${refresh}</div>
         <div class="step">
           <strong>También necesitas:</strong><br><br>
           <code>GOOGLE_DRIVE_PARENT_GASTOS=1K3e9uuW_VFGy_qr7PEr-Zzars6xvKzEF</code><br>
           <code>GOOGLE_DRIVE_PARENT_EMITIDAS=&lt;id de FACTURAS/EMITIDAS&gt;</code>
         </div>
         <p style="margin-top:16px;font-size:12px;color:#9ca3af">Puedes cerrar esta ventana cuando lo hayas copiado.</p>`
      )
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).send(
      htmlPage(
        'Error intercambiando code',
        `<h1>No se pudo obtener el token</h1>
         <div class="err">${msg}</div>
         <p>Casi siempre es un <code>redirect_uri</code> distinto al del consentimiento, o el <code>code</code> ya se usó (solo vale una vez).</p>
         <a class="btn" href="/api/auth/google-drive">Reintentar desde el principio</a>`
      )
    )
  }
}
