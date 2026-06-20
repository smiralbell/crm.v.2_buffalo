/**
 * Enable Banking (PSD2) — configuración
 *
 * Variables de entorno (configurar en EasyPanel / .env local, NUNCA commitear):
 *
 *   ENABLEBANKING_APP_ID          — Application ID (kid del JWT)
 *   ENABLEBANKING_PRIVATE_KEY     — Clave privada RSA PEM (puede usar \n literales)
 *   ENABLEBANKING_REDIRECT_URL    — URL pública del callback backend:
 *                                   https://tu-dominio/api/bank/test/callback
 *
 * Opcional:
 *   ENABLEBANKING_FRONTEND_RETURN_URL — Tras OAuth, redirige aquí (default: /finances/bank-test)
 *   NEXT_PUBLIC_BASE_URL              — Base URL del CRM (para construir redirects)
 */

export const ENABLEBANKING_API_BASE = 'https://api.enablebanking.com'

export interface EnableBankingConfig {
  appId: string
  privateKey: string
  redirectUrl: string
}

export class EnableBankingConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnableBankingConfigError'
  }
}

function normalizePrivateKey(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.includes('\\n')) {
    return trimmed.replace(/\\n/g, '\n')
  }
  return trimmed
}

export function getEnableBankingConfig(): EnableBankingConfig {
  const appId = process.env.ENABLEBANKING_APP_ID?.trim()
  const privateKeyRaw = process.env.ENABLEBANKING_PRIVATE_KEY
  const redirectUrl = process.env.ENABLEBANKING_REDIRECT_URL?.trim()

  const missing: string[] = []
  if (!appId) missing.push('ENABLEBANKING_APP_ID')
  if (!privateKeyRaw) missing.push('ENABLEBANKING_PRIVATE_KEY')
  if (!redirectUrl) missing.push('ENABLEBANKING_REDIRECT_URL')

  if (missing.length) {
    throw new EnableBankingConfigError(
      `Faltan variables de entorno: ${missing.join(', ')}. Configúralas en EasyPanel.`
    )
  }

  return {
    appId: appId!,
    privateKey: normalizePrivateKey(privateKeyRaw!),
    redirectUrl: redirectUrl!,
  }
}

export function getFrontendReturnBase(req?: { headers?: { host?: string; 'x-forwarded-proto'?: string } }): string {
  if (process.env.ENABLEBANKING_FRONTEND_RETURN_URL) {
    return process.env.ENABLEBANKING_FRONTEND_RETURN_URL.replace(/\/$/, '')
  }
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
  }
  const host = req?.headers?.host
  if (host) {
    const proto = req?.headers?.['x-forwarded-proto'] || 'http'
    return `${proto}://${host}`
  }
  return 'http://localhost:3000'
}

export function frontendReturnPath(): string {
  return '/finances/bank-test'
}

export function buildFrontendReturnUrl(
  req: { headers?: { host?: string; 'x-forwarded-proto'?: string } },
  params: Record<string, string>
): string {
  const base = getFrontendReturnBase(req)
  const qs = new URLSearchParams(params).toString()
  return `${base}${frontendReturnPath()}${qs ? `?${qs}` : ''}`
}
