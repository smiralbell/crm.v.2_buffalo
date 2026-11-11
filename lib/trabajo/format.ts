import type { WorkEntry, WorkItemInput } from '@/lib/trabajo/types'

/**
 * Reglas del Trabajo diario sin base de datos (se prueban sin conexión).
 */

export const MAX_ITEMS_PER_REPORT = 100
export const MAX_TITLE = 300
export const MAX_DETAIL = 4000
/** Hasta cuántos días atrás se puede apuntar trabajo */
export const MAX_DAYS_BACK = 366

/** Hoy en Madrid, YYYY-MM-DD. */
export function todayMadrid(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function isValidDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export type ProjectRef = { id: string; name: string }

/** Proyecto por id o por nombre (o parte), solo entre los de la persona. */
export function matchProject(raw: unknown, projects: ProjectRef[]): ProjectRef | null {
  const q = String(raw ?? '').trim()
  if (!q) return null
  const byId = projects.find((p) => p.id === q)
  if (byId) return byId
  const n = norm(q)
  const exact = projects.filter((p) => norm(p.name) === n)
  if (exact.length === 1) return exact[0]
  const partial = projects.filter((p) => norm(p.name).includes(n) || n.includes(norm(p.name)))
  return partial.length === 1 ? partial[0] : null
}

export type ValidatedItems =
  | { ok: true; items: WorkItemInput[]; warnings: string[] }
  | { ok: false; error: string }

/**
 * Valida lo que llega del formulario o del agente:
 * [{ fecha, titulo, detalle?, proyecto? (id o nombre), horas? }]
 * Un proyecto que no es suyo no se guarda como proyecto (se avisa).
 */
export function validateWorkItems(raw: unknown, ctx: { today: string; projects: ProjectRef[] }): ValidatedItems {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'No hay ningún trabajo que apuntar' }
  if (raw.length > MAX_ITEMS_PER_REPORT) return { ok: false, error: `Máximo ${MAX_ITEMS_PER_REPORT} trabajos de una vez` }
  const oldest = addDays(ctx.today, -MAX_DAYS_BACK)
  const items: WorkItemInput[] = []
  const warnings: string[] = []

  for (let i = 0; i < raw.length; i++) {
    const o = (raw[i] ?? {}) as Record<string, unknown>
    const n = i + 1
    const fecha = String(o.fecha ?? o.work_date ?? '').trim().slice(0, 10)
    if (!isValidDay(fecha)) return { ok: false, error: `Trabajo ${n}: la fecha tiene que ser YYYY-MM-DD` }
    if (fecha > ctx.today) return { ok: false, error: `Trabajo ${n}: la fecha ${fecha} es futura` }
    if (fecha < oldest) return { ok: false, error: `Trabajo ${n}: la fecha ${fecha} es de hace más de un año` }

    const title = String(o.titulo ?? o.title ?? '').trim()
    if (!title) return { ok: false, error: `Trabajo ${n}: falta el título` }
    const detail = String(o.detalle ?? o.detail ?? '').trim()

    let hours: number | null = null
    const rawHours = o.horas ?? o.hours
    if (rawHours !== undefined && rawHours !== null && rawHours !== '') {
      const h = Number(String(rawHours).replace(',', '.'))
      if (!Number.isFinite(h) || h <= 0 || h > 24) return { ok: false, error: `Trabajo ${n}: horas tiene que estar entre 0 y 24` }
      hours = Math.round(h * 100) / 100
    }

    const rawProject = o.proyecto ?? o.proyecto_id ?? o.project_id
    const project = matchProject(rawProject, ctx.projects)
    if (rawProject && !project) {
      warnings.push(`Trabajo ${n}: "${String(rawProject)}" no es uno de sus proyectos, se guarda sin proyecto`)
    }

    items.push({
      work_date: fecha,
      title: title.slice(0, MAX_TITLE),
      detail: detail ? detail.slice(0, MAX_DETAIL) : null,
      project_id: project?.id ?? null,
      hours,
    })
  }
  return { ok: true, items, warnings }
}

export interface WorkDay {
  date: string
  entries: WorkEntry[]
  hours: number
  reportIds: string[]
}

/** Agrupa por día, del más reciente al más antiguo. */
export function groupByDay(entries: WorkEntry[]): WorkDay[] {
  const map = new Map<string, WorkEntry[]>()
  for (const e of entries) {
    const list = map.get(e.work_date) ?? []
    list.push(e)
    map.set(e.work_date, list)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => {
      const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
      return {
        date,
        entries: sorted,
        hours: Math.round(sorted.reduce((s, e) => s + (e.hours ?? 0), 0) * 100) / 100,
        reportIds: Array.from(new Set(sorted.map((e) => e.report_id).filter((x): x is string => Boolean(x)))),
      }
    })
}

/** Rango [from, to] de un periodo rápido, contando hacia atrás desde hoy. */
export function presetRange(preset: string, today: string): { from: string; to: string } {
  switch (preset) {
    case '7d':
      return { from: addDays(today, -6), to: today }
    case '90d':
      return { from: addDays(today, -89), to: today }
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today }
    case 'all':
      return { from: addDays(today, -MAX_DAYS_BACK), to: today }
    case '30d':
    default:
      return { from: addDays(today, -29), to: today }
  }
}
