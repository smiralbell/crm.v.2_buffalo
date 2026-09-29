/**
 * Gmail → historial CRM.
 * Lee los correos nuevos de cada buzón Google conectado (scope gmail.readonly) y,
 * si algún remitente/destinatario externo es un contacto del CRM, deja el correo
 * en su historial (crm_activities kind='email'). Correos sin contacto no se guardan.
 * El contexto IA los recoge desde el historial (buildCrmContextSources).
 */

import { google, type gmail_v1 } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { contactIdsWithEmail, logEmailActivity } from '@/lib/crm/activities'
import { isInternalParticipantEmail } from '@/lib/integrations/fireflies/match'
import {
  getAuthorizedCalendarClient,
  GoogleReauthRequiredError,
} from '@/lib/integrations/google/calendar-client'
import { hasGmailScope } from '@/lib/integrations/google/oauth'
import {
  listActiveConnectionsForGmail,
  markNeedsReauth,
  setGmailSyncedAt,
  type GmailSyncConnection,
} from '@/lib/integrations/google/store'

const BODY_MAX_CHARS = 4000
const MAX_MESSAGES_PER_RUN = 400
/** Solape entre ejecuciones para no perder correos en el borde (el índice único deduplica). */
const CURSOR_OVERLAP_MS = 10 * 60 * 1000

function initialLookbackMs(): number {
  const days = Number(process.env.GMAIL_SYNC_INITIAL_DAYS || 30)
  const safe = Number.isFinite(days) && days > 0 ? days : 30
  return safe * 24 * 60 * 60 * 1000
}

export type GmailSyncResult = {
  ownerKey: string
  mailbox: string | null
  scanned: number
  matched: number
  inserted: number
  skipped?: string
  error?: string
}

function header(msg: gmail_v1.Schema$Message, name: string): string {
  const h = msg.payload?.headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase())
  return h?.value?.trim() || ''
}

const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export function extractEmails(value: string): string[] {
  return Array.from(new Set((value.match(EMAIL_RE) || []).map((e) => e.toLowerCase())))
}

/** "Nombre Apellido <a@b.com>" → "Nombre Apellido" (o el email si no hay nombre). */
export function displayName(fromHeader: string): string {
  const m = fromHeader.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/)
  if (m && m[1].trim()) return m[1].trim()
  return extractEmails(fromHeader)[0] || fromHeader
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function findPart(
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string
): string | null {
  if (!part) return null
  if (part.mimeType === mimeType && part.body?.data) return decodeBase64Url(part.body.data)
  for (const child of part.parts || []) {
    const found = findPart(child, mimeType)
    if (found) return found
  }
  return null
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** Quita el hilo citado ("El ... escribió:", "> ...") para quedarnos con lo nuevo. */
export function stripQuotedReply(text: string): string {
  const cutMarkers = [
    /^\s*El .{0,200}escribió:?\s*$/im,
    /^\s*On .{0,200}wrote:?\s*$/im,
    /^\s*-{2,}\s*(Original Message|Mensaje original)\s*-{2,}/im,
    /^\s*De:\s.+\n\s*(Enviado|Fecha|Sent):/im,
    /^\s*From:\s.+\n\s*(Sent|Date):/im,
  ]
  let out = text
  for (const re of cutMarkers) {
    const m = re.exec(out)
    if (m && m.index > 0) out = out.slice(0, m.index)
  }
  return out
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('>'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function messageBody(msg: gmail_v1.Schema$Message): string {
  const plain = findPart(msg.payload, 'text/plain')
  const html = plain ? null : findPart(msg.payload, 'text/html')
  const raw = plain ?? (html ? htmlToText(html) : msg.snippet || '')
  const clean = stripQuotedReply(raw.replace(/\r\n/g, '\n'))
  return clean.length > BODY_MAX_CHARS ? `${clean.slice(0, BODY_MAX_CHARS)}…` : clean
}

type ContactHit = { contactId: number; leadId: number | null }

async function contactsByEmail(emails: string[]): Promise<ContactHit[]> {
  if (!emails.length) return []
  const contacts = await prisma.contact.findMany({
    where: {
      OR: emails.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
    },
    select: {
      id: true,
      leads: { take: 1, orderBy: { updated_at: 'desc' }, select: { id: true } },
    },
  })
  return contacts.map((c) => ({ contactId: c.id, leadId: c.leads[0]?.id ?? null }))
}

async function listMessageIds(
  gmail: gmail_v1.Gmail,
  afterEpochSec: number
): Promise<string[]> {
  const q = `after:${afterEpochSec} -in:spam -in:trash -in:chats -in:draft -category:promotions -category:social`
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: 100,
      pageToken,
    })
    for (const m of res.data.messages || []) if (m.id) ids.push(m.id)
    pageToken = res.data.nextPageToken || undefined
  } while (pageToken && ids.length < MAX_MESSAGES_PER_RUN)
  return ids.slice(0, MAX_MESSAGES_PER_RUN)
}

async function syncMailbox(conn: GmailSyncConnection): Promise<GmailSyncResult> {
  const result: GmailSyncResult = {
    ownerKey: conn.owner_key,
    mailbox: conn.google_email,
    scanned: 0,
    matched: 0,
    inserted: 0,
  }
  if (!hasGmailScope(conn.scopes)) {
    return { ...result, skipped: 'sin_permiso_gmail' }
  }

  const runStartedAt = new Date()
  const since = conn.gmail_synced_at
    ? conn.gmail_synced_at.getTime() - CURSOR_OVERLAP_MS
    : Date.now() - initialLookbackMs()

  const { auth } = await getAuthorizedCalendarClient(conn.owner_key)
  const gmail = google.gmail({ version: 'v1', auth })
  const mailbox = conn.google_email?.toLowerCase() || null

  // Tope por pasada: en la primera sync (30 días) se quedan los más recientes.
  const ids = await listMessageIds(gmail, Math.floor(since / 1000))

  for (const id of ids) {
    result.scanned += 1
    const meta = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID'],
    })
    const msg = meta.data
    const from = header(msg, 'From')
    const to = header(msg, 'To')
    const cc = header(msg, 'Cc')
    const fromEmail = extractEmails(from)[0] || null

    const external = extractEmails([from, to, cc].join(', ')).filter(
      (e) => e !== mailbox && !isInternalParticipantEmail(e)
    )
    const hits = await contactsByEmail(external)
    if (!hits.length) continue
    result.matched += 1

    const messageId = header(msg, 'Message-ID') || `gmail:${id}`
    const already = await contactIdsWithEmail(messageId)
    const pending = hits.filter((h) => !already.has(h.contactId))
    if (!pending.length) continue

    const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
    const body = messageBody(full.data)
    const subject = header(msg, 'Subject') || '(sin asunto)'
    const outgoing = Boolean(
      fromEmail && (fromEmail === mailbox || isInternalParticipantEmail(fromEmail))
    )
    const sentAt = msg.internalDate ? new Date(Number(msg.internalDate)) : new Date()
    const title = outgoing
      ? `Correo enviado · ${subject}`
      : `Correo de ${displayName(from)} · ${subject}`

    for (const hit of pending) {
      const ok = await logEmailActivity({
        contactId: hit.contactId,
        leadId: hit.leadId,
        messageId,
        title,
        body: body || null,
        sentAt,
        createdBy: conn.google_email,
        meta: {
          source: 'gmail',
          direction: outgoing ? 'out' : 'in',
          subject,
          from,
          to,
          cc: cc || null,
          gmail_id: id,
          thread_id: msg.threadId || null,
          mailbox: conn.google_email,
        },
      })
      if (ok) result.inserted += 1
    }
  }

  await setGmailSyncedAt(conn.owner_key, runStartedAt)
  return result
}

/** Sincroniza todos los buzones conectados (o solo uno si se pasa ownerKey). */
export async function syncGmailToCrm(opts?: { ownerKey?: string }): Promise<GmailSyncResult[]> {
  const connections = (await listActiveConnectionsForGmail()).filter(
    (c) => !opts?.ownerKey || c.owner_key === opts.ownerKey
  )
  const results: GmailSyncResult[] = []
  for (const conn of connections) {
    try {
      results.push(await syncMailbox(conn))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const code =
        typeof e === 'object' && e && 'code' in e ? Number((e as { code?: number }).code) : 0
      if (!(e instanceof GoogleReauthRequiredError) && (msg.includes('invalid_grant') || code === 401)) {
        await markNeedsReauth(conn.owner_key)
      }
      console.warn(`[gmail-sync] ${conn.google_email || conn.owner_key}:`, msg)
      results.push({
        ownerKey: conn.owner_key,
        mailbox: conn.google_email,
        scanned: 0,
        matched: 0,
        inserted: 0,
        error: msg,
      })
    }
  }
  return results
}
