import { z } from 'zod'
import { getPool } from '@/lib/db'
import { prisma } from '@/lib/prisma'
import { normalizeChannel } from '@/lib/leads/channel-normalize'
import type { ChannelKey } from '@/lib/leads/analytics.types'
import {
  ATTRIBUTION_CHANNELS,
  ATTRIBUTION_VIAS,
  attributionLabel,
  channelOrigin,
  effectiveChannel,
  reviewReason,
  type Attribution,
  type AttributionLead,
  type AttributionMonth,
} from '@/lib/marketing/attribution.types'

/*
 * Una tabla NUEVA: marketing_lead_attribution (una fila por lead corregido a mano).
 * El lead y su origen no se modifican: borrar la fila vuelve a contar lo automático.
 * Mismo SQL en prisma/CREATE_MARKETING_ATTRIBUTION.sql. Idempotente.
 */
const SQL_CREATE = `
CREATE TABLE IF NOT EXISTS marketing_lead_attribution (
  lead_id     INTEGER PRIMARY KEY,
  canal       TEXT NOT NULL,
  via         TEXT,
  nota        TEXT,
  detectado   TEXT,
  updated_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`

let ensured: Promise<void> | null = null
export function ensureAttributionTable(): Promise<void> {
  if (!ensured) {
    ensured = getPool()
      .query(SQL_CREATE)
      .then(() => undefined)
      .catch((e) => {
        ensured = null
        throw e
      })
  }
  return ensured
}

async function tableExists(): Promise<boolean> {
  const { rows } = await getPool().query<{ ok: boolean }>(
    `SELECT to_regclass('public.marketing_lead_attribution') IS NOT NULL AS ok`
  )
  return !!rows[0]?.ok
}

const COLS = `lead_id, canal, via, nota, detectado, updated_by, updated_at::text AS updated_at`
const VALID = new Set<string>(ATTRIBUTION_CHANNELS.map((c) => c.id))

async function loadAttributions(leadIds?: number[]): Promise<Map<number, Attribution>> {
  if (leadIds && leadIds.length === 0) return new Map()
  if (!(await tableExists())) return new Map()
  const { rows } = leadIds
    ? await getPool().query<Attribution>(
        `SELECT ${COLS} FROM marketing_lead_attribution WHERE lead_id = ANY($1::int[])`,
        [leadIds]
      )
    : await getPool().query<Attribution>(`SELECT ${COLS} FROM marketing_lead_attribution`)
  return new Map(rows.filter((r) => VALID.has(r.canal)).map((r) => [r.lead_id, r]))
}

/** Canal confirmado por lead. Si algo falla, la analítica sigue con lo automático. */
export async function loadAttributionChannels(): Promise<Map<number, ChannelKey>> {
  try {
    const map = await loadAttributions()
    return new Map(Array.from(map.entries()).map(([id, a]) => [id, a.canal as ChannelKey]))
  } catch (e) {
    console.error('[marketing/attribution] no se pudo leer:', e instanceof Error ? e.message : e)
    return new Map()
  }
}

// ——— Validación ———
const ids = <T extends readonly { id: string }[]>(l: T) => l.map((x) => x.id) as unknown as [T[number]['id'], ...T[number]['id'][]]
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))

export const attributionInput = z.object({
  lead_id: z.number().int().positive(),
  canal: z.enum(ids(ATTRIBUTION_CHANNELS)),
  via: z.enum(ids(ATTRIBUTION_VIAS)).nullable().optional(),
  nota: text(2000),
})

export const manualLeadInput = z
  .object({
    nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
    telefono: text(40),
    email: text(200).refine((v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Email inválido'),
    empresa: text(200),
    canal: z.enum(ids(ATTRIBUTION_CHANNELS)),
    via: z.enum(ids(ATTRIBUTION_VIAS)).nullable().optional(),
    nota: text(2000),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
      .optional(),
  })
  .refine((d) => d.telefono || d.email, 'Pon al menos un teléfono o un email')

// ——— Lectura ———
const LEAD_SELECT = {
  id: true,
  origen_principal: true,
  created_at: true,
  contact: { select: { nombre: true, email: true, empresa: true } },
} as const

type LeadRow = {
  id: number
  origen_principal: string | null
  created_at: Date | null
  contact: { nombre: string | null; email: string | null; empresa: string | null } | null
}

function toLead(l: LeadRow, a: Attribution | null): AttributionLead {
  const canal = effectiveChannel(l.origen_principal, a)
  const reason = a ? null : reviewReason(l.origen_principal)
  return {
    id: l.id,
    name: l.contact?.nombre || l.contact?.email || `Lead #${l.id}`,
    empresa: l.contact?.empresa || null,
    created_at: l.created_at?.toISOString() ?? null,
    origen: l.origen_principal,
    auto: normalizeChannel(l.origen_principal),
    canal,
    canal_label: attributionLabel(canal),
    attribution: a,
    needs_review: reason != null,
    reason,
  }
}

/** Leads del mes con su canal y cuáles faltan por confirmar (no crea la tabla). */
export async function getAttributionMonth(period: string): Promise<AttributionMonth> {
  const [y, m] = period.split('-').map(Number)
  const rows = await prisma.lead.findMany({
    where: { created_at: { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) } },
    select: LEAD_SELECT,
    orderBy: { created_at: 'desc' },
  })
  const attrs = await loadAttributions(rows.map((r) => r.id))
  const leads = rows.map((r) => toLead(r, attrs.get(r.id) ?? null))
  return { period, leads, pending: leads.filter((l) => l.needs_review).length }
}

export async function getLeadAttribution(leadId: number): Promise<AttributionLead | null> {
  const row = await prisma.lead.findUnique({ where: { id: leadId }, select: LEAD_SELECT })
  if (!row) return null
  return toLead(row, (await loadAttributions([leadId])).get(leadId) ?? null)
}

// ——— Escritura ———

/** Confirma o corrige el canal de un lead. Solo escribe en marketing_lead_attribution. */
export async function saveAttribution(input: z.infer<typeof attributionInput>, by: string | null): Promise<AttributionLead | null> {
  const lead = await prisma.lead.findUnique({ where: { id: input.lead_id }, select: { origen_principal: true } })
  if (!lead) return null
  await ensureAttributionTable()
  const detectado = `${attributionLabel(normalizeChannel(lead.origen_principal))}${lead.origen_principal ? ` (${lead.origen_principal})` : ''}`
  await getPool().query(
    `INSERT INTO marketing_lead_attribution (lead_id, canal, via, nota, detectado, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (lead_id) DO UPDATE SET canal = EXCLUDED.canal, via = EXCLUDED.via, nota = EXCLUDED.nota,
       detectado = EXCLUDED.detectado, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [input.lead_id, input.canal, input.via ?? null, input.nota ?? null, detectado, by]
  )
  return getLeadAttribution(input.lead_id)
}

/** Quita la corrección manual (el lead no se toca) y vuelve a contar lo automático. */
export async function clearAttribution(leadId: number): Promise<AttributionLead | null> {
  if (await tableExists()) {
    await getPool().query(`DELETE FROM marketing_lead_attribution WHERE lead_id = $1`, [leadId])
  }
  return getLeadAttribution(leadId)
}

const phoneKey = (p: string) => p.replace(/\D/g, '').slice(-9)

/**
 * Apunta un lead a mano. Si la persona ya está en el CRM (mismo email o teléfono)
 * no se duplica ni se cambia su ficha: solo se guarda cómo nos conoció.
 */
export async function createManualLead(
  input: z.infer<typeof manualLeadInput>,
  by: string | null
): Promise<{ lead: AttributionLead | null; existing: boolean }> {
  await ensureAttributionTable()
  let contactId: number | null = null
  if (input.email) {
    const c = await prisma.contact.findFirst({
      where: { email: { equals: input.email, mode: 'insensitive' } },
      select: { id: true },
    })
    contactId = c?.id ?? null
  }
  const key = input.telefono ? phoneKey(input.telefono) : ''
  if (contactId == null && key.length === 9) {
    const { rows } = await getPool().query<{ id: number }>(
      `SELECT id FROM contacts WHERE right(regexp_replace(coalesce(telefono, ''), '\\D', '', 'g'), 9) = $1 ORDER BY id LIMIT 1`,
      [key]
    )
    contactId = rows[0]?.id ?? null
  }

  let leadId: number | null = null
  let existing = false
  if (contactId != null) {
    const l = await prisma.lead.findUnique({ where: { contact_id: contactId }, select: { id: true } })
    leadId = l?.id ?? null
    existing = leadId != null
  }

  if (leadId == null) {
    const today = new Date().toISOString().slice(0, 10)
    const when = input.fecha && input.fecha < today ? new Date(`${input.fecha}T12:00:00`) : new Date()
    const l = await prisma.lead.create({
      data: {
        estado: 'frio',
        prioridad: 'media',
        origen_principal: channelOrigin(input.canal),
        notas: input.nota,
        ultima_interaccion: when,
        created_at: when,
        contact: contactId != null
          ? { connect: { id: contactId } }
          : { create: { nombre: input.nombre, email: input.email, telefono: input.telefono, empresa: input.empresa } },
      },
      select: { id: true },
    })
    leadId = l.id
  }

  const lead = await saveAttribution({ lead_id: leadId, canal: input.canal, via: input.via ?? null, nota: input.nota }, by)
  return { lead, existing }
}
