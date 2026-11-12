import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * CORS para los formularios públicos de las webs Buffalo.
 *
 * Una web estática no puede guardar un secreto (se vería en el código fuente),
 * así que el navegador envía sin token y el CRM comprueba el `Origin`:
 * solo se aceptan los dominios de la lista (más los que añadas en
 * WEBFORM_ALLOWED_ORIGINS, separados por comas: "midominio.com,otro.es").
 * Un dominio permite también todos sus subdominios.
 */
const DEFAULT_ALLOWED_DOMAINS = ['agenciabuffalo.es', 'buffaloia.com']

function allowedDomains(): string[] {
  const extra = (process.env.WEBFORM_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean)
  return [...DEFAULT_ALLOWED_DOMAINS, ...extra]
}

export function originHost(origin: string | undefined): string | null {
  if (!origin) return null
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isAllowedWebOrigin(origin: string | undefined): boolean {
  const host = originHost(origin)
  if (!host) return false
  return allowedDomains().some((d) => host === d || host.endsWith(`.${d}`))
}

/** Pone las cabeceras CORS si el origen está permitido. Devuelve si lo estaba. */
export function applyWebFormCors(req: NextApiRequest, res: NextApiResponse): boolean {
  const origin = req.headers.origin
  res.setHeader('Vary', 'Origin')
  if (!origin || !isAllowedWebOrigin(origin)) return false
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
  res.setHeader('Access-Control-Max-Age', '86400')
  return true
}
