import { prisma } from '@/lib/prisma'
import { parseMeetingDateFromNotas } from '@/lib/coldcall/meeting-datetime'
import type { ColdCallScope } from '@/lib/coldcall/scope'
import { getScopeFilterParams } from '@/lib/coldcall/scope'

/** Ventana en la que el caller debe confirmar la reunión (días antes). */
export const CONFIRM_WINDOW_DAYS = 2
/** Ventana de avisos de preparar demo para admin (días). */
export const DEMO_PREP_WINDOW_DAYS = 7

export type ReunionConfirmStatus = 'pending' | 'confirmed' | 'rescheduled' | 'cancelled'
export type DemoPrepStatus = 'pending' | 'ready' | 'done'

export interface MeetingReminderRow {
  call_id: number
  prospect_id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  campaign_id: number | null
  campaign_name: string | null
  at: string
  notas: string | null
  prospect_notas: string | null
  sector: string | null
  confirm_status: ReunionConfirmStatus | null
  demo_prep_status: DemoPrepStatus | null
  tips: string[]
}

function demoTipsForSector(sector: string | null | undefined): string[] {
  const base = [
    'Revisa las notas del caller y el contexto del despacho.',
    'Prepara una demo personalizada (casos reales de su sector).',
    'Ten claro el siguiente paso: propuesta / onboarding.',
  ]
  const s = (sector || '').toLowerCase()
  if (s.includes('abogad') || s.includes('jurid') || s.includes('despacho')) {
    return [
      ...base,
      'Enfoca la demo en cualificación de leads y filtrado de consultas no viables.',
      'Muestra atención 24/7 y transferencia a humano cuando haga falta.',
    ]
  }
  if (s.includes('clinic') || s.includes('salud') || s.includes('medic')) {
    return [
      ...base,
      'Enfoca en citas, triaje y reducción de carga en recepción.',
    ]
  }
  if (s.includes('inmobil')) {
    return [
      ...base,
      'Enfoca en cualificación de interés compra/alquiler y seguimiento rápido.',
    ]
  }
  return base
}

export function canSeeDemoPrepReminders(user: {
  role: string
  email?: string | null
}): boolean {
  if (user.role === 'admin') return true
  const raw = process.env.COLDCALL_DEMO_PREP_EMAILS || ''
  const allow = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (!allow.length) return false
  const email = (user.email || '').trim().toLowerCase()
  return Boolean(email && allow.includes(email))
}

type RawMeeting = {
  call_id: number
  prospect_id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  campaign_id: number | null
  campaign_name: string | null
  at: Date | null
  notas: string | null
  prospect_notas: string | null
  sector: string | null
  confirm_status: string | null
  demo_prep_status: string | null
}

async function queryScopedMeetings(scope: ColdCallScope): Promise<RawMeeting[]> {
  const { userId, teamIds, legacyAdmin } = getScopeFilterParams(scope)

  return prisma.$queryRaw<RawMeeting[]>`
    SELECT
      lc.call_id,
      p.id AS prospect_id,
      p.nombre,
      p.empresa,
      p.telefono,
      p.email,
      camp.id AS campaign_id,
      camp.name AS campaign_name,
      lc.reunion_fecha AS at,
      lc.notas,
      p.notas AS prospect_notas,
      p.sector,
      lc.reunion_confirm_status AS confirm_status,
      lc.demo_prep_status
    FROM coldcall_prospects p
    LEFT JOIN coldcall_campaigns camp ON camp.id = p.campaign_id
    INNER JOIN LATERAL (
      SELECT
        id AS call_id,
        reunion_fecha,
        notas,
        reunion_confirm_status,
        demo_prep_status
      FROM coldcall_calls
      WHERE prospect_id = p.id AND resultado = 'reunion_agendada'
      ORDER BY fecha DESC
      LIMIT 1
    ) lc ON TRUE
    WHERE p.deleted_at IS NULL
      AND p.do_not_call = FALSE
      AND (
        lc.reunion_fecha IS NOT NULL
        OR lc.notas ILIKE '%cal.com%'
      )
      AND p.campaign_id IN (
        SELECT id FROM coldcall_campaigns c
        WHERE (
          (${legacyAdmin} IS TRUE)
          OR (${legacyAdmin} IS NOT TRUE AND ${userId}::int IS NOT NULL AND (c.assigned_to_user_id = ${userId} OR c.created_by_user_id = ${userId}))
          OR (${legacyAdmin} IS NOT TRUE AND ${userId}::int IS NULL AND (
            c.assigned_to_user_id = ANY(${teamIds}::int[])
            OR c.created_by_user_id = ANY(${teamIds}::int[])
            OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
          ))
        )
      )
    ORDER BY COALESCE(lc.reunion_fecha, NOW()) ASC
    LIMIT 150
  `
}

async function normalizeMeeting(r: RawMeeting): Promise<MeetingReminderRow | null> {
  let at: Date | null = r.at instanceof Date ? r.at : r.at ? new Date(r.at) : null
  if (!at || Number.isNaN(at.getTime())) {
    const parsed = parseMeetingDateFromNotas(r.notas)
    if (!parsed) return null
    at = parsed
    await prisma.$executeRaw`
      UPDATE coldcall_calls SET reunion_fecha = ${parsed}
      WHERE id = ${r.call_id} AND reunion_fecha IS NULL
    `
  }

  const confirm = (r.confirm_status || null) as ReunionConfirmStatus | null
  const demo = (r.demo_prep_status || null) as DemoPrepStatus | null

  return {
    call_id: r.call_id,
    prospect_id: r.prospect_id,
    nombre: r.nombre,
    empresa: r.empresa,
    telefono: r.telefono,
    email: r.email,
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    at: at.toISOString(),
    notas: r.notas,
    prospect_notas: r.prospect_notas,
    sector: r.sector,
    confirm_status: confirm,
    demo_prep_status: demo,
    tips: demoTipsForSector(r.sector),
  }
}

/** Reuniones en los próximos N días que el caller debe confirmar. */
export async function listConfirmReminders(
  scope: ColdCallScope,
  options?: { windowDays?: number }
): Promise<MeetingReminderRow[]> {
  const windowDays = options?.windowDays ?? CONFIRM_WINDOW_DAYS
  const now = Date.now()
  const maxMs = now + windowDays * 24 * 60 * 60 * 1000

  const rows = await queryScopedMeetings(scope)
  const out: MeetingReminderRow[] = []

  for (const r of rows) {
    const m = await normalizeMeeting(r)
    if (!m) continue
    const t = new Date(m.at).getTime()
    if (t < now || t > maxMs) continue
    if (m.confirm_status === 'confirmed' || m.confirm_status === 'cancelled') continue
    out.push(m)
  }

  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

/** Reuniones próximas para preparar demo (admin / lista emails). */
export async function listDemoPrepReminders(
  scope: ColdCallScope,
  options?: { windowDays?: number }
): Promise<MeetingReminderRow[]> {
  const windowDays = options?.windowDays ?? DEMO_PREP_WINDOW_DAYS
  const now = Date.now()
  const maxMs = now + windowDays * 24 * 60 * 60 * 1000

  const rows = await queryScopedMeetings(scope)
  const out: MeetingReminderRow[] = []

  for (const r of rows) {
    const m = await normalizeMeeting(r)
    if (!m) continue
    const t = new Date(m.at).getTime()
    if (t < now || t > maxMs) continue
    if (m.confirm_status === 'cancelled') continue
    if (m.demo_prep_status === 'done') continue
    out.push(m)
  }

  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

export async function updateMeetingConfirm(input: {
  callId: number
  userId: number | null
  status: ReunionConfirmStatus
  note?: string | null
  newReunionFecha?: Date | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await prisma.$queryRaw<{ id: number; prospect_id: number; resultado: string }[]>`
    SELECT id, prospect_id, resultado FROM coldcall_calls WHERE id = ${input.callId} LIMIT 1
  `
  const call = rows[0]
  if (!call || call.resultado !== 'reunion_agendada') {
    return { ok: false, error: 'Reunión no encontrada' }
  }

  if (input.status === 'rescheduled') {
    if (!input.newReunionFecha || Number.isNaN(input.newReunionFecha.getTime())) {
      return { ok: false, error: 'Indica la nueva fecha de la reunión' }
    }
    await prisma.$executeRaw`
      UPDATE coldcall_calls SET
        reunion_fecha = ${input.newReunionFecha},
        reunion_confirm_status = NULL,
        reunion_confirm_at = NOW(),
        reunion_confirm_by_user_id = ${input.userId},
        reunion_confirm_note = ${input.note?.trim() || 'Reagendada'},
        demo_prep_status = NULL
      WHERE id = ${input.callId}
    `
    await prisma.$executeRaw`
      UPDATE coldcall_prospects SET
        next_retry_at = ${input.newReunionFecha},
        stage = 'reunion_agendada',
        estado = 'reunion_agendada',
        updated_at = NOW()
      WHERE id = ${call.prospect_id}
    `
    return { ok: true }
  }

  if (input.status === 'cancelled') {
    await prisma.$executeRaw`
      UPDATE coldcall_calls SET
        reunion_confirm_status = 'cancelled',
        reunion_confirm_at = NOW(),
        reunion_confirm_by_user_id = ${input.userId},
        reunion_confirm_note = ${input.note?.trim() || null},
        demo_prep_status = 'done'
      WHERE id = ${input.callId}
    `
    await prisma.$executeRaw`
      UPDATE coldcall_prospects SET
        stage = 'interesado_info_enviada',
        estado = 'interesado',
        updated_at = NOW()
      WHERE id = ${call.prospect_id}
    `
    return { ok: true }
  }

  // confirmed
  await prisma.$executeRaw`
    UPDATE coldcall_calls SET
      reunion_confirm_status = 'confirmed',
      reunion_confirm_at = NOW(),
      reunion_confirm_by_user_id = ${input.userId},
      reunion_confirm_note = ${input.note?.trim() || null}
    WHERE id = ${input.callId}
  `
  return { ok: true }
}

export async function updateDemoPrep(input: {
  callId: number
  userId: number | null
  status: DemoPrepStatus
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await prisma.$queryRaw<{ id: number; resultado: string }[]>`
    SELECT id, resultado FROM coldcall_calls WHERE id = ${input.callId} LIMIT 1
  `
  const call = rows[0]
  if (!call || call.resultado !== 'reunion_agendada') {
    return { ok: false, error: 'Reunión no encontrada' }
  }

  await prisma.$executeRaw`
    UPDATE coldcall_calls SET
      demo_prep_status = ${input.status},
      demo_prep_at = NOW(),
      demo_prep_by_user_id = ${input.userId}
    WHERE id = ${input.callId}
  `
  return { ok: true }
}
