/** Embudo hasta el cierre, leads parados y revisión semanal: reglas puras (sin base de datos). */
import { CHANNEL_LABELS, type ChannelKey } from '@/lib/leads/analytics.types'

// ——— Columnas del pipeline global ———
/** Avance de cada columna. -1 = remarketing (fuera del embudo). */
export function stageRank(name: string | null | undefined): number {
  const n = (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
  if (!n) return 0
  if (n.includes('REMARKET') || n.includes('PERDID')) return -1
  if (n.includes('REUNION')) return 3
  if (n.includes('PROPUESTA')) return n.includes('ENVIAD') ? 5 : 4
  if (n.includes('NEGOCI')) return 5
  if (n.includes('CONTRATO')) return n.includes('FIRMAD') ? 7 : 6
  if (n.includes('FACTURA')) return 8
  if (n.includes('ONBOARDING')) return 9
  if (n.includes('DESARROLLO')) return 10
  if (n.includes('ACTIVO') || n.includes('CERRADO') || n.includes('GANADO')) return 11
  if (n.includes('CONTACT')) return 2
  if (n.includes('LEAD')) return 1
  return 0
}
export const RANK = { reunion: 3, propuesta: 5, firmado: 7 } as const

/** Avance mínimo que implica el estado del lead. */
export function estadoRank(estado: string | null | undefined): number {
  switch ((estado || '').toLowerCase()) {
    case 'reunion':
      return 3
    case 'propuesta':
    case 'negociando':
      return 5
    case 'cerrado':
    case 'activo':
      return 7
    default:
      return 0
  }
}

// ——— Resultado de un lead ———
export const LOST_REASONS = [
  { id: 'precio', label: 'Precio' },
  { id: 'momento', label: 'No es el momento' },
  { id: 'no_encaja', label: 'No encaja' },
  { id: 'no_contesta', label: 'Dejó de contestar' },
  { id: 'competencia', label: 'Se fue con otro' },
  { id: 'interno', label: 'Lo hacen internamente' },
  { id: 'otro', label: 'Otro' },
] as const
export type LostReason = (typeof LOST_REASONS)[number]['id']
export const reasonLabel = (id: string | null | undefined) => LOST_REASONS.find((r) => r.id === id)?.label ?? 'Sin motivo'

export type LeadOutcome = {
  lead_id: number
  perdido: boolean
  motivo: LostReason | null
  encaja: boolean | null
  no_presentado: boolean
  nota: string | null
  updated_by: string | null
  updated_at: string
}

// ——— Embudo ———
export type FunnelLead = {
  id: number
  name: string
  empresa: string | null
  created_at: string | null
  canal: ChannelKey
  canal_label: string
  stage: string | null
  /** Columna más avanzada a la que ha llegado */
  reached: number
  perdido: boolean
  motivo: LostReason | null
  encaja: boolean | null
  no_presentado: boolean
}
export type FunnelRow = {
  canal: ChannelKey | 'total'
  label: string
  leads: number
  reunion: number
  no_presentado: number
  encaja: number
  propuesta: number
  firmado: number
  perdido: number
  motivo_top: string | null
  spend_eur: number
  /** Inversión ÷ reuniones que encajan */
  coste_reunion_encaja: number | null
}
export type FunnelData = { from: string; to: string; months: number; total: FunnelRow; rows: FunnelRow[]; leads: FunnelLead[]; motivos: { label: string; n: number }[] }

export function motivosOf(leads: Pick<FunnelLead, 'perdido' | 'motivo'>[]): { label: string; n: number }[] {
  const m = new Map<string, number>()
  for (const l of leads) if (l.perdido) m.set(reasonLabel(l.motivo), (m.get(reasonLabel(l.motivo)) || 0) + 1)
  return Array.from(m.entries())
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n)
}

export function funnelRow(canal: FunnelRow['canal'], leads: FunnelLead[], spend: number): FunnelRow {
  const held = leads.filter((l) => l.reached >= RANK.reunion)
  const encaja = held.filter((l) => l.encaja === true && !l.no_presentado).length
  return {
    canal,
    label: canal === 'total' ? 'Total' : CHANNEL_LABELS[canal],
    leads: leads.length,
    reunion: held.length,
    no_presentado: leads.filter((l) => l.no_presentado).length,
    encaja,
    propuesta: leads.filter((l) => l.reached >= RANK.propuesta).length,
    firmado: leads.filter((l) => l.reached >= RANK.firmado).length,
    perdido: leads.filter((l) => l.perdido).length,
    motivo_top: motivosOf(leads).find((m) => m.label !== 'Sin motivo')?.label ?? null,
    spend_eur: Math.round(spend * 100) / 100,
    coste_reunion_encaja: spend > 0 && encaja > 0 ? Math.round((spend / encaja) * 100) / 100 : null,
  }
}

export function buildFunnel(leads: FunnelLead[], spend: Partial<Record<ChannelKey, number>>): Pick<FunnelData, 'rows' | 'total' | 'motivos'> {
  const canales = new Set<ChannelKey>(leads.map((l) => l.canal))
  for (const [c, v] of Object.entries(spend)) if ((v || 0) > 0) canales.add(c as ChannelKey)
  const rows = Array.from(canales)
    .map((c) => funnelRow(c, leads.filter((l) => l.canal === c), spend[c] || 0))
    .sort((a, b) => b.firmado - a.firmado || b.propuesta - a.propuesta || b.reunion - a.reunion || b.leads - a.leads)
  const totalSpend = Object.values(spend).reduce((s: number, v) => s + (v || 0), 0)
  return { rows, total: funnelRow('total', leads, totalSpend), motivos: motivosOf(leads) }
}

// ——— Leads parados ———
export type FollowKind = 'propuesta' | 'reunion' | 'nuevo' | 'parado'
export const FOLLOW_KINDS: { id: FollowKind; label: string; days: number; hint: string }[] = [
  { id: 'propuesta', label: 'Propuestas sin respuesta', days: 3, hint: 'Propuesta o contrato enviado y más de 3 días sin movimiento' },
  { id: 'reunion', label: 'Tras la reunión', days: 4, hint: 'Reunión hecha, sin propuesta y más de 4 días parado' },
  { id: 'nuevo', label: 'Sin contactar', days: 2, hint: 'Lead nuevo con más de 2 días sin contacto' },
  { id: 'parado', label: 'Parados', days: 7, hint: 'En contacto, pero más de 7 días sin movimiento' },
]
export type FollowInput = {
  rank: number
  estado: string | null
  created_at: Date
  last_contact: Date | null
  /** Próxima reunión ya agendada */
  next_meeting: Date | null
  perdido: boolean
  snooze_until: Date | null
}
const DAY = 86_400_000
export const daysSince = (d: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY))
/** Los leads nuevos sin contactar de hace más de 60 días no se listan (bases antiguas). */
export const NEW_LEAD_MAX_DAYS = 60

/** ¿Hay que hacer algo con este lead? null = no. */
export function classifyFollow(l: FollowInput, now: Date): { kind: FollowKind; days: number } | null {
  if (l.perdido || l.rank < 0 || l.rank >= RANK.firmado) return null
  const e = (l.estado || '').toLowerCase()
  if (e === 'cerrado' || e === 'activo' || e === 'perdido') return null
  if (l.next_meeting && l.next_meeting > now) return null
  if (l.snooze_until && l.snooze_until > now) return null
  const rank = Math.max(l.rank, estadoRank(l.estado))
  const days = daysSince(l.last_contact ?? l.created_at, now)
  const kind: FollowKind = rank >= RANK.propuesta ? 'propuesta' : rank >= RANK.reunion ? 'reunion' : l.last_contact ? 'parado' : 'nuevo'
  if (kind === 'nuevo' && days > NEW_LEAD_MAX_DAYS) return null
  if (kind === 'parado' && days > 90) return null
  return days >= FOLLOW_KINDS.find((k) => k.id === kind)!.days ? { kind, days } : null
}
export type FollowLead = {
  id: number
  name: string
  empresa: string | null
  telefono: string | null
  canal_label: string
  stage: string | null
  kind: FollowKind
  days: number
  /** false = la fecha es aproximada (anterior a empezar a medir) */
  exact: boolean
  task: { id: string; title: string; owner: string | null; due_date: string | null } | null
}
export type Person = { id: number; name: string }
export type FollowData = { leads: FollowLead[]; counts: Record<FollowKind, number>; people: Person[]; can_assign: boolean; me: Person }

// ——— Revisión semanal ———
export const MAX_DECISIONS = 3
const ymd = (d: Date) => d.toISOString().slice(0, 10)
/** Lunes de la semana de una fecha YYYY-MM-DD. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return ymd(d)
}
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return ymd(d)
}
export type ReviewDecision = {
  id: number
  week_start: string
  texto: string
  user_id: number
  user_name: string
  due_date: string | null
  task_id: string | null
  /** Estado de la tarea en el CRM (null = la tarea ya no existe) */
  task_status: string | null
  resultado: string | null
}
export type WeekNumbers = { leads: number; reuniones: number; propuestas: number; firmados: number; by_channel: { label: string; n: number }[] }
export type ReviewData = {
  week_start: string
  /** Semana que se repasa (de lunes a domingo anterior) */
  from: string
  to: string
  week: WeekNumbers
  prev: WeekNumbers
  stalled: Record<FollowKind, number>
  pending_channel: number
  summary: string[]
  goals: { period_label: string; days_left: number; items: { label: string; cur: number; goal: number | null }[] }
  decisions: ReviewDecision[]
  previous: ReviewDecision[]
  notas: string | null
  people: Person[]
  can_assign: boolean
  me: Person
}
const pl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`
/** Frases de «qué pasó». */
export function weekSummary(w: WeekNumbers, p: WeekNumbers, stalled: Record<FollowKind, number>, pendingChannel: number): string[] {
  const cmp = (a: number, b: number) => (a === b ? 'igual que la anterior' : a > b ? `${a - b} más que la anterior` : `${b - a} menos que la anterior`)
  const out = [
    `${pl(w.leads, 'lead', 'leads')} (${cmp(w.leads, p.leads)}), ${pl(w.reuniones, 'reunión hecha', 'reuniones hechas')} (${cmp(w.reuniones, p.reuniones)}).`,
  ]
  if (w.by_channel.length) out.push(`Por canal: ${w.by_channel.slice(0, 4).map((c) => `${c.label} ${c.n}`).join(', ')}.`)
  if (w.propuestas || w.firmados) out.push(`${pl(w.propuestas, 'propuesta enviada', 'propuestas enviadas')} y ${pl(w.firmados, 'contrato firmado', 'contratos firmados')}.`)
  if (stalled.propuesta) out.push(`${pl(stalled.propuesta, 'propuesta sin respuesta', 'propuestas sin respuesta')}.`)
  if (stalled.nuevo) out.push(`${pl(stalled.nuevo, 'lead sin contactar', 'leads sin contactar')}.`)
  if (stalled.reunion) out.push(`${pl(stalled.reunion, 'reunión hecha sin siguiente paso', 'reuniones hechas sin siguiente paso')}.`)
  if (pendingChannel) out.push(`Falta confirmar el canal de ${pl(pendingChannel, 'lead', 'leads')}.`)
  return out
}
