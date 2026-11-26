/**
 * Fórmula de horas trabajadas.
 *
 * - Solo cuenta el tiempo que una tarea está «En curso» dentro del horario laboral
 *   (por defecto L–V de 9:00 a 14:00 y de 15:00 a 18:00, hora de Madrid: 8 h al día).
 * - Si una persona tiene varias tareas en curso a la vez, cada minuto se reparte a partes
 *   iguales entre ellas: nadie suma más horas de las que tiene el día.
 * - Por eso el máximo diario de una persona es su jornada.
 * - Si la persona confirma o corrige las horas de una tarea, manda lo que dice ella:
 *   lo calculado se escala para que sume lo confirmado, respetando en qué días se trabajó.
 */

export type Segment = {
  /** Persona (id de usuario o nombre) */
  person: string
  /** Tarea */
  task: string
  start: Date
  /** null = sigue en curso */
  end: Date | null
}

export type Schedule = {
  timeZone: string
  /** Días laborables: 1 = lunes … 7 = domingo */
  days: number[]
  /** Franjas en minutos desde medianoche, hora local */
  blocks: [number, number][]
}

export const DEFAULT_SCHEDULE: Schedule = {
  timeZone: 'Europe/Madrid',
  days: [1, 2, 3, 4, 5],
  blocks: [
    [9 * 60, 14 * 60],
    [15 * 60, 18 * 60],
  ],
}

/** Minutos por día laborable del horario. */
export function workdayMinutes(schedule: Schedule = DEFAULT_SCHEDULE): number {
  return schedule.blocks.reduce((acc, [a, b]) => acc + (b - a), 0)
}

const SLOT_MIN = 5

/** persona → tarea → día (YYYY-MM-DD, hora local) → minutos */
export type HoursTable = Map<string, Map<string, Map<string, number>>>

function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - at.getTime()) / 60000)
}

/** Hora local (y, m, d, minutos) → instante UTC. */
export function zonedToUtc(y: number, m: number, d: number, minutes: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, 0, minutes)
  let off = offsetMinutes(new Date(guess), timeZone)
  let t = guess - off * 60000
  const off2 = offsetMinutes(new Date(t), timeZone)
  if (off2 !== off) {
    off = off2
    t = guess - off * 60000
  }
  return new Date(t)
}

/** Fecha local (YYYY-MM-DD) de un instante. */
export function localDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

function* daysBetween(from: Date, to: Date, timeZone: string): Generator<{ key: string; y: number; m: number; d: number; dow: number }> {
  const [fy, fm, fd] = localDay(from, timeZone).split('-').map(Number)
  const [ty, tm, td] = localDay(to, timeZone).split('-').map(Number)
  const cur = new Date(Date.UTC(fy, fm - 1, fd))
  const end = Date.UTC(ty, tm - 1, td)
  while (cur.getTime() <= end) {
    const y = cur.getUTCFullYear()
    const m = cur.getUTCMonth() + 1
    const d = cur.getUTCDate()
    const dow = ((cur.getUTCDay() + 6) % 7) + 1
    yield { key: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, y, m, d, dow }
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
}

function add(table: HoursTable, person: string, task: string, day: string, minutes: number) {
  let byTask = table.get(person)
  if (!byTask) table.set(person, (byTask = new Map()))
  let byDay = byTask.get(task)
  if (!byDay) byTask.set(task, (byDay = new Map()))
  byDay.set(day, (byDay.get(day) ?? 0) + minutes)
}

/** Minutos trabajados por persona, tarea y día entre `from` y `to`. */
export function computeMinutes(
  segments: Segment[],
  from: Date,
  to: Date,
  opts: { schedule?: Schedule; now?: Date } = {}
): HoursTable {
  const schedule = opts.schedule ?? DEFAULT_SCHEDULE
  const now = (opts.now ?? new Date()).getTime()
  const limit = Math.min(to.getTime(), now)
  const table: HoursTable = new Map()

  const byPerson = new Map<string, { task: string; s: number; e: number }[]>()
  for (const seg of segments) {
    const s = seg.start.getTime()
    const e = Math.min(seg.end ? seg.end.getTime() : now, limit)
    if (e <= s || e <= from.getTime() || s >= limit) continue
    const list = byPerson.get(seg.person) ?? []
    list.push({ task: seg.task, s, e })
    byPerson.set(seg.person, list)
  }

  for (const [person, segs] of Array.from(byPerson.entries())) {
    for (const day of Array.from(daysBetween(from, new Date(limit), schedule.timeZone))) {
      if (!schedule.days.includes(day.dow)) continue
      const dayStart = zonedToUtc(day.y, day.m, day.d, 0, schedule.timeZone).getTime()
      const dayEnd = dayStart + 24 * 3600 * 1000
      const today = segs.filter((g) => g.s < dayEnd && g.e > dayStart)
      if (!today.length) continue
      for (const [a, b] of schedule.blocks) {
        const blockStart = zonedToUtc(day.y, day.m, day.d, a, schedule.timeZone).getTime()
        for (let t = blockStart; t < blockStart + (b - a) * 60000; t += SLOT_MIN * 60000) {
          const mid = t + (SLOT_MIN * 60000) / 2
          if (mid < from.getTime() || mid >= limit) continue
          // Tareas distintas en curso en este momento (la misma tarea dos veces cuenta una)
          const active = Array.from(new Set(today.filter((g) => g.s <= mid && g.e > mid).map((g) => g.task)))
          if (!active.length) continue
          const share = SLOT_MIN / active.length
          for (const task of active) add(table, person, task, day.key, share)
        }
      }
    }
  }
  return table
}

/** Total en minutos de una persona y tarea. */
export function taskTotal(table: HoursTable, person: string, task: string): number {
  const byDay = table.get(person)?.get(task)
  if (!byDay) return 0
  return Array.from(byDay.values()).reduce((a, b) => a + b, 0)
}

/**
 * Aplica las horas confirmadas: el reparto por días de lo calculado se escala para sumar
 * lo confirmado. Si no había nada calculado, se pone todo en el día de la confirmación.
 */
export function applyConfirmed(
  table: HoursTable,
  confirmed: { person: string; task: string; hours: number; day: string }[]
): HoursTable {
  for (const c of confirmed) {
    const target = Math.max(0, c.hours) * 60
    const byDay = table.get(c.person)?.get(c.task)
    const total = byDay ? Array.from(byDay.values()).reduce((a, b) => a + b, 0) : 0
    if (byDay && total > 0) {
      const k = target / total
      for (const [d, m] of Array.from(byDay.entries())) byDay.set(d, m * k)
    } else if (target > 0) {
      add(table, c.person, c.task, c.day, target)
    }
  }
  return table
}

/** Minutos → horas con un decimal. */
export function toHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10
}
