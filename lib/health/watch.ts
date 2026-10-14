/**
 * Salud del sistema: estado de cada integración + avisos antes de que algo se rompa.
 * Lo usan la pantalla /sistema y la tarea «health-watch» (cada 6 h).
 */
import { query } from '@/lib/db'
import { notify } from '@/lib/notifications'
import { isSessionSecretConfigured } from '@/lib/session-secret'
import { isCronSecretConfigured } from '@/lib/cron-auth'
import { usesLegacyWebhookToken } from '@/lib/ingest/auth'

export type IntegrationState = 'ok' | 'warning' | 'error' | 'off'

export type IntegrationHealth = {
  key: string
  name: string
  state: IntegrationState
  detail: string
  /** Fecha relevante (caducidad, última sincronización…) */
  at?: string | null
  link?: string
}

const today = () => new Date().toISOString().slice(0, 10)

async function bankHealth(): Promise<IntegrationHealth> {
  try {
    const { getBankConnectionStatus } = await import('@/lib/enable-banking/connection-status')
    const s = await getBankConnectionStatus()
    if (!s.connected) return { key: 'bank', name: 'Banco (Enable Banking)', state: 'off', detail: 'Sin conexión bancaria', link: '/finances' }
    const days = s.days_remaining ?? 0
    const state: IntegrationState = days <= 0 ? 'error' : days <= 7 ? 'warning' : 'ok'
    const detail =
      days <= 0
        ? 'El consentimiento del banco ha caducado: hay que renovarlo'
        : `Consentimiento válido ${days} día(s) más${s.last_synced_at ? ` · última sync ${new Date(s.last_synced_at).toLocaleString('es-ES')}` : ''}`
    return { key: 'bank', name: 'Banco (Enable Banking)', state, detail, at: s.valid_until, link: '/finances' }
  } catch (e) {
    return { key: 'bank', name: 'Banco (Enable Banking)', state: 'error', detail: errMsg(e) }
  }
}

async function googleHealth(): Promise<IntegrationHealth> {
  try {
    const { rows } = await query<{ total: string; reauth: string; emails: string | null }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE needs_reauth OR refresh_token_enc IS NULL) AS reauth,
              STRING_AGG(google_email, ', ') FILTER (WHERE needs_reauth OR refresh_token_enc IS NULL) AS emails
         FROM google_calendar_connections`
    )
    const total = Number(rows[0]?.total ?? 0)
    const reauth = Number(rows[0]?.reauth ?? 0)
    if (!total) return { key: 'google', name: 'Google (Calendar/Gmail)', state: 'off', detail: 'Ninguna cuenta conectada', link: '/calendario' }
    if (reauth) {
      return {
        key: 'google',
        name: 'Google (Calendar/Gmail)',
        state: 'warning',
        detail: `${reauth} de ${total} cuenta(s) necesitan volver a conectarse${rows[0]?.emails ? `: ${rows[0].emails}` : ''}`,
        link: '/calendario',
      }
    }
    return { key: 'google', name: 'Google (Calendar/Gmail)', state: 'ok', detail: `${total} cuenta(s) conectada(s)`, link: '/calendario' }
  } catch (e) {
    if (isMissingTable(e)) return { key: 'google', name: 'Google (Calendar/Gmail)', state: 'off', detail: 'Sin configurar' }
    return { key: 'google', name: 'Google (Calendar/Gmail)', state: 'error', detail: errMsg(e) }
  }
}

async function firefliesHealth(): Promise<IntegrationHealth> {
  const { isFirefliesConfigured } = await import('@/lib/integrations/fireflies/client')
  if (!isFirefliesConfigured()) return { key: 'fireflies', name: 'Fireflies', state: 'off', detail: 'Sin API key' }
  const secret = Boolean(process.env.FIREFLIES_WEBHOOK_SECRET?.trim())
  const last = await lastInbound('fireflies')
  return {
    key: 'fireflies',
    name: 'Fireflies',
    state: secret ? 'ok' : 'warning',
    detail: `${secret ? 'Webhook firmado' : 'Falta FIREFLIES_WEBHOOK_SECRET'}${last ? ` · último evento ${last.toLocaleString('es-ES')}` : ''}`,
    at: last?.toISOString() ?? null,
  }
}

async function calcomHealth(): Promise<IntegrationHealth> {
  const secret = Boolean(process.env.CALCOM_WEBHOOK_SECRET?.trim())
  const last = await lastInbound('calcom')
  return {
    key: 'calcom',
    name: 'Cal.com',
    state: secret ? 'ok' : 'warning',
    detail: `${secret ? 'Webhook firmado' : 'Falta CALCOM_WEBHOOK_SECRET'}${last ? ` · última reserva ${last.toLocaleString('es-ES')}` : ''}`,
    at: last?.toISOString() ?? null,
  }
}

async function smtpHealth(): Promise<IntegrationHealth> {
  const { isSmtpConfigured } = await import('@/lib/mail/smtp')
  return isSmtpConfigured()
    ? { key: 'smtp', name: 'Correo saliente (SMTP)', state: 'ok', detail: 'Configurado' }
    : { key: 'smtp', name: 'Correo saliente (SMTP)', state: 'off', detail: 'Sin configurar' }
}

function whatsappHealth(): IntegrationHealth {
  const ok = Boolean(process.env.WASENDER_API_KEY?.trim())
  return ok
    ? { key: 'whatsapp', name: 'WhatsApp (Wasender)', state: 'ok', detail: 'API key configurada' }
    : { key: 'whatsapp', name: 'WhatsApp (Wasender)', state: 'off', detail: 'Sin API key' }
}

function openrouterHealth(): IntegrationHealth {
  return process.env.OPENROUTER_API_KEY?.trim()
    ? { key: 'openrouter', name: 'IA (OpenRouter)', state: 'ok', detail: 'API key configurada' }
    : { key: 'openrouter', name: 'IA (OpenRouter)', state: 'error', detail: 'Falta OPENROUTER_API_KEY' }
}

async function instantlyInboundHealth(): Promise<IntegrationHealth> {
  const last = await lastInbound('instantly')
  const legacy = usesLegacyWebhookToken('INSTANTLY_WEBHOOK_TOKEN')
  return {
    key: 'instantly',
    name: 'Instantly (email)',
    state: legacy ? 'warning' : last ? 'ok' : 'ok',
    detail: `${legacy ? 'Token por defecto · ' : ''}${last ? `último evento ${last.toLocaleString('es-ES')}` : 'sin eventos aún'}`,
    at: last?.toISOString() ?? null,
    link: '/marketing',
  }
}

async function ticketsInboundHealth(): Promise<IntegrationHealth> {
  const last = await lastInbound('tickets')
  return {
    key: 'tickets-in',
    name: 'Tickets (webhook)',
    state: last ? 'ok' : usesLegacyWebhookToken('TICKETS_WEBHOOK_TOKEN') ? 'warning' : 'ok',
    detail: last ? `último ticket ${last.toLocaleString('es-ES')}` : 'sin eventos aún',
    at: last?.toISOString() ?? null,
    link: '/tickets',
  }
}

async function webformInboundHealth(): Promise<IntegrationHealth> {
  const last = await lastInbound('web_form')
  const token = Boolean(process.env.WEBFORM_WEBHOOK_TOKEN?.trim() || process.env.INGEST_TOKEN?.trim())
  return {
    key: 'webform',
    name: 'Formularios web',
    state: token ? 'ok' : 'warning',
    detail: token
      ? last
        ? `último envío ${last.toLocaleString('es-ES')}`
        : 'POST /api/webhooks/webform listo (n8n ya no necesita escribir en Postgres)'
      : 'Falta WEBFORM_WEBHOOK_TOKEN o INGEST_TOKEN',
    at: last?.toISOString() ?? null,
    link: '/marketing',
  }
}

function stripeHealth(): IntegrationHealth {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  const wh = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!key && !wh) {
    return { key: 'stripe', name: 'Stripe (pagos)', state: 'off', detail: 'Sin configurar · el CRM ya tiene enlace de pago y webhook listos', link: '/invoices' }
  }
  if (!key) return { key: 'stripe', name: 'Stripe (pagos)', state: 'warning', detail: 'Falta STRIPE_SECRET_KEY', link: '/invoices' }
  if (!wh) return { key: 'stripe', name: 'Stripe (pagos)', state: 'warning', detail: 'Falta STRIPE_WEBHOOK_SECRET (los cobros no se marcarán solos)', link: '/invoices' }
  return { key: 'stripe', name: 'Stripe (pagos)', state: 'ok', detail: 'Clave y webhook configurados', link: '/invoices' }
}

async function adsHealth(channel: 'meta' | 'google'): Promise<IntegrationHealth> {
  const name = channel === 'meta' ? 'Meta Ads' : 'Google Ads'
  const configured =
    channel === 'meta'
      ? Boolean(process.env.META_ADS_ACCESS_TOKEN?.trim() && process.env.META_ADS_ACCOUNT_ID?.trim())
      : Boolean(
          process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() &&
            process.env.GOOGLE_ADS_CUSTOMER_ID?.trim() &&
            (process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() || process.env.GOOGLE_REFRESH_TOKEN?.trim())
        )
  if (!configured) {
    return { key: `${channel}-ads`, name, state: 'off', detail: 'Sin tokens · el gasto se sigue pudiendo poner a mano', link: '/marketing' }
  }
  const { lastAdsSyncAt } = await import('@/lib/ads/sync')
  const last = await lastAdsSyncAt(channel)
  return {
    key: `${channel}-ads`,
    name,
    state: last ? 'ok' : 'warning',
    detail: last ? `Última sync ${last.toLocaleString('es-ES')}` : 'Configurado, aún no hay sync (lanza «Gasto Meta / Google Ads» en Sistema)',
    at: last?.toISOString() ?? null,
    link: '/marketing',
  }
}

function securityHealth(): IntegrationHealth {
  const problems: string[] = []
  if (!isSessionSecretConfigured()) problems.push('falta SESSION_SECRET')
  if (!isCronSecretConfigured()) problems.push('falta CRON_SECRET (endpoints de cron desactivados)')
  if (usesLegacyWebhookToken('INSTANTLY_WEBHOOK_TOKEN')) problems.push('INSTANTLY_WEBHOOK_TOKEN usa el valor por defecto')
  if (usesLegacyWebhookToken('TICKETS_WEBHOOK_TOKEN')) problems.push('TICKETS_WEBHOOK_TOKEN usa el valor por defecto')
  if (!process.env.ONBOARDING_FORM_WEBHOOK_TOKEN?.trim()) problems.push('ONBOARDING_FORM_WEBHOOK_TOKEN no está definido (webhook abierto)')
  return {
    key: 'security',
    name: 'Claves y secretos',
    state: problems.some((p) => p.includes('SESSION_SECRET')) ? 'error' : problems.length ? 'warning' : 'ok',
    detail: problems.length ? problems.join(' · ') : 'Todas configuradas',
  }
}

async function lastInbound(source: string): Promise<Date | null> {
  try {
    const { rows } = await query<{ at: Date | null }>(
      `SELECT MAX(received_at) AS at FROM inbound_events WHERE source = $1`,
      [source]
    )
    return rows[0]?.at ?? null
  } catch {
    return null
  }
}

function isMissingTable(e: unknown) {
  return Boolean(e && typeof e === 'object' && (e as { code?: string }).code === '42P01')
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

export async function integrationHealth(): Promise<IntegrationHealth[]> {
  return Promise.all([
    bankHealth(),
    googleHealth(),
    calcomHealth(),
    firefliesHealth(),
    instantlyInboundHealth(),
    ticketsInboundHealth(),
    webformInboundHealth(),
    Promise.resolve(whatsappHealth()),
    smtpHealth(),
    Promise.resolve(openrouterHealth()),
    Promise.resolve(stripeHealth()),
    adsHealth('meta'),
    adsHealth('google'),
    Promise.resolve(securityHealth()),
  ])
}

/** Tarea periódica: avisa a los admins de lo que está a punto de fallar o ya ha fallado. */
export async function watchIntegrationHealth(): Promise<{ warnings: string[] }> {
  const items = await integrationHealth()
  const warnings: string[] = []
  for (const it of items) {
    if (it.state !== 'warning' && it.state !== 'error') continue
    warnings.push(`${it.name}: ${it.detail}`)
    await notify({
      to: { roles: ['admin'] },
      kind: `salud.${it.key}`,
      title: it.state === 'error' ? `${it.name}: requiere atención` : `${it.name}: aviso`,
      body: it.detail,
      link: it.link || '/sistema',
      severity: it.state === 'error' ? 'urgent' : 'warning',
      dedupeKey: `salud:${it.key}:${it.state}:${today()}`,
    })
  }
  return { warnings }
}
