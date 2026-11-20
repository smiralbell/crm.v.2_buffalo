import {
  addPersonalInstruction,
  addReminder,
  listChatReminders,
  listPersonalInstructions,
  removePersonalInstruction,
  updatePersonalInstruction,
  updateReminder,
  type Reminder,
  type ReminderPatch,
  type ReminderRepeat,
} from './store'

/**
 * Lo que cada persona configura de SU agente hablando con él: sus preferencias
 * («sé más breve», «háblame en este formato») y sus avisos programados.
 * Lo usan el agente de los socios y el del equipo. Nadie toca lo de otro: el
 * dueño (ownerKey) y la conversación (chatId) los pone el servidor.
 */

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'function' as const, function: { name, description, parameters: { type: 'object', properties, required } } }
}

const REPEATS = ['nunca', 'diario', 'laborables', 'semanal', 'mensual'] as const
const MADRID = 'Europe/Madrid'
/** Avisos activos por conversación del equipo: los de tipo tarea gastan IA cada vez. */
export const TEAM_MAX_ACTIVE_REMINDERS = 20

export const PERSONAL_INSTRUCTION_TOOLS = [
  tool('mis_instrucciones', 'Las preferencias que esta persona le ha dado a SU agente (cómo quiere que le respondas y trabajes).', {}),
  tool(
    'instruccion_guardar',
    'Guarda una preferencia de esta persona para su agente, cuando pida que le hables o trabajes de otra forma («sé más breve», «dame siempre los enlaces», «resúmeme en 3 puntos»). Redáctala corta y clara, en una frase. Solo afecta a su chat.',
    { texto: { type: 'string' } },
    ['texto']
  ),
  tool('instruccion_cambiar', 'Cambia el texto de una de sus preferencias (id de mis_instrucciones).', {
    id: { type: 'number' },
    texto: { type: 'string' },
  }, ['id', 'texto']),
  tool('instruccion_quitar', 'Quita una de sus preferencias (id de mis_instrucciones). Se puede deshacer.', { id: { type: 'number' } }, ['id']),
]

export const REMINDER_CHANGE_TOOL = tool(
  'avisos_cambiar',
  'Cambia un aviso programado: el texto o la tarea, la próxima vez (fecha_hora), cada cuánto (repetir), o lo pausa / reactiva (activo). Solo se cambia lo que mandes.',
  {
    id: { type: 'number' },
    texto: { type: 'string' },
    tipo: { type: 'string', enum: ['texto', 'tarea'] },
    fecha_hora: { type: 'string', description: 'ISO 8601 con zona (Europe/Madrid)' },
    repetir: { type: 'string', enum: [...REPEATS] },
    activo: { type: 'boolean' },
  },
  ['id']
)

/** Avisos del equipo: siempre a su propio chat. */
export const TEAM_REMINDER_TOOLS = [
  tool(
    'avisos_programar',
    'Programa un aviso para esta persona por WhatsApp. tipo "texto": le llega el texto tal cual («recuérdame llamar a…»). tipo "tarea": a esa hora su agente hace la tarea y le manda el resultado («cada lunes a las 9, mis tareas de la semana», «cada día a las 18, incidencias abiertas de mis proyectos»). Con repetir, se repite.',
    {
      tipo: { type: 'string', enum: ['texto', 'tarea'] },
      texto: { type: 'string', description: 'El recordatorio, o la tarea y cómo quiere el resultado' },
      fecha_hora: { type: 'string', description: 'Primera vez, ISO 8601 con zona (Europe/Madrid), p. ej. 2026-11-23T09:00:00+01:00' },
      repetir: { type: 'string', enum: [...REPEATS] },
    },
    ['tipo', 'texto', 'fecha_hora']
  ),
  tool('avisos_listar', 'Sus avisos programados (activos y pausados), con la próxima vez que salen.', {}),
  REMINDER_CHANGE_TOOL,
]

export type PersonalToolOptions = {
  /** Dueño de las preferencias (personalOwnerKey) */
  ownerKey: string
  /** Conversación de la persona: sus avisos */
  chatId: number
  userId: number | null
  /**
   * true (equipo): solo ve y cambia los avisos de su chat. false (socios): puede
   * cambiar cualquiera; avisos_programar y avisos_listar los lleva tools.ts.
   */
  ownChatOnly: boolean
}

type Fail = { ok: false; error: string }
const fail = (error: string): Fail => ({ ok: false, error })

export function parseRepeat(v: unknown): ReminderRepeat | null {
  const s = String(v ?? '').trim().toLowerCase()
  return (REPEATS as readonly string[]).includes(s) ? (s as ReminderRepeat) : null
}

export function parseWhen(v: unknown): Date | null {
  const raw = String(v ?? '').trim()
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function reminderForAgent(r: Reminder) {
  return {
    id: r.id,
    tipo: r.tipo,
    texto: r.texto,
    repetir: r.repetir,
    activo: r.activo,
    proxima: new Date(r.next_run_at).toLocaleString('es-ES', { timeZone: MADRID }),
  }
}

/** Ejecuta una herramienta personal. undefined = no es de este módulo. */
export async function runPersonalTool(
  name: string,
  args: Record<string, unknown>,
  opts: PersonalToolOptions
): Promise<unknown> {
  switch (name) {
    case 'mis_instrucciones':
      return { ok: true, instrucciones: await listPersonalInstructions(opts.ownerKey) }

    case 'instruccion_guardar':
      return addPersonalInstruction(opts.ownerKey, String(args.texto ?? ''))

    case 'instruccion_cambiar': {
      const before = (await listPersonalInstructions(opts.ownerKey)).find((i) => i.id === Number(args.id))
      if (!before) return fail('No tienes ninguna preferencia con ese id: mira mis_instrucciones')
      const after = await updatePersonalInstruction(opts.ownerKey, before.id, String(args.texto ?? ''))
      return after ? { ok: true, antes: before.texto, ahora: after.texto } : fail('El texto está vacío')
    }

    case 'instruccion_quitar': {
      const removed = await removePersonalInstruction(opts.ownerKey, Number(args.id))
      return removed ? { ok: true, quitada: removed.texto } : fail('No tienes ninguna preferencia con ese id: mira mis_instrucciones')
    }

    case 'avisos_programar': {
      if (!opts.ownChatOnly) return undefined
      const when = parseWhen(args.fecha_hora)
      if (!when) return fail('fecha_hora no es una fecha válida (ISO 8601 con zona)')
      const texto = String(args.texto ?? '').trim()
      if (!texto) return fail('Falta el texto del aviso')
      const repetir = args.repetir === undefined ? 'nunca' : parseRepeat(args.repetir)
      if (!repetir) return fail(`repetir no válido. Usa: ${REPEATS.join(', ')}`)
      if (repetir === 'nunca' && when.getTime() < Date.now() - 60_000) return fail('Esa hora ya ha pasado')
      const active = (await listChatReminders(opts.chatId, true)).length
      if (active >= TEAM_MAX_ACTIVE_REMINDERS) {
        return fail(`Ya tienes ${active} avisos activos: pausa o cambia alguno antes de crear otro.`)
      }
      const reminder = await addReminder({
        chatId: opts.chatId,
        createdBy: opts.userId,
        tipo: args.tipo === 'tarea' ? 'tarea' : 'texto',
        texto,
        destino: 'chat',
        repetir,
        nextRunAt: when,
      })
      return { ok: true, aviso: reminderForAgent(reminder) }
    }

    case 'avisos_listar':
      if (!opts.ownChatOnly) return undefined
      return { ok: true, avisos: (await listChatReminders(opts.chatId)).map(reminderForAgent) }

    case 'avisos_cambiar': {
      const patch: ReminderPatch = {}
      if (args.texto !== undefined) {
        const texto = String(args.texto).trim()
        if (!texto) return fail('El texto no puede quedar vacío')
        patch.texto = texto
      }
      if (args.tipo !== undefined) patch.tipo = args.tipo === 'tarea' ? 'tarea' : 'texto'
      if (args.repetir !== undefined) {
        const r = parseRepeat(args.repetir)
        if (!r) return fail(`repetir no válido. Usa: ${REPEATS.join(', ')}`)
        patch.repetir = r
      }
      if (args.fecha_hora !== undefined) {
        const when = parseWhen(args.fecha_hora)
        if (!when) return fail('fecha_hora no es una fecha válida (ISO 8601 con zona)')
        patch.nextRunAt = when
      }
      if (args.activo !== undefined) patch.activo = args.activo === true
      if (!Object.keys(patch).length) return fail('No has dicho qué cambiar')
      if (patch.activo && opts.ownChatOnly) {
        const active = (await listChatReminders(opts.chatId, true)).filter((r) => r.id !== Number(args.id)).length
        if (active >= TEAM_MAX_ACTIVE_REMINDERS) return fail(`Ya tienes ${active} avisos activos: pausa alguno antes.`)
      }
      const changed = await updateReminder(Number(args.id), opts.ownChatOnly ? opts.chatId : null, patch)
      return changed ? { ok: true, aviso: reminderForAgent(changed) } : fail('No tienes ningún aviso con ese id: mira avisos_listar')
    }
  }
  return undefined
}
