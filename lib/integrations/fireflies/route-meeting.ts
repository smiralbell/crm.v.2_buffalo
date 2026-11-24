/**
 * Tras sincronizar una reunión Fireflies:
 * 1) Si ya hay lead o contacto → deja el resumen y el enlace en la ficha (crm_activities)
 *    del contacto. Así la reunión aparece en el contexto de la persona.
 * 2) Si el correo de algún participante coincide con un único lead/contacto → se enlaza.
 * 3) Si no hay coincidencia clara → queda pendiente de enlazar a mano.
 *
 * No crea notas de onboarding ni proyectos automáticamente.
 */

import { prisma } from '@/lib/prisma'
import { logCrmActivity } from '@/lib/crm/activities'
import { matchCrmFromParticipants } from '@/lib/integrations/fireflies/match'
import { buildMeetingFichaBody } from '@/lib/integrations/fireflies/note-from-meeting'
import { linkMeetingToLead } from '@/lib/integrations/fireflies/store'
import type { MeetingRecordingRow } from '@/lib/integrations/fireflies/store'

export type RouteMeetingResult = {
  ok: boolean
  action: 'skipped' | 'contact_ficha' | 'pending_match' | 'error'
  leadId?: number | null
  contactId?: number | null
  reason?: string
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

/** Crea o actualiza la ficha de la reunión en el historial del contacto. */
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
      /* si falla, se crea de nuevo abajo */
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

/** Enruta una reunión ya guardada: enlace al CRM y ficha en el historial. */
export async function routeFirefliesMeeting(meeting: MeetingRecordingRow): Promise<RouteMeetingResult> {
  try {
    if (meeting.status === 'ignored') {
      return { ok: true, action: 'skipped', reason: 'ignored' }
    }

    // Enlace manual o ya casado con un lead concreto: se respeta.
    if (meeting.lead_id && meeting.status === 'matched') {
      const contactId =
        meeting.contact_id ||
        (
          await prisma.lead.findUnique({
            where: { id: meeting.lead_id },
            select: { contact_id: true },
          })
        )?.contact_id
      if (!contactId) return { ok: false, action: 'error', reason: 'lead sin contacto' }
      await writeFichaActivity({ contactId, leadId: meeting.lead_id, meeting })
      return { ok: true, action: 'contact_ficha', contactId, leadId: meeting.lead_id }
    }

    const match = await matchCrmFromParticipants(meeting.participants || [])

    if (match.kind === 'none') {
      return { ok: true, action: 'pending_match', reason: 'sin_email_crm' }
    }

    if (match.kind === 'contact_only') {
      await writeFichaActivity({ contactId: match.contactId, leadId: null, meeting })
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
      return { ok: true, action: 'contact_ficha', contactId: match.contactId, leadId: null, reason: match.email }
    }

    if (match.kind === 'lead') {
      await linkMeetingToLead(meeting.id, match.leadId, match.contactId, `email:${match.email}`)
      await writeFichaActivity({ contactId: match.contactId, leadId: match.leadId, meeting })
      return { ok: true, action: 'contact_ficha', contactId: match.contactId, leadId: match.leadId, reason: match.email }
    }

    // ambiguous_leads: solo se enlaza si queda un único lead real.
    const leads = await prisma.lead.findMany({
      where: { id: { in: match.leadIds } },
      select: { id: true, contact_id: true },
    })
    if (leads.length !== 1) {
      return { ok: true, action: 'pending_match', reason: 'varios_leads' }
    }
    const only = leads[0]
    await linkMeetingToLead(meeting.id, only.id, only.contact_id, 'email:unico_lead')
    await writeFichaActivity({ contactId: only.contact_id, leadId: only.id, meeting })
    return { ok: true, action: 'contact_ficha', contactId: only.contact_id, leadId: only.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[fireflies/route-meeting]', msg)
    return { ok: false, action: 'error', reason: msg }
  }
}

/** Re-enruta tras un enlace manual desde la bandeja. */
export async function routeAfterManualLink(meeting: MeetingRecordingRow): Promise<RouteMeetingResult> {
  return routeFirefliesMeeting(meeting)
}
