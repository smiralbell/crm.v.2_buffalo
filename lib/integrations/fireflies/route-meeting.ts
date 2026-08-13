/**
 * Tras sincronizar una reunión Fireflies:
 * 1) Siempre deja resumen + enlace en la ficha (crm_activities) del contacto/lead.
 * 2) Si hay lead:
 *    - 0 onboarding → crea onboarding (auditoría) + nota de reunión
 *    - 1 onboarding → nota nueva (o actualiza si ya existe el marker)
 *    - N leads/onboardings → IA elige lead o avisa create_new
 * 3) Solo contacto (sin lead) → solo ficha, sin cuaderno.
 */

import { prisma } from '@/lib/prisma'
import { logCrmActivity } from '@/lib/crm/activities'
import {
  isValidConfiguradorConfig,
  parseConfiguradorConfig,
} from '@/lib/engranaje5/map-config'
import { persistAuditProjectForLead } from '@/lib/onboarding/audit/persist-project'
import {
  createNote,
  listNotes,
  updateNote,
} from '@/lib/onboarding/notes/store'
import { syncNotebookContextLightweight } from '@/lib/onboarding/notes/sync-context'
import {
  openRouterChatCompletion,
  parseJsonFromModelOutput,
  resolveModel,
} from '@/lib/openrouter'
import { matchCrmFromParticipants } from '@/lib/integrations/fireflies/match'
import {
  buildMeetingFichaBody,
  buildMeetingNoteBody,
  buildMeetingNoteTitle,
  noteMentionsFireflies,
} from '@/lib/integrations/fireflies/note-from-meeting'
import type { MeetingRecordingRow } from '@/lib/integrations/fireflies/store'
import { linkMeetingToLead } from '@/lib/integrations/fireflies/store'

export type RouteMeetingResult = {
  ok: boolean
  action:
    | 'skipped'
    | 'contact_ficha'
    | 'note_existing_onboarding'
    | 'created_onboarding_and_note'
    | 'ai_routed_note'
    | 'ai_created_onboarding'
    | 'pending_match'
    | 'error'
  leadId?: number | null
  contactId?: number | null
  noteId?: string | null
  reason?: string
}

type OnboardingCandidate = {
  leadId: number
  contactId: number
  email: string | null
  empresa: string | null
  nombre: string | null
  projectName: string
  serviceType: string | null
  hasOnboarding: boolean
  contextSnippet: string
  notesSnippet: string
}

function logRoute(step: string, data?: Record<string, unknown>) {
  console.log(`[fireflies/route] ${step}`, data ? JSON.stringify(data) : '')
}

async function leadHasOnboarding(leadId: number): Promise<boolean> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { configuracion: true },
  })
  if (!lead) return false
  if (isValidConfiguradorConfig(parseConfiguradorConfig(lead.configuracion))) {
    return true
  }
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM proyectos WHERE lead_id = ${leadId}
  `
  return (rows[0]?.n || 0) > 0
}

async function loadCandidates(leadIds: number[]): Promise<OnboardingCandidate[]> {
  if (!leadIds.length) return []
  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    include: {
      contact: {
        select: { id: true, email: true, empresa: true, nombre: true },
      },
    },
  })

  const out: OnboardingCandidate[] = []
  for (const lead of leads) {
    const cfg = parseConfiguradorConfig(lead.configuracion)
    const hasCfg = isValidConfiguradorConfig(cfg)
    const proyectos = await prisma.$queryRaw<
      { name: string; service_type: string | null }[]
    >`
      SELECT name, service_type FROM proyectos
      WHERE lead_id = ${lead.id}
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 3
    `
    let notesSnippet = ''
    try {
      const notes = await listNotes(lead.id)
      notesSnippet = notes
        .slice(0, 3)
        .map((n) => `${n.title}: ${n.body.slice(0, 280)}`)
        .join('\n---\n')
        .slice(0, 1200)
    } catch {
      notesSnippet = ''
    }

    const contextSnippet = [
      cfg?.description,
      cfg?.project_context,
      cfg?.title,
      cfg?.onboarding_notes,
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 1500)

    out.push({
      leadId: lead.id,
      contactId: lead.contact_id,
      email: lead.contact?.email ?? null,
      empresa: lead.contact?.empresa ?? null,
      nombre: lead.contact?.nombre ?? null,
      projectName:
        proyectos[0]?.name ||
        cfg?.title ||
        lead.contact?.empresa ||
        `Lead #${lead.id}`,
      serviceType: proyectos[0]?.service_type || cfg?.service_type || null,
      hasOnboarding: hasCfg || proyectos.length > 0,
      contextSnippet,
      notesSnippet,
    })
  }
  return out
}

async function findExistingFirefliesNote(
  leadId: number,
  firefliesId: string
): Promise<{ id: string } | null> {
  try {
    const notes = await listNotes(leadId)
    const hit = notes.find((n) => noteMentionsFireflies(n.body, firefliesId))
    return hit ? { id: hit.id } : null
  } catch {
    return null
  }
}

async function upsertMeetingNote(
  leadId: number,
  meeting: MeetingRecordingRow
): Promise<string> {
  const title = buildMeetingNoteTitle(meeting)
  const body = buildMeetingNoteBody(meeting)
  const existing = await findExistingFirefliesNote(leadId, meeting.fireflies_id)
  if (existing) {
    await updateNote(existing.id, { title, body, type: 'reunion' })
    await syncNotebookContextLightweight({ leadId, applyDefinition: false })
    return existing.id
  }
  const note = await createNote({
    lead_id: leadId,
    type: 'reunion',
    title,
    body,
    created_by: 'fireflies',
    note_date: meeting.started_at
      ? meeting.started_at.toISOString().slice(0, 10)
      : undefined,
  })
  await syncNotebookContextLightweight({ leadId, applyDefinition: false })
  return note.id
}

async function findFichaActivityId(firefliesId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ id: bigint | number | string }[]>(
      `SELECT id FROM crm_activities
       WHERE created_by = 'fireflies'
         AND meta->>'fireflies_id' = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      firefliesId
    )
    return rows[0] ? String(rows[0].id) : null
  } catch {
    return null
  }
}

async function writeFichaActivity(input: {
  contactId: number
  leadId?: number | null
  meeting: MeetingRecordingRow
}): Promise<void> {
  const title = input.meeting.title?.trim()
    ? `Reunión Fireflies: ${input.meeting.title.trim()}`
    : 'Reunión Fireflies'
  const body = buildMeetingFichaBody(input.meeting)
  const meta = {
    source: 'fireflies',
    fireflies_id: input.meeting.fireflies_id,
    meeting_recording_id: input.meeting.id,
    transcript_url: input.meeting.transcript_url,
    meeting_link: input.meeting.meeting_link,
  }
  const existingId = await findFichaActivityId(input.meeting.fireflies_id)
  if (existingId) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE crm_activities
         SET contact_id = $2,
             lead_id = $3,
             title = $4,
             body = $5,
             meta = $6::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        BigInt(existingId),
        input.contactId,
        input.leadId ?? null,
        title,
        body,
        JSON.stringify(meta)
      )
      return
    } catch {
      /* fall through to create */
    }
  }
  await logCrmActivity({
    contactId: input.contactId,
    leadId: input.leadId ?? null,
    kind: 'meeting',
    title,
    body,
    meta,
    createdBy: 'fireflies',
  })
}

async function ensureOnboarding(leadId: number): Promise<boolean> {
  const has = await leadHasOnboarding(leadId)
  if (has) return false
  const res = await persistAuditProjectForLead(leadId)
  return Boolean(res.ok && !res.skipped)
}

type AiRouteDecision = {
  action: 'use_lead' | 'create_new'
  leadId: number
  reason: string
}

async function aiPickOnboarding(input: {
  meeting: MeetingRecordingRow
  candidates: OnboardingCandidate[]
}): Promise<AiRouteDecision> {
  const fallback: AiRouteDecision = {
    action: input.candidates.some((c) => c.hasOnboarding)
      ? 'use_lead'
      : 'create_new',
    leadId: input.candidates[0].leadId,
    reason: 'fallback_sin_ia',
  }

  if (!process.env.OPENROUTER_API_KEY?.trim()) return fallback

  const meetingBrief = [
    `Título: ${input.meeting.title || '(sin título)'}`,
    `Fecha: ${input.meeting.started_at?.toISOString() || 'n/d'}`,
    `Resumen:\n${(input.meeting.summary_overview || '').slice(0, 2500)}`,
    `Action items:\n${(input.meeting.summary_action_items || '').slice(0, 800)}`,
    `Transcripción (recorte):\n${(input.meeting.transcript || '').slice(0, 3500)}`,
  ].join('\n\n')

  const projectsBrief = input.candidates
    .map(
      (c, i) =>
        `[${i + 1}] leadId=${c.leadId} contactId=${c.contactId}
empresa=${c.empresa || '-'} nombre=${c.nombre || '-'} email=${c.email || '-'}
proyecto=${c.projectName} tipo=${c.serviceType || '-'} hasOnboarding=${c.hasOnboarding}
contexto:\n${c.contextSnippet || '(vacío)'}
notas recientes:\n${c.notesSnippet || '(ninguna)'}`
    )
    .join('\n\n====\n\n')

  try {
    const raw = await openRouterChatCompletion(
      [
        {
          role: 'system',
          content: `Eres el router de reuniones del CRM Buffalo.
Te dan una transcripción/resumen de Fireflies y varios proyectos/leads del mismo cliente o invitados.
Decide:
- "use_lead": la reunión pertenece a un onboarding/proyecto ya existente → elige su leadId
- "create_new": es un hilo distinto (nuevo proyecto) → elige el leadId sobre el que crear onboarding nuevo (normalmente el contacto principal de la llamada)

Responde SOLO JSON: {"action":"use_lead"|"create_new","leadId":number,"reason":"string corta"}`,
        },
        {
          role: 'user',
          content: `REUNIÓN:\n${meetingBrief}\n\nCANDIDATOS:\n${projectsBrief}`,
        },
      ],
      { model: resolveModel('fast'), temperature: 0.1, json: true }
    )
    const parsed = parseJsonFromModelOutput(raw) as {
      action?: string
      leadId?: number
      reason?: string
    } | null
    const leadId = Number(parsed?.leadId)
    const action =
      parsed?.action === 'create_new' ? 'create_new' : 'use_lead'
    if (
      !Number.isFinite(leadId) ||
      !input.candidates.some((c) => c.leadId === leadId)
    ) {
      return fallback
    }
    return {
      action,
      leadId,
      reason: String(parsed?.reason || 'ia').slice(0, 240),
    }
  } catch (e) {
    logRoute('ai_pick_failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return fallback
  }
}

async function findSiblingLeadIds(
  contactId: number,
  primaryLeadId: number
): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ lead_id: number | null }[]>`
    SELECT DISTINCT lead_id FROM proyectos
    WHERE contact_id = ${contactId}
      AND lead_id IS NOT NULL
      AND lead_id <> ${primaryLeadId}
  `
  return rows
    .map((r) => Number(r.lead_id))
    .filter((id) => Number.isFinite(id) && id > 0)
}

async function applyLeadRoute(
  leadId: number,
  contactId: number,
  meeting: MeetingRecordingRow,
  opts?: { forceCreateOnboarding?: boolean; reason?: string; actionLabel?: RouteMeetingResult['action'] }
): Promise<RouteMeetingResult> {
  await writeFichaActivity({ contactId, leadId, meeting })

  const had = await leadHasOnboarding(leadId)
  let created = false
  if (!had) {
    created = await ensureOnboarding(leadId)
  } else if (opts?.forceCreateOnboarding) {
    await logCrmActivity({
      contactId,
      leadId,
      kind: 'alert',
      title: 'Fireflies: posible nuevo proyecto',
      body: `La IA sugiere que esta reunión no encaja del todo en el onboarding actual. Revisa el cuaderno y decide si abrir un proyecto nuevo.\nMotivo: ${opts.reason || 'create_new'}`,
      meta: {
        source: 'fireflies',
        fireflies_id: meeting.fireflies_id,
        suggested_action: 'create_new_onboarding',
      },
      createdBy: 'fireflies',
    })
  }

  const noteId = await upsertMeetingNote(leadId, meeting)

  return {
    ok: true,
    action:
      opts?.actionLabel ||
      (created
        ? 'created_onboarding_and_note'
        : 'note_existing_onboarding'),
    leadId,
    contactId,
    noteId,
    reason: opts?.reason,
  }
}

/**
 * Enruta una reunión ya upsertada: match CRM + ficha + nota/onboarding.
 * Idempotente por marker fireflies en la nota y meta en actividad.
 */
export async function routeFirefliesMeeting(
  meeting: MeetingRecordingRow
): Promise<RouteMeetingResult> {
  try {
    if (meeting.status === 'ignored') {
      return { ok: true, action: 'skipped', reason: 'ignored' }
    }

    // Link manual / ya matcheado a un lead concreto → respeta lead_id
    if (meeting.lead_id && meeting.status === 'matched') {
      const contactId =
        meeting.contact_id ||
        (
          await prisma.lead.findUnique({
            where: { id: meeting.lead_id },
            select: { contact_id: true },
          })
        )?.contact_id
      if (!contactId) {
        return { ok: false, action: 'error', reason: 'lead sin contacto' }
      }

      const siblingIds = await findSiblingLeadIds(contactId, meeting.lead_id)
      if (siblingIds.length > 0) {
        const multi = await loadCandidates(
          Array.from(new Set([meeting.lead_id, ...siblingIds]))
        )
        const withOnboarding = multi.filter((c) => c.hasOnboarding)
        if (withOnboarding.length > 1) {
          const decision = await aiPickOnboarding({ meeting, candidates: multi })
          const chosen =
            multi.find((c) => c.leadId === decision.leadId) || multi[0]
          await linkMeetingToLead(
            meeting.id,
            chosen.leadId,
            chosen.contactId,
            `ai:${decision.action}:${decision.reason}`
          )
          return applyLeadRoute(chosen.leadId, chosen.contactId, meeting, {
            forceCreateOnboarding: decision.action === 'create_new',
            reason: decision.reason,
            actionLabel:
              decision.action === 'create_new'
                ? 'ai_created_onboarding'
                : 'ai_routed_note',
          })
        }
      }

      return applyLeadRoute(meeting.lead_id, contactId, meeting, {
        reason: meeting.match_reason || 'prematched',
      })
    }

    const match = await matchCrmFromParticipants(meeting.participants || [])
    logRoute('match', { kind: match.kind, fireflies_id: meeting.fireflies_id })

    if (match.kind === 'none') {
      return { ok: true, action: 'pending_match', reason: 'sin_email_crm' }
    }

    if (match.kind === 'contact_only') {
      await writeFichaActivity({
        contactId: match.contactId,
        leadId: null,
        meeting,
      })
      await prisma.$executeRawUnsafe(
        `UPDATE meeting_recordings
         SET contact_id = $2,
             lead_id = NULL,
             status = 'matched',
             match_reason = $3,
             updated_at = NOW()
         WHERE id = $1::uuid`,
        meeting.id,
        match.contactId,
        `contact_only:${match.email}`
      )
      return {
        ok: true,
        action: 'contact_ficha',
        contactId: match.contactId,
        leadId: null,
        reason: match.email,
      }
    }

    if (match.kind === 'lead') {
      await linkMeetingToLead(
        meeting.id,
        match.leadId,
        match.contactId,
        `email:${match.email}`
      )
      const siblingIds = await findSiblingLeadIds(match.contactId, match.leadId)
      if (siblingIds.length > 0) {
        const multi = await loadCandidates(
          Array.from(new Set([match.leadId, ...siblingIds]))
        )
        if (multi.filter((c) => c.hasOnboarding).length > 1) {
          const decision = await aiPickOnboarding({ meeting, candidates: multi })
          const chosen =
            multi.find((c) => c.leadId === decision.leadId) || multi[0]
          await linkMeetingToLead(
            meeting.id,
            chosen.leadId,
            chosen.contactId,
            `ai:${decision.action}:${decision.reason}`
          )
          return applyLeadRoute(chosen.leadId, chosen.contactId, meeting, {
            forceCreateOnboarding: decision.action === 'create_new',
            reason: decision.reason,
            actionLabel:
              decision.action === 'create_new'
                ? 'ai_created_onboarding'
                : 'ai_routed_note',
          })
        }
      }
      return applyLeadRoute(match.leadId, match.contactId, meeting, {
        reason: match.email,
      })
    }

    // ambiguous_leads
    const candidates = await loadCandidates(match.leadIds)
    if (!candidates.length) {
      return { ok: true, action: 'pending_match', reason: 'leads_no_encontrados' }
    }

    if (candidates.length === 1) {
      const c = candidates[0]
      await linkMeetingToLead(
        meeting.id,
        c.leadId,
        c.contactId,
        `email:${c.email || 'match'}`
      )
      return applyLeadRoute(c.leadId, c.contactId, meeting)
    }

    const decision = await aiPickOnboarding({ meeting, candidates })
    const chosen =
      candidates.find((c) => c.leadId === decision.leadId) || candidates[0]
    await linkMeetingToLead(
      meeting.id,
      chosen.leadId,
      chosen.contactId,
      `ai:${decision.action}:${decision.reason}`
    )
    return applyLeadRoute(chosen.leadId, chosen.contactId, meeting, {
      forceCreateOnboarding: decision.action === 'create_new',
      reason: decision.reason,
      actionLabel:
        decision.action === 'create_new'
          ? 'ai_created_onboarding'
          : 'ai_routed_note',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logRoute('error', { error: msg, fireflies_id: meeting.fireflies_id })
    return { ok: false, action: 'error', reason: msg }
  }
}

/** Re-enruta tras link manual desde inbox. */
export async function routeAfterManualLink(
  meeting: MeetingRecordingRow
): Promise<RouteMeetingResult> {
  return routeFirefliesMeeting(meeting)
}
