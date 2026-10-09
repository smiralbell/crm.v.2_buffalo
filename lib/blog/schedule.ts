/**
 * Calendario aleatorio.
 *
 * Cada semana sale 2 o 3 artículos (según configuración), en días
 * laborables distintos, separados al menos minGapHours, a una hora
 * aleatoria dentro de una de las franjas (minutos incluidos: 09:47,
 * 17:12...). Así no hay un patrón fijo de «lunes a las 8».
 *
 * 1 de cada `newsEvery` huecos es de actualidad. No va en una posición
 * fija: en cada bloque de N huecos, uno al azar.
 *
 * Los huecos se planifican con `planAheadWeeks` de antelación para que
 * haya tiempo de investigar, redactar y revisar antes de la fecha.
 */
import * as store from './store'
import type { BlogSettings, Slot } from './types'

const DAY = 24 * 3600 * 1000

/** Fecha y hora en Madrid → instante UTC (sin librerías: calcula el desfase real). */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm))
  const asTz = new Date(guess.toLocaleString('en-US', { timeZone: tz }))
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() - (asTz.getTime() - asUtc.getTime()))
}

/** Lunes (en UTC, a mediodía) de la semana ISO de una fecha. */
function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12))
  const dow = d.getUTCDay() || 7
  return new Date(d.getTime() - (dow - 1) * DAY)
}

export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dow = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

function inPause(day: Date, s: BlogSettings): boolean {
  const iso = day.toISOString().slice(0, 10)
  return s.schedule.pauses.some((p) => iso >= p.from && iso <= p.to)
}

/** Planifica una semana concreta. No toca semanas que ya tienen huecos. */
function planWeek(monday: Date, s: BlogSettings, prev: Slot[]): Slot[] {
  const sc = s.schedule
  const count = rand(Math.min(sc.minPerWeek, sc.maxPerWeek), Math.max(sc.minPerWeek, sc.maxPerWeek))
  const days = sc.weekdays
    .map((wd) => new Date(monday.getTime() + (wd - 1) * DAY))
    .filter((d) => !inPause(d, s) && d.toISOString().slice(0, 10) >= sc.startDate)

  // Las horas usadas en las últimas semanas, para no repetir el mismo «martes 9:15»
  const recent = new Set(prev.slice(-9).map((p) => `${new Date(p.at).getUTCDay()}-${new Date(p.at).getUTCHours()}`))

  for (let attempt = 0; attempt < 60; attempt++) {
    const pick = [...days].sort(() => Math.random() - 0.5).slice(0, count)
    const slots = pick
      .map((day) => {
        const w = sc.windows[rand(0, sc.windows.length - 1)]
        const minute = rand(toMin(w.from), toMin(w.to) - 1)
        const at = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), Math.floor(minute / 60), minute % 60, sc.timezone)
        return at
      })
      .sort((a, b) => a.getTime() - b.getTime())

    const last = prev.length ? new Date(prev[prev.length - 1].at) : null
    const all = last ? [last, ...slots] : slots
    const gapsOk = all.every((d, i) => i === 0 || d.getTime() - all[i - 1].getTime() >= sc.minGapHours * 3600 * 1000)
    const repeats = slots.filter((d) => recent.has(`${d.getUTCDay()}-${d.getUTCHours()}`)).length
    if (gapsOk && (repeats === 0 || attempt > 40)) {
      return slots.map((at) => ({ id: store.newId('slot-'), at: at.toISOString(), week: isoWeek(at), kind: 'normal' }))
    }
  }
  return []
}

/** Marca 1 de cada N huecos como «actualidad», en una posición aleatoria de cada bloque. */
function assignNews(slots: Slot[], every: number) {
  if (every <= 0) return
  const sorted = [...slots].sort((a, b) => a.at.localeCompare(b.at))
  for (let i = 0; i < sorted.length; i += every) {
    const block = sorted.slice(i, i + every)
    if (block.length < every) break
    if (block.some((b) => b.kind === 'actualidad')) continue
    const free = block.filter((b) => !b.postId && !b.locked)
    if (free.length) free[rand(0, free.length - 1)].kind = 'actualidad'
  }
}

/** Asegura que hay huecos planificados para las próximas semanas. */
export async function ensurePlanned(s: BlogSettings, now = new Date()): Promise<Slot[]> {
  const existing = (await store.list<Slot>('slots')).sort((a, b) => a.at.localeCompare(b.at))
  const weeks = new Set(existing.map((x) => x.week))
  const created: Slot[] = []
  let monday = mondayOf(now)
  const start = new Date(s.schedule.startDate + 'T12:00:00Z')
  if (start > monday) monday = mondayOf(start)

  for (let i = 0; i < s.schedule.planAheadWeeks; i++) {
    const wk = isoWeek(monday)
    if (!weeks.has(wk)) {
      const prev = [...existing, ...created].filter((x) => x.at < monday.toISOString())
      created.push(...planWeek(monday, s, prev))
    }
    monday = new Date(monday.getTime() + 7 * DAY)
  }
  const all = [...existing, ...created]
  assignNews(all, s.schedule.newsEvery)
  await store.putMany('slots', all.filter((x) => created.includes(x) || x.kind === 'actualidad'))
  return all.sort((a, b) => a.at.localeCompare(b.at))
}

/** Vuelve a sortear una semana (los huecos que ya tienen artículo aprobado se respetan). */
export async function reshuffleWeek(week: string, s: BlogSettings): Promise<Slot[]> {
  const all = await store.list<Slot>('slots')
  const inWeek = all.filter((x) => x.week === week)
  const keep = inWeek.filter((x) => x.locked)
  for (const x of inWeek) if (!x.locked) await store.remove('slots', x.id)
  const sample = inWeek[0] ? new Date(inWeek[0].at) : new Date()
  const prev = all.filter((x) => x.week < week).sort((a, b) => a.at.localeCompare(b.at))
  const fresh = planWeek(mondayOf(sample), s, prev).slice(0, Math.max(0, rand(s.schedule.minPerWeek, s.schedule.maxPerWeek) - keep.length))
  // Los artículos que estaban asignados pasan, en orden, a los huecos nuevos
  const assigned = inWeek.filter((x) => !x.locked && x.postId).sort((a, b) => a.at.localeCompare(b.at))
  fresh.forEach((f, i) => {
    if (assigned[i]) {
      f.postId = assigned[i].postId
      f.kind = assigned[i].kind
    }
  })
  await store.putMany('slots', fresh)
  return [...keep, ...fresh]
}
