/**
 * Tickets webhook — configuración
 *
 * Variables de entorno (EasyPanel / .env local):
 *
 *   TICKETS_WEBHOOK_TOKEN   — Token Bearer global para el webhook de incidencias
 *   NEXT_PUBLIC_BASE_URL    — Base URL pública del CRM (opcional; override del dominio)
 */

/** Dominio de producción del CRM Buffalo (EasyPanel). */
export const CRM_BASE_URL_DEFAULT = 'https://n8n-crmv2-buffalo.zedf6b.easypanel.host'

export const TICKETS_WEBHOOK_PATH = '/api/webhooks/tickets'

export const TICKETS_WEBHOOK_TOKEN =
  process.env.TICKETS_WEBHOOK_TOKEN || 'buf-tickets-2026'

type ReqHeaders = {
  host?: string
  'x-forwarded-proto'?: string
}

export function getCrmBaseUrl(req?: { headers?: ReqHeaders }): string {
  if (process.env.NEXT_PUBLIC_BASE_URL?.trim()) {
    return process.env.NEXT_PUBLIC_BASE_URL.trim().replace(/\/$/, '')
  }
  const host = req?.headers?.host
  if (host) {
    const proto = req?.headers?.['x-forwarded-proto'] || 'https'
    return `${proto}://${host}`.replace(/\/$/, '')
  }
  return CRM_BASE_URL_DEFAULT
}

export function getTicketsWebhookUrl(req?: { headers?: ReqHeaders }): string {
  return `${getCrmBaseUrl(req)}${TICKETS_WEBHOOK_PATH}`
}
