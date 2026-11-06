import { crmPublicBaseUrl } from '@/lib/ops-alerts'
import { startAgentReminders } from '@/lib/telegram-agent/scheduler'
import { isWhatsAppAgentEnabled, whatsAppWebhookSecret } from './config'
import { getWhatsAppWebhook, setWhatsAppWebhook } from './evolution-api'

declare global {
  // eslint-disable-next-line no-var
  var __buffaloWhatsAppAgent: boolean | undefined
}

export function whatsAppWebhookUrl(): string {
  return `${crmPublicBaseUrl()}/api/webhooks/whatsapp?secret=${encodeURIComponent(whatsAppWebhookSecret())}`
}

/**
 * Evolution solo puede avisar a una dirección pública con https. Un CRM en local
 * (localhost, 127.0.0.1, http) nunca toca el webhook: se lo quitaría a producción.
 */
export function isPublicWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const local =
      host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]'
    return u.protocol === 'https:' && !local
  } catch {
    return false
  }
}

/** Apunta la instancia de Evolution al webhook del CRM si no lo está ya. */
export async function ensureWhatsAppWebhook(force = false): Promise<{ url: string; changed: boolean }> {
  const url = whatsAppWebhookUrl()
  if (!isPublicWebhookUrl(url)) {
    throw new Error(`No se configura el webhook: ${new URL(url).origin} no es una dirección pública con https`)
  }
  const current = await getWhatsAppWebhook().catch(() => null)
  const ok =
    current?.enabled !== false &&
    current?.url === url &&
    (current?.events || []).some((e) => e.toUpperCase().replace(/\./g, '_') === 'MESSAGES_UPSERT')
  if (!force && ok) return { url, changed: false }
  await setWhatsAppWebhook(url)
  return { url, changed: true }
}

/** Arranca una vez por proceso: configura el webhook en Evolution y los avisos programados. */
export function startWhatsAppAgent(): void {
  if (globalThis.__buffaloWhatsAppAgent || !isWhatsAppAgentEnabled()) return
  globalThis.__buffaloWhatsAppAgent = true

  if (process.env.WHATSAPP_AGENT_AUTO_WEBHOOK !== '0') {
    void ensureWhatsAppWebhook()
      .then((r) => r.changed && console.log('[whatsapp-agent] webhook configurado en Evolution'))
      .catch((e) => console.warn('[whatsapp-agent] webhook', e instanceof Error ? e.message : e))
  }
  startAgentReminders()
}
