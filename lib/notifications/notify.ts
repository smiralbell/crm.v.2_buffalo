import { getPool } from '@/lib/db'
import { opsLink, sendTelegramToChat, telegramChatIds } from '@/lib/ops-alerts'
import { insertOpsAlertMessage } from '@/lib/ops-alerts-store'
import { isPushConfigured, sendPush } from '@/lib/push'
import { subagentModel } from '@/lib/telegram-agent/config'
import { runToolLoop } from '@/lib/telegram-agent/llm'
import {
  allowedWhatsAppNumbers,
  isWhatsAppAgentEnabled,
  isWhatsAppChat,
  normalizePhone,
  phoneFromChatId,
  waChatId,
} from '@/lib/whatsapp-agent/config'
import { sendWhatsAppText } from '@/lib/whatsapp-agent/evolution-api'
import {
  decide,
  digestText,
  effectiveRule,
  getEvent,
  normalizePrefs,
  singleText,
  type Channel,
  type NotifyData,
  type Prefs,
  type RecipientKind,
  type Rule,
} from './rules'

/**
 * Envío de los avisos automáticos del CRM según las reglas de cada persona.
 *
 *   notify(aviso) → por cada destinatario y canal: se decide (rules.ts) y se apunta
 *   en notification_outbox: enviado, pendiente (resumen, silencio, pausa) o descartado
 *   (con el motivo). Lo pendiente lo manda flushNotifications() cada minuto.
 *
 * notification_outbox es también el historial: «¿por qué no me llegó el lead de ayer?».
 * Nunca lanza: un aviso que falla no puede romper lo que lo provoca.
 */

// ——— Tablas ———

let ensured: Promise<void> | null = null

export function ensureNotificationTables(): Promise<void> {
  if (!ensured) {
    ensured = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS notification_prefs (
           owner_key   TEXT PRIMARY KEY,
           prefs       JSONB NOT NULL DEFAULT '{}'::jsonb,
           updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
         );
         CREATE TABLE IF NOT EXISTS notification_outbox (
           id             BIGSERIAL PRIMARY KEY,
           owner_key      TEXT NOT NULL,
           kind           TEXT NOT NULL,
           event          TEXT NOT NULL,
           channel        TEXT NOT NULL,
           subject        TEXT NOT NULL,
           body           TEXT NOT NULL,
           html           TEXT,
           telegram_html  TEXT,
           url            TEXT,
           formato        TEXT NOT NULL DEFAULT 'detallado',
           digest         BOOLEAN NOT NULL DEFAULT FALSE,
           reason         TEXT,
           status         TEXT NOT NULL DEFAULT 'pending',
           send_after     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           dedupe_key     TEXT,
           error          TEXT,
           created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           sent_at        TIMESTAMPTZ
         );
         CREATE INDEX IF NOT EXISTS idx_notification_outbox_due ON notification_outbox (status, send_after);
         CREATE INDEX IF NOT EXISTS idx_notification_outbox_owner ON notification_outbox (owner_key, created_at DESC);
         CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedupe
           ON notification_outbox (owner_key, channel, dedupe_key) WHERE dedupe_key IS NOT NULL;`
      )
      .then(() => undefined)
      .catch((e) => {
        ensured = null
        throw e
      })
  }
  return ensured
}

// ——— Configuración de cada persona ———

export async function getPrefs(ownerKey: string): Promise<Prefs> {
  await ensureNotificationTables()
  const r = await getPool().query<{ prefs: unknown }>(`SELECT prefs FROM notification_prefs WHERE owner_key = $1`, [ownerKey])
  return normalizePrefs(r.rows[0]?.prefs)
}

export async function savePrefs(ownerKey: string, prefs: Prefs): Promise<void> {
  await ensureNotificationTables()
  await getPool().query(
    `INSERT INTO notification_prefs (owner_key, prefs, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (owner_key) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = NOW()`,
    [ownerKey, JSON.stringify(prefs)]
  )
}

// ——— Destinatarios ———

export interface Recipient {
  key: string
  kind: RecipientKind
  /** WhatsApp (socio y equipo) */
  phone?: string
  name?: string
}

export const COMMON_KEY = 'comun'

/** Socios: cada móvil de WHATSAPP_AGENT_NUMBERS (si el agente de WhatsApp está activo). */
export function socioRecipients(): Recipient[] {
  if (!isWhatsAppAgentEnabled()) return []
  return Array.from(allowedWhatsAppNumbers()).map((phone) => ({ key: `chat:${waChatId(phone)}`, kind: 'socio' as const, phone }))
}

/** Equipo: usuarios activos de esos ids, developer o PM, con su móvil en la ficha. */
export async function teamRecipients(userIds: number[]): Promise<Recipient[]> {
  const ids = Array.from(new Set(userIds.filter((n) => Number.isInteger(n) && n > 0)))
  if (!ids.length || !isWhatsAppAgentEnabled()) return []
  const socios = allowedWhatsAppNumbers()
  try {
    const r = await getPool().query<{ id: number; name: string; whatsapp_phone: string }>(
      `SELECT id, name, whatsapp_phone FROM crm_users
       WHERE id = ANY($1::int[]) AND active = TRUE AND role IN ('developer', 'project_manager')
         AND whatsapp_phone IS NOT NULL AND whatsapp_phone <> ''`,
      [ids]
    )
    return r.rows
      .filter((u) => !socios.has(normalizePhone(u.whatsapp_phone)))
      .map((u) => ({ key: `user:${u.id}`, kind: 'equipo' as const, phone: normalizePhone(u.whatsapp_phone), name: u.name }))
  } catch {
    return []
  }
}

/** El móvil de un destinatario a partir de su clave (para enviar lo que estaba en cola). */
async function phoneOf(ownerKey: string): Promise<string | null> {
  if (ownerKey.startsWith('chat:')) {
    const chatId = Number(ownerKey.slice(5))
    if (!isWhatsAppChat(chatId)) return null
    const phone = phoneFromChatId(chatId)
    // Solo si sigue siendo uno de los socios
    return allowedWhatsAppNumbers().has(phone) ? phone : null
  }
  if (ownerKey.startsWith('user:')) {
    const [r] = await teamRecipients([Number(ownerKey.slice(5))])
    return r?.phone ?? null
  }
  return null
}

// ——— Envío por canal ———

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

type Outgoing = { subject: string; text: string; html?: string | null; telegramHtml?: string | null; url?: string | null }

async function sendOn(channel: Channel, ownerKey: string, msg: Outgoing): Promise<void> {
  if (channel === 'telegram') {
    const chats = telegramChatIds()
    if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !chats.length) throw new Error('Telegram sin configurar')
    for (const chat of chats) await sendTelegramToChat(chat, msg.telegramHtml || escHtml(msg.text))
    return
  }
  if (channel === 'push') {
    if (!isPushConfigured()) throw new Error('push sin configurar')
    await sendPush({
      title: msg.subject.replace(/^\[CRM\]\s*/, ''),
      body: msg.text
        .split('\n')
        .filter((l) => l.trim() && !/https?:\/\//i.test(l))
        .join(' · ')
        .slice(0, 300),
      url: msg.url || undefined,
    })
    return
  }
  const phone = await phoneOf(ownerKey)
  if (!phone) throw new Error('sin WhatsApp (o ya no tiene acceso)')
  await sendWhatsAppText(phone, msg.text)
}

// ——— Avisar ———

export interface NotifyInput {
  event: string
  subject: string
  text: string
  html?: string
  telegramHtml?: string
  /** Ruta del CRM a la que lleva el aviso */
  url?: string
  /** Puede saltarse las horas de silencio si la persona lo ha pedido */
  urgent?: boolean
  /** Para los filtros: origen, prioridad, proyecto */
  data?: NotifyData
  /** Avisos del equipo: a quién va (ids de crm_users) */
  userIds?: number[]
  /** El mismo aviso no se repite para la misma persona */
  dedupeKey?: string
}

/** Manda (o deja en cola) un aviso a todos los que les toca, según sus reglas. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const event = getEvent(input.event)
    if (!event) throw new Error(`aviso desconocido: ${input.event}`)
    await ensureNotificationTables()
    const recipients: Recipient[] =
      event.audience === 'socios'
        ? [{ key: COMMON_KEY, kind: 'comun' }, ...socioRecipients()]
        : await teamRecipients(input.userIds ?? [])

    // La página de Alertas del CRM sigue enseñando todos los avisos de los socios
    if (event.audience === 'socios') {
      await insertOpsAlertMessage({ subject: input.subject, body: input.text, channels: ['según reglas'] }).catch(() => null)
    }

    const now = new Date()
    for (const rec of recipients) {
      const prefs = await getPrefs(rec.key).catch(() => normalizePrefs(null))
      const rule = effectiveRule(event, rec.kind, prefs)
      const decision = decide(rule, prefs, now, { urgent: input.urgent, data: input.data })
      const channels = decision.action === 'skip' && !rule.canales.length ? ['ninguno'] : rule.canales
      for (const channel of channels) {
        const id = await insertOutbox(rec, channel, input, rule, decision)
        if (id && decision.action === 'queue' && !decision.digest && decision.at.getTime() <= now.getTime()) {
          await deliverRows([await rowById(id)].filter(Boolean) as OutboxRow[])
        }
      }
    }
  } catch (e) {
    console.warn('[avisos]', input.event, e instanceof Error ? e.message : e)
  }
}

type OutboxRow = {
  id: number
  owner_key: string
  kind: string
  event: string
  channel: Channel
  subject: string
  body: string
  html: string | null
  telegram_html: string | null
  url: string | null
  formato: Rule['formato']
  digest: boolean
  reason: string | null
}

async function insertOutbox(
  rec: Recipient,
  channel: string,
  input: NotifyInput,
  rule: Rule,
  decision: ReturnType<typeof decide>
): Promise<number | null> {
  const skip = decision.action === 'skip'
  const r = await getPool().query<{ id: number }>(
    `INSERT INTO notification_outbox
       (owner_key, kind, event, channel, subject, body, html, telegram_html, url, formato, digest, reason, status, send_after, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      rec.key,
      rec.kind,
      input.event,
      channel,
      input.subject.slice(0, 500),
      input.text.slice(0, 8000),
      input.html ?? null,
      input.telegramHtml ?? null,
      input.url ?? null,
      rule.formato,
      skip ? false : decision.digest,
      decision.action === 'skip' ? decision.reason : decision.reason ?? null,
      skip ? 'skipped' : 'pending',
      skip ? new Date() : decision.at,
      input.dedupeKey ?? null,
    ]
  )
  return r.rows[0] ? Number(r.rows[0].id) : null
}

async function rowById(id: number): Promise<OutboxRow | null> {
  const r = await getPool().query<OutboxRow>(
    `UPDATE notification_outbox SET status = 'sending' WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id]
  )
  return r.rows[0] ?? null
}

async function markRows(ids: number[], status: 'sent' | 'failed', error?: string): Promise<void> {
  await getPool().query(
    `UPDATE notification_outbox SET status = $2, error = $3, sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END
     WHERE id = ANY($1::bigint[])`,
    [ids, status, error ?? null]
  )
}

/** Resumen con el estilo que ha pedido la persona; si la IA falla, el resumen normal. */
async function styled(text: string, estilo: string | null): Promise<string> {
  if (!estilo) return text
  try {
    const out = await runToolLoop({
      model: subagentModel(),
      maxRounds: 1,
      tools: [],
      execute: async () => ({ ok: false }),
      messages: [
        {
          role: 'system',
          content: `Reescribe este resumen de avisos del CRM para WhatsApp siguiendo la preferencia de la persona: «${estilo}». Texto plano, sin markdown ni emojis, en español de España. No inventes nada ni quites avisos; los enlaces, tal cual.`,
        },
        { role: 'user', content: text },
      ],
    })
    return out.trim() || text
  } catch {
    return text
  }
}

/** Manda un grupo de filas del mismo destinatario y canal: una suelta tal cual, varias en resumen. */
async function deliverRows(rows: OutboxRow[]): Promise<void> {
  if (!rows.length) return
  const first = rows[0]
  const ids = rows.map((r) => r.id)
  try {
    let msg: Outgoing
    if (rows.length === 1 && !first.digest) {
      const link = first.url ? opsLink(first.url) : null
      const text = first.channel === 'whatsapp' ? singleText({ event: first.event, subject: first.subject, body: first.body }, first.formato, link) : first.body
      msg = { subject: first.subject, text, html: first.html, telegramHtml: first.telegram_html, url: first.url }
    } else {
      const items = rows.map((r) => ({ event: r.event, subject: r.subject, body: r.body }))
      const formato = rows.some((r) => r.formato === 'detallado') ? 'detallado' : 'corto'
      const reason = rows.every((r) => r.reason === rows[0].reason) ? rows[0].reason : null
      let text = digestText(items, formato, reason)
      if (first.channel === 'whatsapp') text = await styled(text, (await getPrefs(first.owner_key)).estilo_resumen)
      msg = {
        subject: rows.length === 1 ? first.subject : `Resumen de avisos (${rows.length})`,
        text,
        url: rows.length === 1 ? first.url : '/alertas',
      }
    }
    await sendOn(first.channel, first.owner_key, msg)
    await markRows(ids, 'sent')
  } catch (e) {
    await markRows(ids, 'failed', e instanceof Error ? e.message : String(e)).catch(() => undefined)
  }
}

/** Manda lo que ya toca: resúmenes, lo que esperaba a que acabase el silencio o la pausa. */
export async function flushNotifications(): Promise<number> {
  await ensureNotificationTables()
  // Filas atascadas en «enviando» (p. ej. el proceso se reinició a mitad): se reintentan
  await getPool().query(
    `UPDATE notification_outbox SET status = 'pending' WHERE status = 'sending' AND created_at < NOW() - INTERVAL '10 minutes' AND sent_at IS NULL`
  )
  const r = await getPool().query<OutboxRow>(
    `UPDATE notification_outbox SET status = 'sending'
     WHERE id IN (
       SELECT id FROM notification_outbox
       WHERE status = 'pending' AND send_after <= NOW()
       ORDER BY send_after, id LIMIT 300
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  )
  const groups = new Map<string, OutboxRow[]>()
  for (const row of r.rows.sort((a, b) => Number(a.id) - Number(b.id))) {
    const k = `${row.owner_key}|${row.channel}`
    groups.set(k, [...(groups.get(k) ?? []), row])
  }
  for (const rows of Array.from(groups.values())) await deliverRows(rows)
  if (Math.random() < 0.01) {
    void getPool()
      .query(`DELETE FROM notification_outbox WHERE created_at < NOW() - INTERVAL '90 days'`)
      .catch(() => undefined)
  }
  return r.rows.length
}

// ——— Historial ———

export type HistoryRow = {
  fecha: string
  aviso: string
  asunto: string
  canal: string
  estado: string
  motivo: string | null
  sale: string | null
}

const STATUS_ES: Record<string, string> = {
  sent: 'enviado',
  pending: 'en cola',
  sending: 'enviando',
  skipped: 'no enviado',
  failed: 'falló',
}

export async function notificationHistory(ownerKey: string, opts: { event?: string; days?: number; limit?: number } = {}): Promise<HistoryRow[]> {
  await ensureNotificationTables()
  const days = Math.min(Math.max(Number(opts.days) || 7, 1), 90)
  const r = await getPool().query(
    `SELECT event, subject, channel, status, reason, error, created_at, send_after FROM notification_outbox
     WHERE owner_key = $1 AND created_at > NOW() - ($2 || ' days')::interval AND ($3::text IS NULL OR event = $3)
     ORDER BY created_at DESC LIMIT $4`,
    [ownerKey, String(days), opts.event ?? null, Math.min(Math.max(Number(opts.limit) || 40, 1), 200)]
  )
  const fmt = (d: Date) => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })
  return r.rows.map((x) => ({
    fecha: fmt(x.created_at),
    aviso: getEvent(String(x.event))?.nombre ?? String(x.event),
    asunto: String(x.subject),
    canal: String(x.channel),
    estado: STATUS_ES[String(x.status)] ?? String(x.status),
    motivo: x.error ? String(x.error) : x.reason ? String(x.reason) : null,
    sale: x.status === 'pending' ? fmt(x.send_after) : null,
  }))
}

// ——— Planificador ———

declare global {
  // eslint-disable-next-line no-var
  var __buffaloNotifications: boolean | undefined
}

/** Revisa la cola cada minuto (y los avisos diarios del equipo). Una vez por proceso. */
export function startNotificationScheduler(): void {
  if (globalThis.__buffaloNotifications) return
  globalThis.__buffaloNotifications = true
  const run = () => {
    void flushNotifications().catch((e) => console.warn('[avisos] cola', e instanceof Error ? e.message : e))
    // Recordatorios hasta resolver (incidencias, tickets, tareas pedidas). Ya no se recuerdan tareas por defecto.
    void import('./reminders')
      .then((m) => m.tickReminders())
      .catch((e) => console.warn('[avisos] recordatorios', e instanceof Error ? e.message : e))
    void import('./money-alerts')
      .then((m) => m.tickMoneyAlerts())
      .catch((e) => console.warn('[avisos] banco', e instanceof Error ? e.message : e))
  }
  setTimeout(run, 30_000)
  setInterval(run, 60_000)
}
