import { z } from 'zod'
import { getPool } from '@/lib/db'
import { prisma } from '@/lib/prisma'
import { getGlobalPipelineId } from '@/lib/pipelines/global-funnel'
import { normalizeChannel } from '@/lib/leads/channel-normalize'
import { CHANNEL_LABELS, type ChannelKey } from '@/lib/leads/analytics.types'
import { loadMeetingLeadIds } from '@/lib/leads/analytics'
import { resolveChannelSpend } from '@/lib/leads/channel-costs'
import { findCrmUserById, listCrmUsers } from '@/lib/crm-users'
import { createPersonalTask } from '@/lib/tareas/store'
import { notifyTaskAssigned } from '@/lib/notifications/team-events'
import { loadAttributionChannels, getAttributionMonth } from '@/lib/marketing/attribution'
import { getPlanMonth } from '@/lib/marketing/plan'
import { summarizePlan } from '@/lib/marketing/plan.types'
import type { AuthUser } from '@/lib/auth'
import {
  FOLLOW_KINDS,
  LOST_REASONS,
  MAX_DECISIONS,
  addDays,
  buildFunnel,
  classifyFollow,
  estadoRank,
  mondayOf,
  stageRank,
  weekSummary,
  type FollowData,
  type FollowKind,
  type FollowLead,
  type FunnelData,
  type FunnelLead,
  type LeadOutcome,
  type Person,
  type ReviewData,
  type ReviewDecision,
  type WeekNumbers,
} from '@/lib/marketing/sales.types'

/*
 * Tablas NUEVAS (no modifican nada existente). Mismo SQL en prisma/CREATE_MARKETING_SALES.sql.
 *   marketing_card_stage      → última columna vista de cada tarjeta y desde cuándo
 *   marketing_stage_events    → cambios de columna
 *   marketing_lead_outcomes   → perdido y motivo, encaja, no se presentó
 *   marketing_lead_followups  → contactado, pospuesto y tarea creada
 *   marketing_reviews / marketing_review_decisions → revisión del lunes
 * Del pipeline solo se LEE: las tarjetas nunca se mueven desde aquí.
 */
export const SQL_CREATE_SALES = `
CREATE TABLE IF NOT EXISTS marketing_card_stage (
  card_id     TEXT PRIMARY KEY,
  contact_id  INTEGER NOT NULL,
  stage       TEXT NOT NULL,
  prev_stage  TEXT,
  since       TIMESTAMPTZ NOT NULL,
  exact       BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_marketing_card_stage_contact ON marketing_card_stage (contact_id);
CREATE TABLE IF NOT EXISTS marketing_stage_events (
  id          SERIAL PRIMARY KEY,
  card_id     TEXT NOT NULL,
  contact_id  INTEGER NOT NULL,
  from_stage  TEXT,
  to_stage    TEXT NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_stage_events_at ON marketing_stage_events (at);
CREATE TABLE IF NOT EXISTS marketing_lead_outcomes (
  lead_id          INTEGER PRIMARY KEY,
  perdido          BOOLEAN NOT NULL DEFAULT FALSE,
  motivo           TEXT,
  encaja           BOOLEAN,
  no_presentado    BOOLEAN NOT NULL DEFAULT FALSE,
  nota             TEXT,
  estado_anterior  TEXT,
  updated_by       TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS marketing_lead_followups (
  lead_id       INTEGER PRIMARY KEY,
  contacted_at  TIMESTAMPTZ,
  snooze_until  TIMESTAMPTZ,
  task_id       TEXT,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS marketing_reviews (
  week_start  DATE PRIMARY KEY,
  notas       TEXT,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS marketing_review_decisions (
  id          SERIAL PRIMARY KEY,
  week_start  DATE NOT NULL,
  texto       TEXT NOT NULL,
  user_id     INTEGER NOT NULL,
  user_name   TEXT NOT NULL,
  due_date    DATE,
  task_id     TEXT,
  resultado   TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_review_decisions_week ON marketing_review_decisions (week_start);`

let ensured: Promise<void> | null = null
export function ensureSalesTables(): Promise<void> {
  if (!ensured) {
    ensured = getPool()
      .query(SQL_CREATE_SALES)
      .then(() => undefined)
      .catch((e) => {
        ensured = null
        throw e
      })
  }
  return ensured
}

// ——— Fechas del pipeline ———
export const SQL_SNAPSHOT_CHANGES = `
WITH cur AS (
  SELECT id::text AS card_id, entity_id::int AS contact_id, stage
  FROM pipeline_cards
  WHERE pipeline_id = $1::uuid AND deleted_at IS NULL AND entity_type = 'contact' AND entity_id ~ '^[0-9]{1,9}$'
), chg AS (
  UPDATE marketing_card_stage m
  SET prev_stage = m.stage, stage = cur.stage, since = NOW(), exact = TRUE
  FROM cur
  WHERE m.card_id = cur.card_id AND m.stage <> cur.stage
  RETURNING m.card_id, m.contact_id, m.prev_stage, m.stage
)
INSERT INTO marketing_stage_events (card_id, contact_id, from_stage, to_stage)
SELECT card_id, contact_id, prev_stage, stage FROM chg`

/** Tarjetas no vistas antes. La primera vez la fecha es aproximada (última modificación). */
export const SQL_SNAPSHOT_NEW = `
INSERT INTO marketing_card_stage (card_id, contact_id, stage, since, exact)
SELECT c.id::text, c.entity_id::int, c.stage,
       CASE WHEN $2::boolean THEN c.updated_at ELSE c.created_at END, NOT $2::boolean
FROM pipeline_cards c
WHERE c.pipeline_id = $1::uuid AND c.deleted_at IS NULL AND c.entity_type = 'contact' AND c.entity_id ~ '^[0-9]{1,9}$'
ON CONFLICT (card_id) DO NOTHING`

let lastSnapshot = 0
/** Apunta los cambios de columna del pipeline global (solo lo lee). Como mucho cada 10 min. */
export async function snapshotPipeline(force = false): Promise<void> {
  if (process.env.MARKETING_SNAPSHOT === '0') return
  if (!force && Date.now() - lastSnapshot < 10 * 60_000) return
  lastSnapshot = Date.now()
  try {
    const pid = await getGlobalPipelineId()
    if (!pid) return
    await ensureSalesTables()
    const pool = getPool()
    const { rows } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM marketing_card_stage`)
    const first = (rows[0]?.n ?? 0) === 0
    await pool.query(SQL_SNAPSHOT_CHANGES, [pid])
    await pool.query(SQL_SNAPSHOT_NEW, [pid, first])
  } catch (e) {
    lastSnapshot = 0
    console.warn('[marketing] fechas del pipeline:', e instanceof Error ? e.message : e)
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __buffaloMarketingSnapshot: boolean | undefined
}
/** Cada hora, para que las fechas no dependan de que alguien abra Marketing. */
export function startMarketingSnapshotScheduler(): void {
  if (globalThis.__buffaloMarketingSnapshot || process.env.MARKETING_SNAPSHOT === '0') return
  globalThis.__buffaloMarketingSnapshot = true
  setTimeout(() => void snapshotPipeline(), 60_000)
  setInterval(() => void snapshotPipeline(), 60 * 60_000)
}

// ——— Datos comunes ———
async function tableExists(name: string): Promise<boolean> {
  const { rows } = await getPool().query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${name}`])
  return !!rows[0]?.ok
}

type CardInfo = { stage: string; rank: number; since: Date | null; exact: boolean; reached: number }

/** Estado del pipeline por contacto: columna actual, desde cuándo y la más avanzada. */
async function loadCards(contactIds: number[]): Promise<Map<number, CardInfo>> {
  const out = new Map<number, CardInfo>()
  const pid = await getGlobalPipelineId()
  if (!pid || contactIds.length === 0) return out
  const cards = await prisma.pipelineCard.findMany({
    where: { pipeline_id: pid, deleted_at: null, entity_type: 'contact', entity_id: { in: contactIds.map(String) } },
    select: { id: true, entity_id: true, stage: true },
  })
  const since = new Map<string, { since: Date; exact: boolean }>()
  const reached = new Map<number, number>()
  if (await tableExists('marketing_card_stage')) {
    const s = await getPool().query<{ card_id: string; since: Date; exact: boolean }>(
      `SELECT card_id, since, exact FROM marketing_card_stage WHERE contact_id = ANY($1::int[])`,
      [contactIds]
    )
    for (const r of s.rows) since.set(r.card_id, r)
    const ev = await getPool().query<{ contact_id: number; from_stage: string | null; to_stage: string }>(
      `SELECT contact_id, from_stage, to_stage FROM marketing_stage_events WHERE contact_id = ANY($1::int[])`,
      [contactIds]
    )
    for (const r of ev.rows) {
      const k = Math.max(stageRank(r.from_stage), stageRank(r.to_stage))
      reached.set(r.contact_id, Math.max(reached.get(r.contact_id) ?? 0, k))
    }
  }
  for (const c of cards) {
    const id = Number(c.entity_id)
    const rank = stageRank(c.stage)
    const prev = out.get(id)
    if (prev && prev.rank >= rank) continue
    const s = since.get(c.id)
    out.set(id, { stage: c.stage, rank, since: s?.since ?? null, exact: s?.exact ?? false, reached: Math.max(rank, reached.get(id) ?? 0) })
  }
  return out
}

const OUT_COLS = `lead_id, perdido, motivo, encaja, no_presentado, nota, updated_by, updated_at::text AS updated_at`
async function loadOutcomes(leadIds: number[]): Promise<Map<number, LeadOutcome>> {
  if (leadIds.length === 0 || !(await tableExists('marketing_lead_outcomes'))) return new Map()
  const { rows } = await getPool().query<LeadOutcome>(
    `SELECT ${OUT_COLS} FROM marketing_lead_outcomes WHERE lead_id = ANY($1::int[])`,
    [leadIds]
  )
  return new Map(rows.map((r) => [r.lead_id, r]))
}

// ——— Embudo ———
export async function getFunnel(period: string, months: number): Promise<FunnelData> {
  await snapshotPipeline()
  const [y, m] = period.split('-').map(Number)
  const from = new Date(y, m - months, 1)
  const to = new Date(y, m, 1)
  const [rows, attributed] = await Promise.all([
    prisma.lead.findMany({
      where: { created_at: { gte: from, lt: to } },
      select: {
        id: true,
        contact_id: true,
        estado: true,
        origen_principal: true,
        created_at: true,
        contact: { select: { nombre: true, email: true, empresa: true } },
      },
      orderBy: { created_at: 'desc' },
    }),
    loadAttributionChannels(),
  ])
  const [cards, outcomes, meetings] = await Promise.all([
    loadCards(rows.map((r) => r.contact_id)),
    loadOutcomes(rows.map((r) => r.id)),
    loadMeetingLeadIds(from, new Date()),
  ])
  const met = new Set(meetings.leadIds)
  const leads: FunnelLead[] = rows.map((r) => {
    const c = cards.get(r.contact_id)
    const o = outcomes.get(r.id)
    const canal = attributed.get(r.id) ?? normalizeChannel(r.origen_principal)
    return {
      id: r.id,
      name: r.contact?.nombre || r.contact?.email || `Lead #${r.id}`,
      empresa: r.contact?.empresa || null,
      created_at: r.created_at?.toISOString() ?? null,
      canal,
      canal_label: CHANNEL_LABELS[canal],
      stage: c?.stage ?? null,
      reached: Math.max(c?.reached ?? 0, estadoRank(r.estado), met.has(r.id) ? 3 : 0, 1),
      perdido: !!o?.perdido || r.estado === 'perdido' || c?.rank === -1,
      motivo: o?.motivo ?? null,
      encaja: o?.encaja ?? null,
      no_presentado: !!o?.no_presentado,
    }
  })
  const spend: Partial<Record<ChannelKey, number>> = {}
  const channels = new Set(leads.map((l) => l.canal))
  for (let i = 0; i < months; i++) {
    const start = new Date(y, m - months + i, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999)
    const p = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
    const map = await resolveChannelSpend({ period: p, start, end, channelsWithLeads: channels })
    for (const [ch, info] of Array.from(map.entries())) spend[ch] = (spend[ch] || 0) + info.spend
  }
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: ymd(from), to: ymd(new Date(to.getTime() - 1)), months, ...buildFunnel(leads, spend), leads }
}

// ——— Resultado de un lead ———
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
export const outcomeInput = z
  .object({
    lead_id: z.number().int().positive(),
    perdido: z.boolean(),
    motivo: z.enum(LOST_REASONS.map((r) => r.id) as [string, ...string[]]).nullable().optional(),
    encaja: z.boolean().nullable().optional(),
    no_presentado: z.boolean().optional(),
    nota: text(2000),
  })
  .refine((d) => !d.perdido || d.motivo, 'Elige el motivo')

export class OutcomeError extends Error {}

export async function getOutcome(leadId: number): Promise<LeadOutcome | null> {
  return (await loadOutcomes([leadId])).get(leadId) ?? null
}

/** Guarda el resultado. Si se marca perdido, el lead pasa a «Perdido»; al desmarcarlo vuelve a su estado. */
export async function saveOutcome(input: z.infer<typeof outcomeInput>, by: string | null): Promise<LeadOutcome> {
  const lead = await prisma.lead.findUnique({ where: { id: input.lead_id }, select: { estado: true } })
  if (!lead) throw new OutcomeError('Lead no encontrado')
  if (input.perdido && ['cerrado', 'activo'].includes(lead.estado || '')) {
    throw new OutcomeError('Ya es cliente: no se puede marcar como perdido desde aquí')
  }
  await ensureSalesTables()
  const pool = getPool()
  const prev = await pool.query<{ perdido: boolean; estado_anterior: string | null }>(
    `SELECT perdido, estado_anterior FROM marketing_lead_outcomes WHERE lead_id = $1`,
    [input.lead_id]
  )
  const wasLost = !!prev.rows[0]?.perdido
  const anterior = input.perdido ? (wasLost ? prev.rows[0].estado_anterior : lead.estado) : null
  await pool.query(
    `INSERT INTO marketing_lead_outcomes (lead_id, perdido, motivo, encaja, no_presentado, nota, estado_anterior, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (lead_id) DO UPDATE SET perdido = EXCLUDED.perdido, motivo = EXCLUDED.motivo, encaja = EXCLUDED.encaja,
       no_presentado = EXCLUDED.no_presentado, nota = EXCLUDED.nota, estado_anterior = EXCLUDED.estado_anterior,
       updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [
      input.lead_id,
      input.perdido,
      input.perdido ? input.motivo ?? null : null,
      input.encaja ?? null,
      !!input.no_presentado,
      input.nota ?? null,
      anterior,
      by,
    ]
  )
  if (input.perdido && lead.estado !== 'perdido') {
    await prisma.lead.update({ where: { id: input.lead_id }, data: { estado: 'perdido' } })
  } else if (!input.perdido && wasLost && lead.estado === 'perdido') {
    const back = prev.rows[0].estado_anterior
    if (back && back !== 'perdido') await prisma.lead.update({ where: { id: input.lead_id }, data: { estado: back } })
  }
  return (await getOutcome(input.lead_id))!
}

// ——— Personas y tareas ———
async function people(): Promise<Person[]> {
  return (await listCrmUsers())
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/** Tarea normal del CRM (misma regla que /tareas: solo un admin se la pone a otro). */
async function createTask(
  user: AuthUser,
  input: { user_id?: number | null; title: string; description?: string | null; due_date?: string | null }
): Promise<{ id: string; owner: Person }> {
  const ownerId = user.role === 'admin' ? input.user_id : user.id
  if (!ownerId) throw new OutcomeError('Elige para quién es la tarea')
  const owner = await findCrmUserById(ownerId)
  if (!owner || !owner.active) throw new OutcomeError('Usuario no válido')
  const task = await createPersonalTask({
    user_id: owner.id,
    title: input.title,
    description: input.description ?? null,
    due_date: input.due_date ?? null,
    created_by_id: user.id > 0 ? user.id : null,
    created_by_name: user.name,
  })
  void notifyTaskAssigned({
    userIds: [owner.id],
    actorId: user.id,
    actorName: user.name,
    taskId: task.id,
    title: task.title,
    dueDate: task.due_date,
    priority: task.priority,
  })
  return { id: task.id, owner: { id: owner.id, name: owner.name } }
}

type TaskInfo = { id: string; title: string; status: string; owner: string | null; due_date: string | null }
async function loadTasks(ids: string[]): Promise<Map<string, TaskInfo>> {
  if (ids.length === 0 || !(await tableExists('crm_user_tasks'))) return new Map()
  const { rows } = await getPool().query<TaskInfo>(
    `SELECT t.id::text AS id, t.title, t.status, u.name AS owner, to_char(t.due_date, 'YYYY-MM-DD') AS due_date
     FROM crm_user_tasks t LEFT JOIN crm_users u ON u.id = t.user_id
     WHERE t.id::text = ANY($1::text[])`,
    [ids]
  )
  return new Map(rows.map((r) => [r.id, r]))
}

// ——— Leads parados ———
type Follow = { lead_id: number; contacted_at: Date | null; snooze_until: Date | null; task_id: string | null }

export async function getFollowups(user: AuthUser): Promise<FollowData> {
  await snapshotPipeline()
  const pool = getPool()
  const now = new Date()
  const pid = await getGlobalPipelineId()
  // Candidatos: con tarjeta en el pipeline de ventas, o leads recientes
  const cardRows = pid
    ? await prisma.pipelineCard.findMany({
        where: { pipeline_id: pid, deleted_at: null, entity_type: 'contact' },
        select: { entity_id: true },
      })
    : []
  const inPipe = cardRows.map((c) => Number(c.entity_id)).filter((n) => Number.isInteger(n) && n > 0)
  const rows = await prisma.lead.findMany({
    where: {
      AND: [
        { OR: [{ contact_id: { in: inPipe } }, { created_at: { gte: new Date(now.getTime() - 60 * 86_400_000) } }] },
        { OR: [{ estado: null }, { estado: { notIn: ['cerrado', 'activo', 'perdido'] } }] },
      ],
    },
    select: {
      id: true,
      contact_id: true,
      estado: true,
      origen_principal: true,
      created_at: true,
      ultima_interaccion: true,
      contact: { select: { nombre: true, email: true, empresa: true, telefono: true } },
    },
  })
  const ids = rows.map((r) => r.id)
  const contactIds = rows.map((r) => r.contact_id)
  const [cards, outcomes, attributed, follows, activity, meetings] = await Promise.all([
    loadCards(contactIds),
    loadOutcomes(ids),
    loadAttributionChannels(),
    (async () => {
      if (!(await tableExists('marketing_lead_followups'))) return new Map<number, Follow>()
      const r = await pool.query<Follow>(
        `SELECT lead_id, contacted_at, snooze_until, task_id FROM marketing_lead_followups WHERE lead_id = ANY($1::int[])`,
        [ids]
      )
      return new Map(r.rows.map((x) => [x.lead_id, x]))
    })(),
    (async () => {
      if (!(await tableExists('crm_activities'))) return new Map<number, Date>()
      const r = await pool.query<{ contact_id: number; at: Date }>(
        `SELECT contact_id, MAX(created_at) AS at FROM crm_activities
         WHERE contact_id = ANY($1::int[]) AND kind <> 'alert' GROUP BY contact_id`,
        [contactIds]
      )
      return new Map(r.rows.map((x) => [x.contact_id, x.at]))
    })(),
    (async () => {
      if (!(await tableExists('cal_bookings'))) return new Map<string, { last: Date | null; next: Date | null }>()
      const r = await pool.query<{ email: string; last: Date | null; next: Date | null }>(
        `SELECT LOWER(TRIM(attendee_email)) AS email,
                MAX(start_time) FILTER (WHERE start_time <= NOW()) AS last,
                MIN(start_time) FILTER (WHERE start_time > NOW()) AS next
         FROM cal_bookings
         WHERE attendee_email IS NOT NULL AND COALESCE(status, '') NOT IN ('cancelled', 'canceled', 'rejected')
         GROUP BY 1`
      )
      return new Map(r.rows.map((x) => [x.email, x]))
    })(),
  ])
  const tasks = await loadTasks(Array.from(follows.values()).flatMap((f) => (f.task_id ? [f.task_id] : [])))

  const leads: FollowLead[] = []
  for (const r of rows) {
    const c = cards.get(r.contact_id)
    const f = follows.get(r.id)
    const meet = r.contact?.email ? meetings.get(r.contact.email.trim().toLowerCase()) : undefined
    // Movimiento = interacción, actividad, reunión, «contactado» o paso a Contacto o más en el pipeline
    const marks = [
      r.ultima_interaccion,
      activity.get(r.contact_id),
      meet?.last,
      f?.contacted_at,
      c && c.rank >= 2 ? c.since : null,
    ].filter((d): d is Date => d instanceof Date)
    const created = r.created_at ?? now
    // Al crear un lead se rellena «última interacción» con la misma hora: eso no es un contacto
    const real = marks.filter((d) => d !== r.ultima_interaccion || d.getTime() - created.getTime() > 5 * 60_000)
    const last = real.length ? new Date(Math.max(...real.map((d) => d.getTime()))) : null
    const res = classifyFollow(
      {
        rank: c?.rank ?? 0,
        estado: r.estado,
        created_at: created,
        last_contact: last,
        next_meeting: meet?.next ?? null,
        perdido: !!outcomes.get(r.id)?.perdido,
        snooze_until: f?.snooze_until ?? null,
      },
      now
    )
    if (!res) continue
    const t = f?.task_id ? tasks.get(f.task_id) : undefined
    const canal = attributed.get(r.id) ?? normalizeChannel(r.origen_principal)
    leads.push({
      id: r.id,
      name: r.contact?.nombre || r.contact?.email || `Lead #${r.id}`,
      empresa: r.contact?.empresa || null,
      telefono: r.contact?.telefono || null,
      canal_label: CHANNEL_LABELS[canal],
      stage: c?.stage ?? null,
      kind: res.kind,
      days: res.days,
      exact: !(c && last && c.since && last.getTime() === c.since.getTime() && !c.exact),
      task: t && t.status !== 'done' ? { id: t.id, title: t.title, owner: t.owner, due_date: t.due_date } : null,
    })
  }
  const order = (k: FollowKind) => FOLLOW_KINDS.findIndex((x) => x.id === k)
  leads.sort((a, b) => order(a.kind) - order(b.kind) || Number(!!a.task) - Number(!!b.task) || b.days - a.days)
  const counts = Object.fromEntries(FOLLOW_KINDS.map((k) => [k.id, leads.filter((l) => l.kind === k.id).length])) as Record<FollowKind, number>
  const admin = user.role === 'admin'
  return { leads, counts, people: admin ? await people() : [], can_assign: admin, me: { id: user.id, name: user.name } }
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
export const followAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('contacted'), lead_id: z.number().int().positive() }),
  z.object({ action: z.literal('snooze'), lead_id: z.number().int().positive(), days: z.number().int().min(1).max(90) }),
  z.object({
    action: z.literal('task'),
    lead_id: z.number().int().positive(),
    user_id: z.number().int().positive().nullable().optional(),
    title: z.string().trim().min(1, 'Escribe la tarea').max(500),
    due_date: DATE.nullable().optional(),
  }),
])

export async function runFollowAction(input: z.infer<typeof followAction>, user: AuthUser): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id: input.lead_id }, select: { id: true } })
  if (!lead) throw new OutcomeError('Lead no encontrado')
  await ensureSalesTables()
  const pool = getPool()
  if (input.action === 'task') {
    const t = await createTask(user, {
      user_id: input.user_id,
      title: input.title,
      description: `Seguimiento desde Marketing · /leads/${input.lead_id}`,
      due_date: input.due_date ?? null,
    })
    await pool.query(
      `INSERT INTO marketing_lead_followups (lead_id, task_id, updated_by) VALUES ($1,$2,$3)
       ON CONFLICT (lead_id) DO UPDATE SET task_id = EXCLUDED.task_id, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [input.lead_id, t.id, user.email]
    )
  } else if (input.action === 'contacted') {
    await pool.query(
      `INSERT INTO marketing_lead_followups (lead_id, contacted_at, updated_by) VALUES ($1,NOW(),$2)
       ON CONFLICT (lead_id) DO UPDATE SET contacted_at = NOW(), snooze_until = NULL, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [input.lead_id, user.email]
    )
  } else {
    await pool.query(
      `INSERT INTO marketing_lead_followups (lead_id, snooze_until, updated_by) VALUES ($1, NOW() + make_interval(days => $3::int), $2)
       ON CONFLICT (lead_id) DO UPDATE SET snooze_until = EXCLUDED.snooze_until, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [input.lead_id, user.email, input.days]
    )
  }
}

// ——— Revisión semanal ———
const localDay = (day: string) => new Date(`${day}T00:00:00`)

async function weekNumbers(from: string, toExclusive: string, attributed: Map<number, ChannelKey>): Promise<WeekNumbers> {
  const start = localDay(from)
  const end = localDay(toExclusive)
  const [leads, meetings, events] = await Promise.all([
    prisma.lead.findMany({ where: { created_at: { gte: start, lt: end } }, select: { id: true, origen_principal: true } }),
    loadMeetingLeadIds(start, new Date(end.getTime() - 1)),
    (async () => {
      if (!(await tableExists('marketing_stage_events'))) return []
      const r = await getPool().query<{ contact_id: number; from_stage: string | null; to_stage: string }>(
        `SELECT contact_id, from_stage, to_stage FROM marketing_stage_events WHERE at >= $1 AND at < $2`,
        [start, end]
      )
      return r.rows
    })(),
  ])
  // Cuenta quien cruza el hito esa semana (una vez por persona)
  const crossed = (rank: number) =>
    new Set(events.filter((e) => stageRank(e.to_stage) >= rank && stageRank(e.from_stage) < rank).map((e) => e.contact_id)).size
  const by = new Map<string, number>()
  for (const l of leads) {
    const label = CHANNEL_LABELS[attributed.get(l.id) ?? normalizeChannel(l.origen_principal)]
    by.set(label, (by.get(label) || 0) + 1)
  }
  return {
    leads: leads.length,
    reuniones: meetings.meetingCount,
    propuestas: crossed(5),
    firmados: crossed(7),
    by_channel: Array.from(by.entries())
      .map(([label, n]) => ({ label, n }))
      .sort((a, b) => b.n - a.n),
  }
}

async function loadDecisions(weekStart: string): Promise<ReviewDecision[]> {
  if (!(await tableExists('marketing_review_decisions'))) return []
  const { rows } = await getPool().query<Omit<ReviewDecision, 'task_status'>>(
    `SELECT id, to_char(week_start, 'YYYY-MM-DD') AS week_start, texto, user_id, user_name,
            to_char(due_date, 'YYYY-MM-DD') AS due_date, task_id, resultado
     FROM marketing_review_decisions WHERE week_start = $1::date ORDER BY id`,
    [weekStart]
  )
  const tasks = await loadTasks(rows.flatMap((r) => (r.task_id ? [r.task_id] : [])))
  return rows.map((r) => ({ ...r, task_status: (r.task_id && tasks.get(r.task_id)?.status) || null }))
}

export async function getReview(weekStartRaw: string, user: AuthUser): Promise<ReviewData> {
  const week_start = mondayOf(weekStartRaw)
  const from = addDays(week_start, -7)
  const now = new Date()
  const period = week_start.slice(0, 7)
  const [y, m] = period.split('-').map(Number)
  const attributed = await loadAttributionChannels()
  const follow = await getFollowups(user)
  const [week, prev, month, plan, meetings, decisions, previous, notes] = await Promise.all([
    weekNumbers(from, week_start, attributed),
    weekNumbers(addDays(from, -7), from, attributed),
    getAttributionMonth(period),
    getPlanMonth(period).catch(() => null),
    loadMeetingLeadIds(new Date(y, m - 1, 1), new Date(y, m, 0, 23, 59, 59, 999)),
    loadDecisions(week_start),
    loadDecisions(from),
    (async () => {
      if (!(await tableExists('marketing_reviews'))) return null
      const r = await getPool().query<{ notas: string | null }>(`SELECT notas FROM marketing_reviews WHERE week_start = $1::date`, [week_start])
      return r.rows[0]?.notas ?? null
    })(),
  ])
  const summary = plan ? summarizePlan(plan.items, plan.goals, now.toISOString().slice(0, 10)) : null
  const firmados = await (async () => {
    if (!(await tableExists('marketing_stage_events'))) return 0
    const r = await getPool().query<{ contact_id: number; from_stage: string | null; to_stage: string }>(
      `SELECT contact_id, from_stage, to_stage FROM marketing_stage_events WHERE at >= $1 AND at < $2`,
      [new Date(y, m - 1, 1), new Date(y, m, 1)]
    )
    return new Set(r.rows.filter((e) => stageRank(e.to_stage) >= 7 && stageRank(e.from_stage) < 7).map((e) => e.contact_id)).size
  })()
  const last = new Date(y, m, 0)
  const isCurrent = now.getFullYear() === y && now.getMonth() === m - 1
  return {
    week_start,
    from,
    to: addDays(week_start, -1),
    week,
    prev,
    stalled: follow.counts,
    pending_channel: month.pending,
    summary: weekSummary(week, prev, follow.counts, month.pending),
    goals: {
      period_label: last.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
      days_left: isCurrent ? last.getDate() - now.getDate() : 0,
      items: [
        { label: 'Reuniones hechas', cur: meetings.meetingCount, goal: plan?.goals.reuniones_objetivo ?? null },
        { label: 'Contratos firmados', cur: firmados, goal: plan?.goals.clientes_objetivo ?? null },
        { label: 'Piezas publicadas', cur: summary?.publicados ?? 0, goal: plan?.goals.piezas_objetivo ?? null },
      ],
    },
    decisions,
    previous,
    notas: notes,
    people: follow.people,
    can_assign: follow.can_assign,
    me: follow.me,
  }
}

export const decisionInput = z.object({
  week_start: DATE,
  texto: z.string().trim().min(3, 'Escribe la decisión').max(500),
  user_id: z.number().int().positive().nullable().optional(),
  due_date: DATE.nullable().optional(),
})
export const notesInput = z.object({ week_start: DATE, notas: text(5000) })
export const resultInput = z.object({ resultado: text(1000) })

/** Decisión de la semana: crea también su tarea en el CRM. Máximo tres. */
export async function addDecision(input: z.infer<typeof decisionInput>, user: AuthUser): Promise<void> {
  const week = mondayOf(input.week_start)
  await ensureSalesTables()
  const pool = getPool()
  const { rows } = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM marketing_review_decisions WHERE week_start = $1::date`,
    [week]
  )
  if ((rows[0]?.n ?? 0) >= MAX_DECISIONS) throw new OutcomeError(`Máximo ${MAX_DECISIONS} decisiones por semana`)
  const t = await createTask(user, {
    user_id: input.user_id,
    title: input.texto,
    description: `Decisión de la revisión de marketing del ${week.split('-').reverse().join('/')}`,
    due_date: input.due_date ?? null,
  })
  await pool.query(
    `INSERT INTO marketing_review_decisions (week_start, texto, user_id, user_name, due_date, task_id, created_by)
     VALUES ($1::date,$2,$3,$4,$5::date,$6,$7)`,
    [week, input.texto, t.owner.id, t.owner.name, input.due_date ?? null, t.id, user.email]
  )
}

export async function setDecisionResult(id: number, resultado: string | null): Promise<boolean> {
  await ensureSalesTables()
  const { rowCount } = await getPool().query(`UPDATE marketing_review_decisions SET resultado = $2 WHERE id = $1`, [id, resultado])
  return (rowCount ?? 0) > 0
}

/** Quita la decisión de la revisión. La tarea del CRM no se toca. */
export async function removeDecision(id: number): Promise<boolean> {
  await ensureSalesTables()
  const { rowCount } = await getPool().query(`DELETE FROM marketing_review_decisions WHERE id = $1`, [id])
  return (rowCount ?? 0) > 0
}

export async function saveReviewNotes(input: z.infer<typeof notesInput>, by: string | null): Promise<void> {
  await ensureSalesTables()
  await getPool().query(
    `INSERT INTO marketing_reviews (week_start, notas, updated_by) VALUES ($1::date,$2,$3)
     ON CONFLICT (week_start) DO UPDATE SET notas = EXCLUDED.notas, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [mondayOf(input.week_start), input.notas ?? null, by]
  )
}
