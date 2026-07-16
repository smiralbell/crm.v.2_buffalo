import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { queryChat } from '@/lib/db-chat'
import { AGENT_CHAT_HISTORY_TABLE } from '@/lib/agent-chat-history'
import { parseAgentChatMessage } from '@/lib/agent-chat-history'
import { listWebFormSubmissions } from '@/lib/marketing/web-form-submissions'
import { listCalBookings } from '@/lib/marketing/cal-bookings'
import { BUFFALO_STAGE_COLORS, defaultStageColor } from '@/lib/pipelines/defaults'
import { isReunionStageName, syncContactToGlobalReunion } from '@/lib/pipelines/global-funnel'

export const WEB_PIPELINE_NAME = 'WEB'
export const WEB_TAG = 'web'

export type WebSourceChannel = 'form' | 'chat' | 'cal'
type LogicalStage = 'LEAD' | 'CONTACTO' | 'REUNION'

const SOURCE_TAG: Record<WebSourceChannel, string> = {
  form: 'web-form',
  chat: 'web-chat',
  cal: 'web-cal',
}

const CHANNEL_LOGICAL: Record<WebSourceChannel, LogicalStage> = {
  form: 'LEAD',
  chat: 'LEAD',
  cal: 'REUNION',
}

let cachedPipelineId: string | null | undefined

function normalizeStage(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

function stageRank(name: string): number {
  const n = normalizeStage(name)
  if (n.includes('REUNION')) return 3
  if (n.includes('CONTACTO') || n === 'CONTACT') return 2
  if (n.includes('LEAD')) return 1
  return 0
}

export async function getWebPipelineId(): Promise<string | null> {
  if (process.env.WEB_PIPELINE_ID?.trim()) return process.env.WEB_PIPELINE_ID.trim()
  if (cachedPipelineId !== undefined) return cachedPipelineId

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM pipelines
    WHERE LOWER(TRIM(name)) = LOWER(${WEB_PIPELINE_NAME})
       OR LOWER(TRIM(name)) LIKE 'web%'
    ORDER BY CASE WHEN LOWER(TRIM(name)) = LOWER(${WEB_PIPELINE_NAME}) THEN 0 ELSE 1 END
    LIMIT 1
  `
  cachedPipelineId = rows[0]?.id ?? null
  return cachedPipelineId
}

export async function isWebPipeline(pipelineId: string): Promise<boolean> {
  return (await getWebPipelineId()) === pipelineId
}

export interface WebPipelineInfo {
  web_pipeline_id: string | null
  web_pipeline_name: string | null
  web_stages: { id: string; name: string }[]
  all_pipelines: { id: string; name: string; entity_type: string }[]
}

export async function getWebPipelineInfo(): Promise<WebPipelineInfo> {
  const all = await prisma.pipelineKanban.findMany({
    select: { id: true, name: true, entity_type: true },
    orderBy: { name: 'asc' },
  })

  const webId = await getWebPipelineId()
  if (!webId) {
    return {
      web_pipeline_id: null,
      web_pipeline_name: null,
      web_stages: [],
      all_pipelines: all.map((p) => ({
        id: p.id,
        name: p.name,
        entity_type: p.entity_type,
      })),
    }
  }

  const web = await prisma.pipelineKanban.findUnique({
    where: { id: webId },
    select: { name: true },
  })

  const stages = await prisma.pipelineStage.findMany({
    where: { pipeline_id: webId },
    select: { id: true, name: true },
    orderBy: { position: 'asc' },
  })

  return {
    web_pipeline_id: webId,
    web_pipeline_name: web?.name ?? WEB_PIPELINE_NAME,
    web_stages: stages,
    all_pipelines: all.map((p) => ({
      id: p.id,
      name: p.name,
      entity_type: p.entity_type,
    })),
  }
}

async function buildStageMap(pipelineId: string): Promise<Map<LogicalStage, string>> {
  const stages = await prisma.pipelineStage.findMany({
    where: { pipeline_id: pipelineId },
    select: { name: true },
    orderBy: { position: 'asc' },
  })

  const map = new Map<LogicalStage, string>()

  for (const stage of stages) {
    const n = normalizeStage(stage.name)
    if (n.includes('LEAD') && !map.has('LEAD')) map.set('LEAD', stage.name)
    if ((n.includes('CONTACTO') || n === 'CONTACT') && !map.has('CONTACTO')) {
      map.set('CONTACTO', stage.name)
    }
    if (n.includes('REUNION') && !map.has('REUNION')) map.set('REUNION', stage.name)
  }

  if (!map.has('LEAD')) map.set('LEAD', stages[0]?.name || 'LEAD')
  if (!map.has('CONTACTO')) map.set('CONTACTO', stages[1]?.name || 'CONTACTO')
  if (!map.has('REUNION')) {
    map.set('REUNION', stages.find((s) => normalizeStage(s.name).includes('REUNION'))?.name || 'REUNIÓN')
  }

  return map
}

async function nextCardPosition(pipelineId: string, stage: string): Promise<number> {
  const last = await prisma.pipelineCard.findFirst({
    where: { pipeline_id: pipelineId, stage, deleted_at: null },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  return last ? last.position + 1 : 0
}

async function findWebCard(pipelineId: string, contactId: number) {
  return prisma.pipelineCard.findFirst({
    where: {
      pipeline_id: pipelineId,
      entity_id: String(contactId),
      deleted_at: null,
    },
  })
}

export async function ensureWebContact(input: {
  nombre?: string | null
  email?: string | null
  telefono?: string | null
  empresa?: string | null
  origen: string
}): Promise<{ contactId: number; leadId: number }> {
  const email = input.email?.trim() || null
  const telefono = input.telefono?.trim() || null
  const nombre = input.nombre?.trim() || email || telefono || 'Lead web'

  let contact = null
  if (email) {
    contact = await prisma.contact.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
  }
  if (!contact && telefono) {
    contact = await prisma.contact.findFirst({ where: { telefono } })
  }

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        nombre,
        email: email || undefined,
        telefono: telefono || undefined,
        empresa: input.empresa?.trim() || undefined,
      },
    })
  } else {
    const updates: Record<string, string> = {}
    if (!contact.nombre && nombre) updates.nombre = nombre
    if (!contact.email && email) updates.email = email
    if (!contact.telefono && telefono) updates.telefono = telefono
    if (!contact.empresa && input.empresa?.trim()) updates.empresa = input.empresa.trim()
    if (Object.keys(updates).length > 0) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: updates,
      })
    }
  }

  let lead = await prisma.lead.findFirst({ where: { contact_id: contact.id } })
  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        contact_id: contact.id,
        estado: input.origen === 'web_cal' ? 'reunion' : 'frio',
        origen_principal: input.origen,
        ultima_interaccion: new Date(),
      },
    })
  } else if (input.origen === 'web_cal' && lead.estado !== 'reunion') {
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: { estado: 'reunion', ultima_interaccion: new Date() },
    })
  }

  return { contactId: contact.id, leadId: lead.id }
}

export async function syncWebContactToPipeline(
  contactId: number,
  channel: WebSourceChannel,
  notes?: string | null,
  stageMap?: Map<LogicalStage, string>
): Promise<string | null> {
  const pipelineId = await getWebPipelineId()
  if (!pipelineId) return null

  const stages = stageMap || (await buildStageMap(pipelineId))
  const logical = CHANNEL_LOGICAL[channel]
  const targetStage = stages.get(logical)
  if (!targetStage) return null

  const sourceTag = SOURCE_TAG[channel]
  const existing = await findWebCard(pipelineId, contactId)

  if (existing) {
    const nextStage =
      stageRank(targetStage) >= stageRank(existing.stage) ? targetStage : existing.stage
    const tags = Array.from(new Set([...existing.tags, WEB_TAG, sourceTag]))
    const position =
      existing.stage === nextStage ? existing.position : await nextCardPosition(pipelineId, nextStage)

    await prisma.pipelineCard.update({
      where: { id: existing.id },
      data: {
        stage: nextStage,
        stage_color: defaultStageColor(nextStage),
        position,
        tags,
        notes: notes?.trim() || existing.notes,
      },
    })

    if (isReunionStageName(nextStage)) {
      void syncContactToGlobalReunion({
        contactId,
        notes: notes?.trim() || existing.notes,
        source: 'web',
      }).catch((err) => console.error('[web] global reunion sync', err))
    }

    return existing.id
  }

  const position = await nextCardPosition(pipelineId, targetStage)
  const card = await prisma.pipelineCard.create({
    data: {
      pipeline_id: pipelineId,
      entity_id: String(contactId),
      entity_type: 'contact',
      stage: targetStage,
      stage_color: BUFFALO_STAGE_COLORS[targetStage] || defaultStageColor(targetStage),
      position,
      tags: [WEB_TAG, sourceTag],
      notes: notes?.trim() || null,
    },
  })

  if (isReunionStageName(targetStage)) {
    void syncContactToGlobalReunion({
      contactId,
      notes: notes?.trim() || null,
      source: 'web',
    }).catch((err) => console.error('[web] global reunion sync', err))
  }

  return card.id
}

export async function syncCalBookingToWebPipeline(input: {
  attendee_name?: string | null
  attendee_email?: string | null
  title?: string | null
  start?: string | null
  uid: string
}): Promise<string | null> {
  const email = input.attendee_email?.trim()
  if (!email) return null

  const { contactId } = await ensureWebContact({
    nombre: input.attendee_name,
    email,
    origen: 'web_cal',
  })

  const notes = [
    input.title,
    input.start ? new Date(input.start).toLocaleString('es-ES') : null,
    `Cal.com ${input.uid}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return syncWebContactToPipeline(contactId, 'cal', notes)
}

export async function syncWebFormToPipeline(submission: {
  id: number
  fullname: string | null
  email: string | null
  company: string | null
  phone: string | null
  service: string | null
  etiqueta: string
}): Promise<string | null> {
  const { contactId } = await ensureWebContact({
    nombre: submission.fullname,
    email: submission.email,
    telefono: submission.phone,
    empresa: submission.company,
    origen: 'formulario_web',
  })

  const notes = [submission.company, submission.service, submission.etiqueta].filter(Boolean).join(' · ')
  return syncWebContactToPipeline(contactId, 'form', notes || `Formulario #${submission.id}`)
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/

async function extractEmailFromChatSession(sessionId: string): Promise<string | null> {
  try {
    const { rows } = await queryChat<{ message: unknown }>(
      `SELECT message FROM ${AGENT_CHAT_HISTORY_TABLE}
       WHERE session_id = $1
       ORDER BY id ASC
       LIMIT 40`,
      [sessionId]
    )
    for (const row of rows) {
      const parsed = parseAgentChatMessage(row.message)
      if (parsed.role !== 'user') continue
      const match = parsed.text.match(EMAIL_RE)
      if (match) return match[0].toLowerCase()
    }
  } catch {
    return null
  }
  return null
}

async function listChatSessionsWithUserReply(limit = 300): Promise<string[]> {
  try {
    const { rows } = await queryChat<{ session_id: string }>(
      `SELECT session_id
       FROM ${AGENT_CHAT_HISTORY_TABLE}
       GROUP BY session_id
       HAVING BOOL_OR(
         COALESCE(message->>'type', '') IN ('human', 'user')
         OR LOWER(COALESCE(message->>'role', '')) IN ('human', 'user')
         OR COALESCE(message #>> '{id,-1}', '') = 'HumanMessage'
       )
       ORDER BY MAX(id) DESC
       LIMIT $1`,
      [limit]
    )
    return rows.map((r) => r.session_id)
  } catch {
    return []
  }
}

async function isChatSessionSynced(sessionId: string): Promise<boolean> {
  try {
    const result = await query<{ pipeline_card_id: string | null }>(
      `SELECT pipeline_card_id FROM web_chat_pipeline_sync WHERE session_id = $1 LIMIT 1`,
      [sessionId]
    )
    return !!result.rows[0]?.pipeline_card_id
  } catch {
    return false
  }
}

async function markChatSessionSynced(sessionId: string, contactId: number, cardId: string | null): Promise<void> {
  try {
    await query(
      `INSERT INTO web_chat_pipeline_sync (session_id, contact_id, pipeline_card_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id) DO UPDATE SET
         contact_id = EXCLUDED.contact_id,
         pipeline_card_id = EXCLUDED.pipeline_card_id,
         synced_at = NOW()`,
      [sessionId, contactId, cardId]
    )
  } catch {
    // tabla opcional
  }
}

export async function syncChatSessionToWebPipeline(sessionId: string): Promise<string | null> {
  if (await isChatSessionSynced(sessionId)) return null

  const email = await extractEmailFromChatSession(sessionId)
  const { contactId } = await ensureWebContact({
    nombre: email ? undefined : `Chat web ${sessionId.slice(0, 8)}`,
    email,
    origen: 'web_chat',
  })

  const cardId = await syncWebContactToPipeline(
    contactId,
    'chat',
    email ? `Widget web · ${sessionId.slice(0, 12)}` : `Sesión chat ${sessionId.slice(0, 12)}`
  )
  if (cardId) await markChatSessionSynced(sessionId, contactId, cardId)
  return cardId
}

export interface WebPipelineSyncResult {
  synced: number
  errors: string[]
}

/** Sincroniza formularios, calendario y chat al pipeline WEB. */
export async function syncAllWebSourcesToPipeline(period?: string): Promise<WebPipelineSyncResult> {
  const pipelineId = await getWebPipelineId()
  if (!pipelineId) {
    return { synced: 0, errors: ['Pipeline WEB no encontrado. Crea uno llamado WEB o define WEB_PIPELINE_ID.'] }
  }

  const stageMap = await buildStageMap(pipelineId)
  let synced = 0
  const errors: string[] = []
  const now = new Date()
  const currentPeriod = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const forms = await listWebFormSubmissions(currentPeriod, 500)
  for (const form of forms) {
    try {
      const cardId = await syncWebFormToPipeline(form)
      if (cardId) synced++
    } catch (e) {
      errors.push(`Form #${form.id}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  const bookings = await listCalBookings(currentPeriod, 500)
  for (const booking of bookings) {
    if (booking.status === 'cancelled' || booking.status === 'rejected') continue
    try {
      const cardId = await syncCalBookingToWebPipeline({
        uid: booking.uid,
        attendee_name: booking.attendee_name,
        attendee_email: booking.attendee_email,
        title: booking.title,
        start: booking.start,
      })
      if (cardId) synced++
    } catch (e) {
      errors.push(`Cal ${booking.uid}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  const sessions = await listChatSessionsWithUserReply(200)
  for (const sessionId of sessions) {
    try {
      const cardId = await syncChatSessionToWebPipeline(sessionId)
      if (cardId) synced++
    } catch (e) {
      errors.push(`Chat ${sessionId.slice(0, 8)}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  return { synced, errors }
}
