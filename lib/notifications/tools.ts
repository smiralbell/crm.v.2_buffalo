import { getPool } from '@/lib/db'
import { recordUndo, snapshotWhere, type UndoStep } from '@/lib/telegram-agent/undo'
import { COMMON_KEY, getPrefs, notificationHistory, savePrefs } from './notify'
import {
  DIGEST_REPEATS,
  describeRule,
  effectiveRule,
  eventsFor,
  getEvent,
  isHHMM,
  parseHHMM,
  ruleChange,
  type Prefs,
  type RecipientKind,
} from './rules'

/**
 * Herramientas para que cada persona configure desde el chat sus avisos
 * automáticos: qué le llega, por dónde, cuándo (al momento o en resumen),
 * horas de silencio, pausa, filtros y formato. Lo usan los dos agentes.
 *
 * El dueño de la configuración lo pone el servidor. Un socio puede cambiar la
 * suya y la del canal común (correo, Telegram, push); el equipo, solo la suya.
 */

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'function' as const, function: { name, description, parameters: { type: 'object', properties, required } } }
}

const ruleProps = {
  activo: { type: 'boolean', description: 'false = no avisar de esto' },
  modo: { type: 'string', enum: ['inmediato', 'resumen'], description: 'Al momento, o juntos en un resumen' },
  repetir: { type: 'string', enum: [...DIGEST_REPEATS], description: 'Cada cuánto sale el resumen' },
  hora: { type: 'string', description: 'Hora del resumen, HH:MM (Madrid)' },
  urgente_salta_silencio: { type: 'boolean', description: 'Si lo urgente llega aunque esté en horas de silencio' },
  formato: { type: 'string', enum: ['corto', 'detallado'] },
  origen: { type: 'array', items: { type: 'string' }, description: 'Solo leads de estos orígenes (web, meta). [] = todos' },
  prioridad_min: { type: 'string', description: 'Solo tickets de esta prioridad o más: baja, media, alta, crítica ("todas" para quitarlo)' },
  proyectos: { type: 'array', items: { type: 'string' }, description: 'Solo de estos proyectos (nombre o parte). [] = todos' },
}

function destinoProp(withDestino: boolean) {
  return withDestino
    ? {
        destino: {
          type: 'string',
          enum: ['yo', 'comun'],
          description: '"yo" = su WhatsApp (por defecto). "comun" = el correo, el Telegram y el push que reciben los dos socios.',
        },
      }
    : {}
}

/** Esquemas: los socios eligen destino (suyo o común); el equipo, solo lo suyo. */
export function notificationTools(kind: 'socio' | 'equipo') {
  const withDestino = kind === 'socio'
  const events = eventsFor(kind === 'socio' ? 'socio' : 'equipo')
  const list = events.map((e) => `${e.key} (${e.nombre})`).join(', ')
  return [
    tool(
      'avisos_auto_ver',
      'Cómo tiene configurados los avisos automáticos del CRM: cada tipo de aviso, si le llega, por dónde, cuándo y con qué filtros; y sus horas de silencio, pausa y estilo de los resúmenes.',
      { ...destinoProp(withDestino) }
    ),
    tool(
      'avisos_auto_cambiar',
      `Cambia cómo le llega un tipo de aviso automático. Solo cambia lo que mandes. aviso: ${list}, o "todos". Ejemplos: «no me avises de los blogs» → activo=false; «los leads en un resumen a las 9» → modo=resumen, hora=09:00; «solo tickets urgentes» → prioridad_min=crítica.`,
      { ...destinoProp(withDestino), aviso: { type: 'string', enum: [...events.map((e) => e.key), 'todos'] }, ...ruleProps },
      ['aviso']
    ),
    tool(
      'avisos_auto_general',
      'Ajustes para todos sus avisos: horas de silencio (lo que llega entonces sale al terminar), pausa hasta una fecha («silencia todo hasta el lunes»: al volver le llega un resumen) y estilo de los resúmenes («primero lo urgente», «en 3 puntos»).',
      {
        ...destinoProp(withDestino),
        silencio_desde: { type: 'string', description: 'HH:MM' },
        silencio_hasta: { type: 'string', description: 'HH:MM' },
        quitar_silencio: { type: 'boolean' },
        pausa_hasta: { type: 'string', description: 'ISO 8601 con zona (Europe/Madrid)' },
        quitar_pausa: { type: 'boolean' },
        estilo_resumen: { type: 'string', description: 'Vacío para quitarlo' },
      }
    ),
    tool(
      'avisos_auto_restablecer',
      'Vuelve a la configuración por defecto: la de un tipo de aviso, o toda (sin aviso).',
      { ...destinoProp(withDestino), aviso: { type: 'string', enum: events.map((e) => e.key) } }
    ),
    tool(
      'avisos_auto_historial',
      'Qué avisos le han llegado, cuáles están en cola y cuáles no se mandaron y por qué (desactivado, filtro, en resumen…). Para «¿por qué no me llegó…?».',
      {
        ...destinoProp(withDestino),
        aviso: { type: 'string', enum: events.map((e) => e.key) },
        dias: { type: 'number', description: 'Por defecto 7' },
      }
    ),
  ]
}

export const NOTIFICATION_TOOL_NAMES = new Set(notificationTools('socio').map((t) => t.function.name))
export const NOTIFICATION_READ_ONLY = new Set(['avisos_auto_ver', 'avisos_auto_historial'])

export type NotificationToolOptions = {
  kind: 'socio' | 'equipo'
  /** Su configuración personal: user:<id> (equipo) o chat:<chat de WhatsApp> (socio). null = no tiene. */
  ownerKey: string | null
  /** Conversación, para el «deshacer» */
  chatId: number
}

type Fail = { ok: false; error: string }
const fail = (error: string): Fail => ({ ok: false, error })

function target(args: Record<string, unknown>, opts: NotificationToolOptions): { key: string; kind: RecipientKind } | Fail {
  if (opts.kind === 'equipo') return opts.ownerKey ? { key: opts.ownerKey, kind: 'equipo' } : fail('No tienes avisos configurables')
  if (args.destino === 'comun') return { key: COMMON_KEY, kind: 'comun' }
  if (!opts.ownerKey) {
    return fail(
      'Tu configuración personal va con tu WhatsApp. Desde aquí puedes cambiar la del canal común (correo, Telegram y push): usa destino="comun".'
    )
  }
  return { key: opts.ownerKey, kind: 'socio' }
}

/** Guarda la configuración y apunta cómo volver a la anterior (para «deshacer»). */
async function saveWithUndo(chatId: number, key: string, label: string, next: Prefs): Promise<number | null> {
  const before = await snapshotWhere(getPool(), 'notification_prefs', 'owner_key = $1', [key]).catch(() => [])
  await savePrefs(key, next)
  const after = await snapshotWhere(getPool(), 'notification_prefs', 'owner_key = $1', [key]).catch(() => [])
  if (!after[0]) return null
  const step: UndoStep = before[0]
    ? { op: 'revert', table: 'notification_prefs', before: before[0], after: after[0] }
    : { op: 'remove', table: 'notification_prefs', after: after[0] }
  return recordUndo(chatId, label, [step]).catch(() => null)
}

function overview(kind: RecipientKind, prefs: Prefs) {
  const now = Date.now()
  return {
    avisos: eventsFor(kind).map((e) => {
      const rule = effectiveRule(e, kind, prefs)
      return {
        aviso: e.key,
        nombre: e.nombre,
        que_es: e.descripcion,
        como: describeRule(e, rule),
        cambiado: Boolean(prefs.reglas[e.key] && Object.keys(prefs.reglas[e.key]!).length),
        filtros_posibles: e.filtros,
      }
    }),
    silencio: prefs.silencio ? `de ${prefs.silencio.desde} a ${prefs.silencio.hasta}` : 'sin horas de silencio',
    pausa: prefs.pausa_hasta && Date.parse(prefs.pausa_hasta) > now
      ? `en pausa hasta ${new Date(prefs.pausa_hasta).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`
      : 'sin pausa',
    estilo_resumen: prefs.estilo_resumen ?? 'normal',
  }
}

/** Ejecuta una herramienta de avisos. undefined = no es de este módulo. */
export async function runNotificationTool(
  name: string,
  args: Record<string, unknown>,
  opts: NotificationToolOptions
): Promise<unknown> {
  if (!NOTIFICATION_TOOL_NAMES.has(name)) return undefined
  const t = target(args, opts)
  if ('ok' in t) return t
  const prefs = await getPrefs(t.key)
  const who = t.kind === 'comun' ? 'canal común' : 'tus avisos'
  const events = eventsFor(t.kind)

  switch (name) {
    case 'avisos_auto_ver':
      return {
        ok: true,
        destino: t.kind === 'comun' ? 'canal común (correo, Telegram y push de los dos socios)' : 'tu WhatsApp',
        ...overview(t.kind, prefs),
        ...(t.kind === 'socio'
          ? { nota: 'Además, los avisos de los socios siguen llegando al canal común salvo que también los quites ahí (destino="comun").' }
          : {}),
      }

    case 'avisos_auto_cambiar': {
      const keys = args.aviso === 'todos' ? events.map((e) => e.key) : [String(args.aviso ?? '')]
      const next: Prefs = { ...prefs, reglas: { ...prefs.reglas } }
      const changed: string[] = []
      for (const key of keys) {
        const event = getEvent(key)
        if (!event || !events.includes(event)) return fail(`Aviso no válido. Usa: ${events.map((e) => e.key).join(', ')}`)
        // Con "todos", los filtros que un aviso no admite simplemente no se le aplican
        const change = { ...args }
        if (args.aviso === 'todos') {
          if (!event.filtros.includes('origen')) delete change.origen
          if (!event.filtros.includes('prioridad')) delete change.prioridad_min
          if (!event.filtros.includes('proyectos')) delete change.proyectos
        }
        const res = ruleChange(event, t.kind, change)
        if (!res.ok) {
          if (args.aviso === 'todos' && res.error === 'No has dicho qué cambiar') continue
          return fail(res.error)
        }
        next.reglas[key] = { ...(next.reglas[key] ?? {}), ...res.patch }
        changed.push(describeRule(event, effectiveRule(event, t.kind, next)))
      }
      if (!changed.length) return fail('No has dicho qué cambiar')
      const undo = await saveWithUndo(opts.chatId, t.key, `Cambiar avisos (${who})`, next)
      return { ok: true, ahora: changed, ...(undo ? { deshacer: 'Se puede deshacer.' } : {}) }
    }

    case 'avisos_auto_general': {
      const next: Prefs = { ...prefs }
      if (args.quitar_silencio === true) next.silencio = null
      else if (args.silencio_desde !== undefined || args.silencio_hasta !== undefined) {
        const desde = parseHHMM(args.silencio_desde ?? prefs.silencio?.desde)
        const hasta = parseHHMM(args.silencio_hasta ?? prefs.silencio?.hasta)
        if (!desde || !hasta || !isHHMM(desde) || !isHHMM(hasta) || desde === hasta) {
          return fail('Horas de silencio no válidas: di desde y hasta en HH:MM, p. ej. 21:00 y 08:00')
        }
        next.silencio = { desde, hasta }
      }
      if (args.quitar_pausa === true) next.pausa_hasta = null
      else if (args.pausa_hasta !== undefined) {
        const until = new Date(String(args.pausa_hasta))
        if (Number.isNaN(until.getTime())) return fail('pausa_hasta no es una fecha válida (ISO 8601 con zona)')
        if (until.getTime() <= Date.now()) return fail('Esa fecha ya ha pasado')
        if (until.getTime() > Date.now() + 60 * 24 * 60 * 60_000) return fail('Como mucho, dos meses de pausa')
        next.pausa_hasta = until.toISOString()
      }
      if (args.estilo_resumen !== undefined) {
        const estilo = String(args.estilo_resumen ?? '').trim().slice(0, 300)
        next.estilo_resumen = estilo || null
      }
      if (JSON.stringify(next) === JSON.stringify(prefs)) return fail('No has dicho qué cambiar')
      const undo = await saveWithUndo(opts.chatId, t.key, `Cambiar ajustes de avisos (${who})`, next)
      const view = overview(t.kind, next)
      return { ok: true, silencio: view.silencio, pausa: view.pausa, estilo_resumen: view.estilo_resumen, ...(undo ? { deshacer: 'Se puede deshacer.' } : {}) }
    }

    case 'avisos_auto_restablecer': {
      const next: Prefs = args.aviso
        ? { ...prefs, reglas: Object.fromEntries(Object.entries(prefs.reglas).filter(([k]) => k !== args.aviso)) }
        : { silencio: null, pausa_hasta: null, estilo_resumen: null, reglas: {} }
      if (args.aviso && !getEvent(String(args.aviso))) return fail('Aviso no válido')
      await saveWithUndo(opts.chatId, t.key, `Restablecer avisos (${who})`, next)
      return {
        ok: true,
        ahora: args.aviso
          ? describeRule(getEvent(String(args.aviso))!, effectiveRule(getEvent(String(args.aviso))!, t.kind, next))
          : 'Todo como venía por defecto',
        deshacer: 'Se puede deshacer.',
      }
    }

    case 'avisos_auto_historial': {
      const rows = await notificationHistory(t.key, {
        event: args.aviso ? String(args.aviso) : undefined,
        days: Number(args.dias) || 7,
      })
      return { ok: true, avisos: rows, ...(rows.length ? {} : { nota: 'No hay avisos en esos días.' }) }
    }
  }
  return undefined
}
