/**
 * Avisos automáticos del CRM (lead nuevo, ticket, incidencia, blog…) con reglas
 * por persona. Este archivo no toca la base de datos: catálogo, reglas por
 * defecto y la decisión de cuándo y cómo se manda cada aviso, para poder probarlo.
 *
 * Destinatarios:
 *  - comun:  los canales compartidos de siempre (correo de alertas, chat de Telegram, push de admins);
 *  - socio:  el WhatsApp de cada socio;
 *  - equipo: el WhatsApp de cada developer / project manager (solo avisos de lo suyo).
 * Cada uno tiene su configuración; lo que no ha tocado sale con la de por defecto.
 */

/** Sin correo: los avisos del CRM van por WhatsApp, Telegram y push. */
export type Channel = 'whatsapp' | 'telegram' | 'push'
export type RecipientKind = 'comun' | 'socio' | 'equipo'
export type Audience = 'socios' | 'equipo'
export type DigestRepeat = 'cada_hora' | 'diario' | 'laborables'
export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type FilterKind = 'origen' | 'prioridad' | 'proyectos'

export interface Rule {
  activo: boolean
  canales: Channel[]
  /** inmediato: al momento. resumen: se juntan y salen a la hora del resumen. */
  modo: 'inmediato' | 'resumen'
  repetir: DigestRepeat
  /** HH:MM, hora de Madrid del resumen (en cada_hora no se usa) */
  hora: string
  /** Los avisos urgentes salen aunque esté en horas de silencio */
  urgente_salta_silencio: boolean
  formato: 'corto' | 'detallado'
  /** Filtros: vacío = todo */
  origen: string[]
  prioridad_min: Priority | null
  proyectos: string[]
}

export interface Prefs {
  /** Horas de silencio, hora de Madrid. Lo que llegue entonces sale al terminar. */
  silencio: { desde: string; hasta: string } | null
  /** Hasta cuándo está todo en pausa (ISO). Al volver, le llega un resumen. */
  pausa_hasta: string | null
  /** Cómo quiere los resúmenes («primero lo urgente», «en 3 puntos»…) */
  estilo_resumen: string | null
  reglas: Partial<Record<string, Partial<Rule>>>
}

export interface EventDef {
  key: string
  nombre: string
  descripcion: string
  audience: Audience
  filtros: FilterKind[]
  /** Configuración por defecto que cambia según a quién vaya */
  defaults?: Partial<Record<RecipientKind, Partial<Rule>>>
}

export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical']
export const PRIORITY_NAMES: Record<Priority, string> = { low: 'baja', medium: 'media', high: 'alta', critical: 'crítica' }
export const DIGEST_REPEATS: DigestRepeat[] = ['cada_hora', 'diario', 'laborables']

/** Canales que puede usar cada tipo de destinatario. */
export const CHANNELS_BY_KIND: Record<RecipientKind, Channel[]> = {
  // Todo por WhatsApp: el canal común (Telegram y push) ya no recibe avisos del CRM
  comun: [],
  socio: ['whatsapp'],
  equipo: ['whatsapp'],
}

export const EVENTS: EventDef[] = [
  // ——— Socios ———
  {
    key: 'lead_nuevo',
    nombre: 'Lead nuevo',
    descripcion: 'Entra un lead por el formulario web o por Meta (Facebook / Instagram)',
    audience: 'socios',
    filtros: ['origen'],
  },
  {
    key: 'ticket_nuevo',
    nombre: 'Ticket nuevo',
    descripcion: 'Un cliente abre un ticket de soporte',
    audience: 'socios',
    filtros: ['prioridad', 'proyectos'],
  },
  {
    key: 'incidencia_nueva',
    nombre: 'Incidencia nueva',
    descripcion: 'El sistema de un cliente en producción da un error',
    audience: 'socios',
    filtros: ['proyectos'],
  },
  {
    key: 'incidencias_abiertas',
    nombre: 'Incidencias sin resolver',
    descripcion: 'Recordatorio de las incidencias que siguen abiertas',
    audience: 'socios',
    filtros: ['proyectos'],
  },
  {
    key: 'blog_revision',
    nombre: 'Blog para revisar',
    descripcion: 'Un artículo del blog está listo para leer y publicar',
    audience: 'socios',
    filtros: [],
    defaults: { socio: { modo: 'resumen', repetir: 'diario', hora: '09:00' } },
  },
  {
    key: 'blog_pendientes',
    nombre: 'Blogs sin revisar',
    descripcion: 'Recordatorio diario de los artículos que siguen esperando revisión',
    audience: 'socios',
    filtros: [],
  },
  {
    key: 'recordatorio_incidencia',
    nombre: 'Recordatorio: incidencia sin resolver',
    descripcion: 'Cada 6 horas mientras una incidencia siga abierta (como mucho 2 días)',
    audience: 'socios',
    filtros: ['proyectos'],
  },
  {
    key: 'recordatorio_ticket',
    nombre: 'Recordatorio: ticket sin resolver',
    descripcion: 'Cada día mientras un ticket siga abierto',
    audience: 'socios',
    filtros: ['prioridad', 'proyectos'],
  },
  {
    key: 'recordatorio_tarea_socio',
    nombre: 'Recordatorio de tarea',
    descripcion: 'Cada X horas, solo para las tareas que tú pidas, hasta que estén hechas',
    audience: 'socios',
    filtros: [],
  },
  {
    key: 'blog_publicado',
    nombre: 'Blog publicado',
    descripcion: 'Se publica un artículo nuevo del blog',
    audience: 'socios',
    filtros: [],
  },
  {
    key: 'ingreso_grande',
    nombre: 'Ingreso de más de 100 €',
    descripcion: 'Entra en el banco un ingreso de más de 100 €',
    audience: 'socios',
    filtros: [],
  },
  {
    key: 'gasto_grande',
    nombre: 'Gasto de más de 100 €',
    descripcion: 'Sale del banco un gasto de más de 100 €',
    audience: 'socios',
    filtros: [],
  },
  {
    key: 'factura_fallida',
    nombre: 'Factura que no se envía',
    descripcion: 'Una factura recurrente no se ha podido mandar por correo',
    audience: 'socios',
    filtros: [],
  },
  {
    key: 'objetivo_anual',
    nombre: 'Objetivo anual',
    descripcion: 'Se alcanza el objetivo de facturación del año',
    audience: 'socios',
    filtros: [],
  },
  {
    key: 'sistema',
    nombre: 'Avisos del sistema',
    descripcion: 'Mensajes técnicos del CRM (migraciones, procesos internos)',
    audience: 'socios',
    filtros: [],
    defaults: { socio: { activo: false } },
  },
  // ——— Equipo (cada uno, solo lo suyo) ———
  {
    key: 'ticket_asignado',
    nombre: 'Ticket asignado',
    descripcion: 'Te asignan un ticket de un cliente',
    audience: 'equipo',
    filtros: ['prioridad', 'proyectos'],
  },
  {
    key: 'incidencia_mi_proyecto',
    nombre: 'Incidencia en tu proyecto',
    descripcion: 'Da un error el sistema de uno de tus proyectos en producción',
    audience: 'equipo',
    filtros: ['proyectos'],
  },
  {
    key: 'tarea_asignada',
    nombre: 'Tarea nueva para ti',
    descripcion: 'Alguien te pone una tarea o te asigna una de un proyecto',
    audience: 'equipo',
    filtros: ['proyectos'],
  },
  {
    key: 'recordatorio_incidencia_equipo',
    nombre: 'Recordatorio: incidencia de tu proyecto',
    descripcion: 'Cada 6 horas mientras una incidencia de tu proyecto siga abierta',
    audience: 'equipo',
    filtros: ['proyectos'],
  },
  {
    key: 'recordatorio_ticket_equipo',
    nombre: 'Recordatorio: ticket asignado',
    descripcion: 'Cada día mientras un ticket asignado a ti siga abierto',
    audience: 'equipo',
    filtros: ['prioridad', 'proyectos'],
  },
  {
    key: 'recordatorio_tarea',
    nombre: 'Recordatorio de tarea',
    descripcion: 'Cada X horas, solo para las tareas en las que tú lo pidas, hasta que estén hechas',
    audience: 'equipo',
    filtros: [],
  },
  {
    key: 'tarea_movida',
    nombre: 'Tarea movida',
    descripcion: 'Alguien mueve una de tus tareas de columna o de estado',
    audience: 'equipo',
    filtros: ['proyectos'],
  },
  {
    // Ya no se recuerdan las tareas que vencen: solo si se activa a mano
    key: 'tarea_vence',
    nombre: 'Tareas que vencen',
    descripcion: 'Tus tareas que vencen hoy o mañana (apagado: no se recuerdan tareas)',
    audience: 'equipo',
    filtros: ['proyectos'],
    defaults: { equipo: { activo: false } },
  },
]

export function getEvent(key: string): EventDef | null {
  return EVENTS.find((e) => e.key === key) ?? null
}

export function eventsFor(kind: RecipientKind): EventDef[] {
  return EVENTS.filter((e) => (kind === 'equipo' ? e.audience === 'equipo' : e.audience === 'socios'))
}

export function emptyPrefs(): Prefs {
  return { silencio: null, pausa_hasta: null, estilo_resumen: null, reglas: {} }
}

/** Lo guardado en BD puede venir incompleto o de una versión anterior. */
export function normalizePrefs(raw: unknown): Prefs {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Prefs>
  const silencio =
    p.silencio && isHHMM(p.silencio.desde) && isHHMM(p.silencio.hasta) && p.silencio.desde !== p.silencio.hasta
      ? { desde: p.silencio.desde, hasta: p.silencio.hasta }
      : null
  return {
    silencio,
    pausa_hasta: typeof p.pausa_hasta === 'string' && !Number.isNaN(Date.parse(p.pausa_hasta)) ? p.pausa_hasta : null,
    estilo_resumen: typeof p.estilo_resumen === 'string' && p.estilo_resumen.trim() ? p.estilo_resumen.trim() : null,
    reglas: p.reglas && typeof p.reglas === 'object' ? p.reglas : {},
  }
}

/** La regla que se aplica: la de por defecto del aviso para ese destinatario, con lo que haya cambiado encima. */
export function effectiveRule(event: EventDef, kind: RecipientKind, prefs: Prefs): Rule {
  const base: Rule = {
    activo: true,
    canales: [...CHANNELS_BY_KIND[kind]],
    modo: 'inmediato',
    repetir: 'diario',
    hora: '09:00',
    urgente_salta_silencio: false,
    formato: 'detallado',
    origen: [],
    prioridad_min: null,
    proyectos: [],
  }
  const merged = { ...base, ...(event.defaults?.[kind] ?? {}), ...(prefs.reglas[event.key] ?? {}) }
  const allowed = CHANNELS_BY_KIND[kind]
  merged.canales = merged.canales.filter((c) => allowed.includes(c))
  return merged
}

// ——— Hora de Madrid ———

export function isHHMM(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
}

/** «9», «9:30», «09.30», «21h» → «09:30». null si no es una hora. */
export function parseHHMM(v: unknown): string | null {
  const m = /^\s*(\d{1,2})(?:[:.h](\d{2}))?\s*h?\s*$/i.exec(String(v ?? ''))
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2] ?? 0)
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

type MadridParts = { y: number; mo: number; d: number; h: number; mi: number; weekday: number }

const MADRID_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
})

export function madridParts(date: Date): MadridParts {
  const parts = MADRID_FORMAT.formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    y: Number(get('year')),
    mo: Number(get('month')),
    d: Number(get('day')),
    h: Number(get('hour')),
    mi: Number(get('minute')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  }
}

/** El instante en que en Madrid es ese día a esa hora (verano e invierno incluidos). */
export function madridTime(y: number, mo: number, d: number, hhmm: string): Date {
  const [h, mi] = hhmm.split(':').map(Number)
  const target = Date.UTC(y, mo - 1, d, h, mi)
  let guess = target
  // Dos pasadas bastan: el desfase de Madrid es de 1 o 2 horas
  for (let i = 0; i < 2; i++) {
    const p = madridParts(new Date(guess))
    guess += target - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi)
  }
  return new Date(guess)
}

function addDays(p: { y: number; mo: number; d: number }, n: number): { y: number; mo: number; d: number } {
  const t = new Date(Date.UTC(p.y, p.mo - 1, p.d + n))
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

/** YYYY-MM-DD de Madrid, a n días de date. */
export function madridYmd(date: Date, n = 0): string {
  const d = addDays(madridParts(date), n)
  return `${d.y}-${String(d.mo).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Próxima vez (estrictamente después de now) que sale un resumen con esa regla. */
export function nextDigestTime(rule: Pick<Rule, 'repetir' | 'hora'>, now: Date): Date {
  const p = madridParts(now)
  if (rule.repetir === 'cada_hora') {
    const top = madridTime(p.y, p.mo, p.d, `${String(p.h).padStart(2, '0')}:00`)
    return new Date(top.getTime() + 60 * 60_000)
  }
  for (let i = 0; i < 8; i++) {
    const day = addDays(p, i)
    const at = madridTime(day.y, day.mo, day.d, rule.hora)
    if (at.getTime() <= now.getTime()) continue
    if (rule.repetir === 'laborables' && [0, 6].includes(madridParts(at).weekday)) continue
    return at
  }
  return new Date(now.getTime() + 24 * 60 * 60_000)
}

export function inSilence(silencio: Prefs['silencio'], now: Date): boolean {
  if (!silencio) return false
  const p = madridParts(now)
  const m = p.h * 60 + p.mi
  const from = minutesOf(silencio.desde)
  const to = minutesOf(silencio.hasta)
  return from < to ? m >= from && m < to : m >= from || m < to
}

/** Cuándo terminan las horas de silencio en las que cae now. */
export function silenceEnd(silencio: NonNullable<Prefs['silencio']>, now: Date): Date {
  const p = madridParts(now)
  for (let i = 0; i < 2; i++) {
    const day = addDays(p, i)
    const at = madridTime(day.y, day.mo, day.d, silencio.hasta)
    if (at.getTime() > now.getTime()) return at
  }
  return new Date(now.getTime() + 24 * 60 * 60_000)
}

// ——— Filtros ———

export interface NotifyData {
  /** web, meta… */
  origen?: string | null
  prioridad?: string | null
  proyecto?: string | null
}

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** ¿Pasa los filtros de su regla? Lo que el aviso no trae (p. ej. sin proyecto) no se filtra. */
export function passesFilters(rule: Rule, data: NotifyData): { ok: true } | { ok: false; reason: string } {
  if (rule.origen.length && data.origen) {
    if (!rule.origen.map(norm).includes(norm(data.origen))) return { ok: false, reason: `origen ${data.origen}` }
  }
  if (rule.prioridad_min && data.prioridad) {
    const got = PRIORITIES.indexOf(data.prioridad as Priority)
    if (got >= 0 && got < PRIORITIES.indexOf(rule.prioridad_min)) {
      return { ok: false, reason: `prioridad ${PRIORITY_NAMES[data.prioridad as Priority]}` }
    }
  }
  if (rule.proyectos.length && data.proyecto) {
    const p = norm(data.proyecto)
    if (!rule.proyectos.some((x) => norm(x) && p.includes(norm(x)))) return { ok: false, reason: `proyecto ${data.proyecto}` }
  }
  return { ok: true }
}

// ——— La decisión ———

export type Decision =
  | { action: 'skip'; reason: string }
  /** at <= now y digest=false: se manda ya */
  | { action: 'queue'; at: Date; digest: boolean; reason?: string }

function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

function outOfSilence(prefs: Prefs, at: Date): Date {
  return inSilence(prefs.silencio, at) ? silenceEnd(prefs.silencio!, at) : at
}

/**
 * Qué se hace con un aviso para un destinatario: no mandarlo, mandarlo ya o
 * dejarlo en cola (resumen, horas de silencio o pausa).
 */
export function decide(rule: Rule, prefs: Prefs, now: Date, msg: { urgent?: boolean; data?: NotifyData }): Decision {
  if (!rule.activo) return { action: 'skip', reason: 'desactivado' }
  if (!rule.canales.length) return { action: 'skip', reason: 'sin canal' }
  const filter = passesFilters(rule, msg.data ?? {})
  if (!filter.ok) return { action: 'skip', reason: `filtro: ${filter.reason}` }

  const pause = prefs.pausa_hasta ? new Date(prefs.pausa_hasta) : null
  if (pause && pause.getTime() > now.getTime()) {
    const at = rule.modo === 'resumen' ? laterOf(pause, nextDigestTime(rule, pause)) : pause
    return { action: 'queue', at: outOfSilence(prefs, at), digest: true, reason: 'en pausa' }
  }

  const bypass = msg.urgent === true && rule.urgente_salta_silencio
  if (rule.modo === 'resumen') {
    const at = nextDigestTime(rule, now)
    return { action: 'queue', at: bypass ? at : outOfSilence(prefs, at), digest: true, reason: 'resumen' }
  }
  if (!bypass && inSilence(prefs.silencio, now)) {
    return { action: 'queue', at: silenceEnd(prefs.silencio!, now), digest: true, reason: 'horas de silencio' }
  }
  return { action: 'queue', at: now, digest: false }
}

// ——— Cambios desde el chat ———

export type RuleChange = {
  activo?: unknown
  modo?: unknown
  repetir?: unknown
  hora?: unknown
  urgente_salta_silencio?: unknown
  formato?: unknown
  canales?: unknown
  origen?: unknown
  prioridad_min?: unknown
  proyectos?: unknown
}

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  return String(v ?? '')
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

const PRIORITY_FROM: Record<string, Priority> = {
  low: 'low',
  baja: 'low',
  medium: 'medium',
  media: 'medium',
  high: 'high',
  alta: 'high',
  critical: 'critical',
  critica: 'critical',
  urgente: 'critical',
}

/**
 * Valida lo que pide la persona y devuelve el trozo de regla que se guarda.
 * Nada que no sea del catálogo o de su tipo de destinatario.
 */
export function ruleChange(
  event: EventDef,
  kind: RecipientKind,
  change: RuleChange
): { ok: true; patch: Partial<Rule> } | { ok: false; error: string } {
  const patch: Partial<Rule> = {}
  if (change.activo !== undefined) patch.activo = change.activo === true || change.activo === 'true'
  if (change.modo !== undefined) {
    if (change.modo !== 'inmediato' && change.modo !== 'resumen') return { ok: false, error: 'modo: inmediato o resumen' }
    patch.modo = change.modo
  }
  if (change.repetir !== undefined) {
    if (!DIGEST_REPEATS.includes(change.repetir as DigestRepeat)) {
      return { ok: false, error: `repetir: ${DIGEST_REPEATS.join(', ')}` }
    }
    patch.repetir = change.repetir as DigestRepeat
  }
  if (change.hora !== undefined) {
    const h = parseHHMM(change.hora)
    if (!h) return { ok: false, error: 'hora no válida: usa HH:MM, p. ej. 09:00' }
    patch.hora = h
  }
  if (change.urgente_salta_silencio !== undefined) patch.urgente_salta_silencio = change.urgente_salta_silencio === true
  if (change.formato !== undefined) {
    if (change.formato !== 'corto' && change.formato !== 'detallado') return { ok: false, error: 'formato: corto o detallado' }
    patch.formato = change.formato
  }
  if (change.canales !== undefined) {
    const wanted = list(change.canales).map(norm) as Channel[]
    const allowed = CHANNELS_BY_KIND[kind]
    if (wanted.some((c) => !allowed.includes(c))) return { ok: false, error: `Aquí solo se puede usar: ${allowed.join(', ')}` }
    patch.canales = wanted
  }
  if (change.origen !== undefined) {
    if (!event.filtros.includes('origen')) return { ok: false, error: `${event.nombre} no se puede filtrar por origen` }
    patch.origen = list(change.origen).map(norm)
  }
  if (change.prioridad_min !== undefined) {
    if (!event.filtros.includes('prioridad')) return { ok: false, error: `${event.nombre} no se puede filtrar por prioridad` }
    const raw = norm(change.prioridad_min)
    if (!raw || raw === 'todas' || raw === 'ninguna') patch.prioridad_min = null
    else if (PRIORITY_FROM[raw]) patch.prioridad_min = PRIORITY_FROM[raw]
    else return { ok: false, error: 'prioridad_min: baja, media, alta o crítica' }
  }
  if (change.proyectos !== undefined) {
    if (!event.filtros.includes('proyectos')) return { ok: false, error: `${event.nombre} no se puede filtrar por proyecto` }
    patch.proyectos = list(change.proyectos)
  }
  if (!Object.keys(patch).length) return { ok: false, error: 'No has dicho qué cambiar' }
  return { ok: true, patch }
}

/** Una regla en palabras, para enseñarla en el chat. */
export function describeRule(event: EventDef, rule: Rule): string {
  if (!rule.activo) return `${event.nombre}: desactivado`
  const when =
    rule.modo === 'inmediato'
      ? 'al momento'
      : rule.repetir === 'cada_hora'
        ? 'en un resumen cada hora'
        : `en un resumen ${rule.repetir === 'laborables' ? 'los laborables' : 'cada día'} a las ${rule.hora}`
  const filters = [
    rule.origen.length ? `solo origen ${rule.origen.join('/')}` : '',
    rule.prioridad_min ? `prioridad ${PRIORITY_NAMES[rule.prioridad_min]} o más` : '',
    rule.proyectos.length ? `solo ${rule.proyectos.join(', ')}` : '',
    rule.urgente_salta_silencio ? 'lo urgente salta el silencio' : '',
    rule.formato === 'corto' ? 'formato corto' : '',
  ].filter(Boolean)
  return `${event.nombre}: ${when} por ${rule.canales.join(' y ')}${filters.length ? ` (${filters.join(', ')})` : ''}`
}

// ——— Mensajes ———

export interface QueuedItem {
  event: string
  subject: string
  body: string
}

/** Un aviso suelto en texto plano. */
export function singleText(item: QueuedItem, formato: Rule['formato'], link?: string | null): string {
  if (formato === 'corto') return [item.subject, link].filter(Boolean).join('\n')
  return item.body.includes(item.subject) ? item.body : `${item.subject}\n\n${item.body}`
}

/** Resumen de varios avisos, agrupados por tipo. */
export function digestText(items: QueuedItem[], formato: Rule['formato'], reason?: string | null): string {
  const groups = new Map<string, QueuedItem[]>()
  for (const it of items) groups.set(it.event, [...(groups.get(it.event) ?? []), it])
  const head =
    reason === 'horas de silencio'
      ? `Mientras estabas en silencio (${items.length})`
      : reason === 'en pausa'
        ? `Mientras tenías los avisos en pausa (${items.length})`
        : `Resumen de avisos (${items.length})`
  const parts = [head]
  for (const [key, group] of Array.from(groups.entries())) {
    const name = getEvent(key)?.nombre ?? key
    const lines = group.map((it) => {
      if (formato === 'corto') return `- ${it.subject}`
      const detail = it.body
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && l !== it.subject && !/^abrir:/i.test(l))
        .slice(0, 3)
        .join(' · ')
        .slice(0, 280)
      return `- ${it.subject}${detail ? `\n  ${detail}` : ''}`
    })
    parts.push(`${name} (${group.length})\n${lines.join('\n')}`)
  }
  return parts.join('\n\n')
}
