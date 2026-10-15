import webpush from 'web-push'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'

/**
 * Notificaciones Web Push (PWA en el móvil).
 * Claves VAPID: `npx web-push generate-vapid-keys` → VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
 */

export type PushPayload = {
  title: string
  body?: string
  /** Ruta del CRM (o URL absoluta) que se abre al tocar la notificación. */
  url?: string
  /** Mismo tag = la nueva sustituye a la anterior en el móvil. */
  tag?: string
}

export type PushSubscriptionInput = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

let schemaEnsured = false
let vapidReady: boolean | null = null

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null
}

export function isPushConfigured(): boolean {
  if (vapidReady != null) return vapidReady
  const pub = vapidPublicKey()
  const priv = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!pub || !priv) return (vapidReady = false)
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    `mailto:${(process.env.CRM_ADMIN_EMAIL || 'admin@buffalo.ai').trim()}`
  try {
    webpush.setVapidDetails(subject, pub, priv)
    vapidReady = true
  } catch (e) {
    console.warn('[push] VAPID inválido', e instanceof Error ? e.message : e)
    vapidReady = false
  }
  return vapidReady
}

export async function ensurePushSubscriptionsTable(): Promise<void> {
  if (schemaEnsured) return
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER,
      user_email    TEXT NOT NULL,
      user_role     TEXT NOT NULL,
      endpoint      TEXT NOT NULL UNIQUE,
      p256dh        TEXT NOT NULL,
      auth          TEXT NOT NULL,
      user_agent    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_sent_at  TIMESTAMPTZ
    )
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_email ON push_subscriptions (LOWER(user_email))`
  )
  schemaEnsured = true
}

export async function savePushSubscription(
  user: AuthUser,
  sub: PushSubscriptionInput,
  userAgent?: string
): Promise<void> {
  await ensurePushSubscriptionsTable()
  await prisma.$executeRawUnsafe(
    `INSERT INTO push_subscriptions (user_id, user_email, user_role, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       user_email = EXCLUDED.user_email,
       user_role = EXCLUDED.user_role,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent`,
    user.id || null,
    user.email,
    user.role,
    sub.endpoint,
    sub.keys.p256dh,
    sub.keys.auth,
    (userAgent || '').slice(0, 400) || null
  )
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await ensurePushSubscriptionsTable()
  await prisma.$executeRawUnsafe(`DELETE FROM push_subscriptions WHERE endpoint = $1`, endpoint)
}

type SubRow = { id: number; endpoint: string; p256dh: string; auth: string }

/**
 * Envía a los móviles suscritos. Sin `emails` → todos los admins (los socios),
 * igual que los avisos por mail/Telegram. Nunca lanza: los avisos no deben romper el flujo.
 */
export async function sendPush(
  payload: PushPayload,
  opts?: { emails?: string[] }
): Promise<{ sent: number; failed: number }> {
  if (!isPushConfigured()) return { sent: 0, failed: 0 }
  let rows: SubRow[] = []
  try {
    await ensurePushSubscriptionsTable()
    const emails = (opts?.emails || []).map((e) => e.trim().toLowerCase()).filter(Boolean)
    rows = emails.length
      ? await prisma.$queryRawUnsafe<SubRow[]>(
          `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE LOWER(user_email) = ANY($1::text[])`,
          emails
        )
      : await prisma.$queryRawUnsafe<SubRow[]>(
          `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_role = 'admin'`
        )
  } catch (e) {
    console.warn('[push] leer suscripciones', e instanceof Error ? e.message : e)
    return { sent: 0, failed: 0 }
  }

  const body = JSON.stringify({
    title: payload.title.slice(0, 120),
    body: (payload.body || '').slice(0, 300),
    url: payload.url || '/dashboard',
    tag: payload.tag,
  })

  let sent = 0
  let failed = 0
  await Promise.all(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification(
          { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
          body,
          { TTL: 24 * 60 * 60, urgency: 'high' }
        )
        sent++
        await prisma
          .$executeRawUnsafe(`UPDATE push_subscriptions SET last_sent_at = NOW() WHERE id = $1`, r.id)
          .catch(() => {})
      } catch (e) {
        failed++
        const status = (e as { statusCode?: number })?.statusCode
        // 404/410: el móvil quitó el permiso o desinstaló la app → limpiar.
        if (status === 404 || status === 410) {
          await prisma
            .$executeRawUnsafe(`DELETE FROM push_subscriptions WHERE id = $1`, r.id)
            .catch(() => {})
        } else {
          console.warn('[push] envío', status, e instanceof Error ? e.message : e)
        }
      }
    })
  )
  return { sent, failed }
}
