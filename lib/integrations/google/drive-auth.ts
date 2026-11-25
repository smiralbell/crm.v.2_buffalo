import { google } from 'googleapis'

/** Scope amplio: carpetas existentes creadas por n8n + subidas nuevas. */
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

export function getDriveOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET deben estar configurados')
  }
  const redirectUri =
    process.env.GOOGLE_DRIVE_REDIRECT_URI ||
    process.env.GOOGLE_REDIRECT_URI ||
    'http://localhost:3000/api/auth/google-drive/callback'
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function getDriveAuthUrl(): string {
  const client = getDriveOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GOOGLE_DRIVE_SCOPE, 'openid', 'email'],
  })
}

/**
 * Cliente Drive de empresa (misma cuenta que usaba n8n "Google Drive Buffalo").
 * Preferir GOOGLE_DRIVE_REFRESH_TOKEN; fallback a GOOGLE_REFRESH_TOKEN si ya tiene scope drive.
 */
export async function getAuthorizedDriveClient() {
  const refreshToken =
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN
  if (!refreshToken) {
    throw new Error(
      'Falta GOOGLE_DRIVE_REFRESH_TOKEN (o GOOGLE_REFRESH_TOKEN con scope Drive). Visita /api/auth/google-drive'
    )
  }
  const auth = getDriveOAuth2Client()
  auth.setCredentials({ refresh_token: refreshToken })
  return google.drive({ version: 'v3', auth })
}

/** Token de acceso de la misma cuenta de Drive (para la subida reanudable de archivos grandes). */
export async function getDriveAccessToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN
  if (!refreshToken) throw new Error('Falta GOOGLE_DRIVE_REFRESH_TOKEN (o GOOGLE_REFRESH_TOKEN con scope Drive)')
  const auth = getDriveOAuth2Client()
  auth.setCredentials({ refresh_token: refreshToken })
  const { token } = await auth.getAccessToken()
  if (!token) throw new Error('Google Drive no devolvió un token de acceso')
  return token
}
