import { CRM_ASSISTANT_TOOLS, executeCrmAssistantTool } from '@/lib/demos/crm-assistant-tools'
import { createAssistantContext } from '@/lib/demos/assistant-attachments'
import * as db from './db-tools'
import { MCP_TOOL_NAMES, MCP_TOOLS, runMcpTool } from './mcp-tools'
import { TASK_READ_ONLY, TASK_TOOL_NAMES, TASK_TOOLS, runTaskTool } from './task-tools'
import { PERSONAL_INSTRUCTION_TOOLS, REMINDER_CHANGE_TOOL, runPersonalTool } from './personal-tools'
import { UNDO_TOOLS, recordUndo, runUndoTool, runWithUndo, type UndoStep } from './undo'
import { PERSON_CONTEXT_TOOL, gatherPersonContext } from './person-context'
import { NOTIFICATION_READ_ONLY, notificationTools, runNotificationTool } from '@/lib/notifications/tools'
import { allowedWhatsAppNumbers, isWhatsAppChat, phoneFromChatId } from '@/lib/whatsapp-agent/config'
import { AGENT_MODULES, MODULE_KEYS, type AgentModule } from './modules'
import {
  addInstruction,
  addReminder,
  audit,
  createPending,
  listInstructions,
  listOpenPending,
  listReminders,
  personalOwnerKey,
  setReminderActive,
  updateInstruction,
  type PendingAction,
  type ReminderRepeat,
} from './store'
import { REMINDER_EVERY_MAX_DAYS, REMINDER_EVERY_MIN_DAYS } from './reminder-limits'
import { alertChatIds } from './config'
import { sendText } from './telegram-api'

/** Estado de una petición: lo comparten el orquestador y sus subagentes. */
export type AgentContext = {
  chatId: number
  userId: number | null
  userName: string
  /** Borrados que se han pedido en esta petición: se envían con botones al final. */
  pending: PendingAction[]
  documents: Array<{ filename: string; buffer: Buffer; mime: string; caption?: string }>
  /** Resumen de lo que se ha hecho, para el historial. */
  actions: string[]
  /** true en avisos programados que ejecuta el propio agente (no hay socio delante). */
  scheduled?: boolean
}

export type ToolSchema = {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolSchema {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } }
}

const whereProps = {
  id: { type: 'string', description: 'Valor de la clave primaria (número o uuid)' },
  id_columna: { type: 'string', description: 'Columna de la clave (por defecto id)' },
  where_sql: { type: 'string', description: 'Filtro sin la palabra WHERE, con $1, $2… (p. ej. "estado = $1 AND created_at < $2")' },
  where_params: { type: 'array', items: {}, description: 'Valores de $1, $2… del filtro' },
}

// ——— Base de datos ———

export const DB_TOOLS: ToolSchema[] = [
  tool('db_listar_tablas', 'Lista las tablas del CRM con filas aproximadas. filtro opcional por nombre.', {
    filtro: { type: 'string' },
  }),
  tool('db_describir_tabla', 'Columnas, tipos y claves foráneas de una tabla. Úsala antes de escribir en una tabla que no conoces.', {
    tabla: { type: 'string' },
  }, ['tabla']),
  tool('db_consultar', 'Ejecuta un SELECT / WITH de solo lectura sobre el Postgres del CRM. Devuelve hasta "limite" filas (máx 500).', {
    sql: { type: 'string' },
    limite: { type: 'number' },
  }, ['sql']),
  tool('db_insertar', 'Inserta una fila. datos = {columna: valor}. Devuelve la fila creada.', {
    tabla: { type: 'string' },
    datos: { type: 'object' },
  }, ['tabla', 'datos']),
  tool('db_actualizar', 'Actualiza filas por id o por filtro. Se cancela si afecta a más de max_filas (por defecto 25).', {
    tabla: { type: 'string' },
    datos: { type: 'object', description: 'Columnas a cambiar' },
    ...whereProps,
    max_filas: { type: 'number' },
  }, ['tabla', 'datos']),
  tool('db_ejecutar_sql', 'SQL de escritura NO destructivo (INSERT, UPDATE con joins, CREATE TABLE/INDEX, ALTER TABLE ADD COLUMN…). Prohibido DELETE/DROP/TRUNCATE: para eso usa solicitar_borrado o solicitar_sql_destructivo.', {
    sql: { type: 'string' },
    params: { type: 'array', items: {} },
    max_filas: { type: 'number', description: 'Se cancela si afecta a más filas (por defecto 50)' },
  }, ['sql']),
  tool('solicitar_borrado', 'Pide borrar filas. NO borra nada: genera un preview y el socio recibe una confirmación en dos pasos (botones en Telegram, códigos en WhatsApp). Solo si completa los dos se borra. Usa esto para CUALQUIER eliminación.', {
    tabla: { type: 'string' },
    ...whereProps,
    motivo: { type: 'string', description: 'Qué se va a borrar, en palabras claras para el socio' },
    max_filas: { type: 'number', description: 'Tope de filas (por defecto 50)' },
  }, ['tabla', 'motivo']),
  tool('solicitar_sql_destructivo', 'Pide ejecutar SQL destructivo (DROP, TRUNCATE, ALTER … DROP COLUMN, DELETE complejo). NO se ejecuta: pasa por la doble confirmación del socio. Solo si solicitar_borrado no sirve.', {
    sql: { type: 'string' },
    params: { type: 'array', items: {} },
    motivo: { type: 'string' },
  }, ['sql', 'motivo']),
]

// ——— Documentos, socios, configuración del agente ———

export const AGENT_TOOLS: ToolSchema[] = [
  tool('enviar_documento', 'Adjunta un archivo de texto (txt, csv, md, json, html) a la respuesta (Telegram o WhatsApp). Úsalo para listados largos, exportaciones o informes.', {
    nombre_archivo: { type: 'string', description: 'p. ej. leads-noviembre.csv' },
    contenido: { type: 'string' },
    descripcion: { type: 'string' },
  }, ['nombre_archivo', 'contenido']),
  tool('enviar_mensaje_socios', 'Envía un mensaje de Telegram a los socios (los chats que reciben los avisos del CRM). Para "avísale a mi socio que…".', {
    texto: { type: 'string' },
  }, ['texto']),
  tool('instrucciones_listar', 'Lista las instrucciones permanentes que los socios le han dado al agente.', {}),
  tool('instrucciones_guardar', 'Guarda una instrucción permanente (preferencias, reglas, cómo hacer algo). Se aplica en todas las conversaciones. modulo opcional para que solo la vea ese subagente.', {
    texto: { type: 'string' },
    modulo: { type: 'string', enum: MODULE_KEYS },
  }, ['texto']),
  tool('instrucciones_editar', 'Cambia el texto de una instrucción guardada.', {
    id: { type: 'number' },
    texto: { type: 'string' },
  }, ['id', 'texto']),
  tool('instrucciones_borrar', 'Pide borrar una instrucción guardada (pasa por la doble confirmación).', {
    id: { type: 'number' },
  }, ['id']),
  tool('avisos_programar', 'Programa un aviso. tipo "texto": manda el texto tal cual. tipo "tarea": a esa hora el agente ejecuta la tarea (p. ej. "resumen de cobros pendientes") y manda el resultado. destino "chat" = este chat; "socios" = todos los socios.', {
    tipo: { type: 'string', enum: ['texto', 'tarea'] },
    texto: { type: 'string' },
    fecha_hora: { type: 'string', description: 'Primera ejecución, ISO 8601 con zona (Europe/Madrid), p. ej. 2026-11-02T09:00:00+01:00' },
    repetir: { type: 'string', enum: ['nunca', 'diario', 'laborables', 'semanal', 'mensual', 'cada_n_dias'] },
    cada_dias: { type: 'number', description: 'Solo con repetir=cada_n_dias: cada cuántos días (2-365)' },
    destino: { type: 'string', enum: ['chat', 'socios'] },
  }, ['tipo', 'texto', 'fecha_hora']),
  tool('avisos_listar', 'Lista los avisos programados activos.', {}),
  tool('avisos_pausar', 'Pausa (activo=false) o reactiva un aviso programado. No borra nada.', {
    id: { type: 'number' },
    activo: { type: 'boolean' },
  }, ['id', 'activo']),
  tool('borrados_pendientes', 'Lista los borrados que esperan la doble confirmación en este chat.', {}),
  REMINDER_CHANGE_TOOL,
  // Preferencias de ESTE socio (solo su chat), distintas de las instrucciones de los socios
  ...PERSONAL_INSTRUCTION_TOOLS,
  ...UNDO_TOOLS,
]

export const DELEGATE_TOOL: ToolSchema = tool(
  'delegar_subagentes',
  `Encarga trabajo a uno o varios subagentes especialistas, que trabajan EN PARALELO con acceso completo a la base de datos y devuelven su resultado. Módulos: ${AGENT_MODULES.map((m) => `${m.key} (${m.descripcion})`).join(' · ')}`,
  {
    tareas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          modulo: { type: 'string', enum: MODULE_KEYS },
          tarea: { type: 'string', description: 'Instrucción completa y autocontenida: qué hacer, con qué datos, qué devolver' },
        },
        required: ['modulo', 'tarea'],
      },
    },
  },
  ['tareas']
)

/** Herramientas de la secretaria que tienen sentido aquí (los documentos los manda enviar_documento). */
const SECRETARIA_TOOLS = (CRM_ASSISTANT_TOOLS as unknown as ToolSchema[]).filter(
  (t) => !['send_crm_report_document', 'send_text_document'].includes(t.function.name)
)

const READ_ONLY = new Set([
  'db_listar_tablas',
  'db_describir_tabla',
  'db_consultar',
  'instrucciones_listar',
  'avisos_listar',
  'borrados_pendientes',
  'run_domain_agent',
  'lookup_entity',
  'get_company_snapshot',
  'get_finance_brief',
  'get_bank_recent',
  'search_leads',
  'get_lead_detail',
  'search_proyectos',
  'get_proyecto_detail',
  'search_contacts',
  'search_tickets',
  'search_invoices',
  'get_pipeline_brief',
  'delegar_subagentes',
  'mcp_listar',
  'mis_instrucciones',
  'contexto_persona',
  ...Array.from(NOTIFICATION_READ_ONLY),
  ...TASK_READ_ONLY,
])

/** Acciones de la secretaria que en Telegram se ejecutan directas (solo los borrados piden confirmación). */
const DIRECT_ACTIONS = new Set([
  'append_lead_note',
  'update_lead_estado',
  'create_contact_and_lead',
  'ticket_reply',
  'ticket_set_status',
  'create_project_task',
  'update_proyecto_status',
  'create_calendar_meeting',
])

/**
 * El orquestador (modelo caro) no consulta datos: entiende, delega y responde.
 * Las consultas y búsquedas las hacen los subagentes (modelo barato), que le
 * devuelven un informe corto en vez de filas. Se queda con lo que no necesita
 * buscar nada: configurar el agente, avisos, documentos, tareas del equipo y
 * las acciones directas de la secretaria cuando ya tiene los ids.
 */
export function orchestratorTools(): ToolSchema[] {
  return [
    DELEGATE_TOOL,
    PERSON_CONTEXT_TOOL,
    ...AGENT_TOOLS,
    ...notificationTools('socio'),
    ...TASK_TOOLS,
    ...SECRETARIA_TOOLS.filter((t) => DIRECT_ACTIONS.has(t.function.name)),
  ]
}

export function subagentTools(mod: AgentModule): ToolSchema[] {
  const allowed = new Set(mod.herramientas)
  const extra = mod.key === 'sistema' ? AGENT_TOOLS : AGENT_TOOLS.filter((t) => t.function.name === 'enviar_documento')
  // Tareas del equipo: el subagente de proyectos (y el de sistema, que lleva los usuarios)
  const tasks = mod.key === 'proyectos' || mod.key === 'sistema' ? TASK_TOOLS : []
  return [...DB_TOOLS, PERSON_CONTEXT_TOOL, ...extra, ...MCP_TOOLS, ...tasks, ...SECRETARIA_TOOLS.filter((t) => allowed.has(t.function.name))]
}

// ——— Ejecución ———

const MADRID = 'Europe/Madrid'

async function requestDeletion(
  ctx: AgentContext,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const preview = await db.previewDelete(args)
  if (!preview.ok) return preview
  const pending = await createPending({
    chatId: ctx.chatId,
    requestedBy: ctx.userId,
    kind: 'delete_rows',
    payload: preview.payload as unknown as Record<string, unknown>,
    summary: String(args.motivo || `Borrar ${preview.count} fila(s) de ${preview.payload.table}`),
    preview: { tabla: preview.payload.table, filas: preview.count, muestra: preview.sample },
  })
  ctx.pending.push(pending)
  return {
    ok: true,
    estado: 'PENDIENTE_DOBLE_CONFIRMACION',
    id: pending.id,
    filas: preview.count,
    mensaje:
      'No se ha borrado nada todavía. Le llega un mensaje de confirmación: le basta con contestar ok (o pulsar «Sí, borrar» en Telegram). Díselo en una frase; no digas que está borrado.',
  }
}

/** db_insertar / db_actualizar devuelven cómo deshacerlos: se apunta y no se le enseña a la IA. */
async function keepDbUndo(chatId: number, name: string, args: Record<string, unknown>, result: unknown): Promise<unknown> {
  if (!result || typeof result !== 'object' || !Array.isArray((result as { undo?: unknown }).undo)) return result
  const { undo, ...rest } = result as { undo: UndoStep[] } & Record<string, unknown>
  const label = name === 'db_insertar' ? `Crear una fila en ${String(args.tabla)}` : `Cambiar ${undo.length} fila(s) de ${String(args.tabla)}`
  const id = await recordUndo(chatId, label, undo).catch(() => null)
  return id ? { ...rest, deshacer: `Se puede deshacer (cambio #${id}).` } : rest
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentContext,
  agentName: string
): Promise<unknown> {
  let result: unknown
  let ok = true
  try {
    result = await runWithUndo(ctx.chatId, name, args, () => runTool(name, args, ctx))
    result = await keepDbUndo(ctx.chatId, name, args, result)
    if (result && typeof result === 'object' && (result as { ok?: unknown }).ok === false) ok = false
  } catch (e) {
    ok = false
    result = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  if (!READ_ONLY.has(name)) {
    ctx.actions.push(`${agentName}:${name}${ok ? '' : ' (error)'}`)
    await audit({ chatId: ctx.chatId, userId: ctx.userId, agent: agentName, tool: name, args, ok, result })
  }
  return result
}

async function runTool(name: string, args: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  switch (name) {
    case 'db_listar_tablas':
      return db.listTables(args.filtro ? String(args.filtro) : undefined)
    case 'db_describir_tabla':
      return db.describeTable(String(args.tabla || ''))
    case 'db_consultar':
      return db.readQuery(String(args.sql || ''), Number(args.limite) || 100)
    case 'db_insertar':
      return db.insertRow(args)
    case 'db_actualizar':
      return db.updateRows(args)
    case 'db_ejecutar_sql':
      return db.executeWriteSql(
        String(args.sql || ''),
        Array.isArray(args.params) ? args.params : [],
        Number(args.max_filas) || 50
      )
    case 'solicitar_borrado':
      return requestDeletion(ctx, args)
    case 'solicitar_sql_destructivo': {
      const sql = String(args.sql || '').trim()
      if (!sql) return { ok: false, error: 'sql vacío' }
      const pending = await createPending({
        chatId: ctx.chatId,
        requestedBy: ctx.userId,
        kind: 'destructive_sql',
        payload: { sql, params: Array.isArray(args.params) ? args.params : [] },
        summary: String(args.motivo || 'SQL destructivo'),
        preview: { sql },
      })
      ctx.pending.push(pending)
      return {
        ok: true,
        estado: 'PENDIENTE_DOBLE_CONFIRMACION',
        id: pending.id,
        mensaje: 'No se ha ejecutado. El socio recibirá la confirmación en dos pasos.',
      }
    }

    case 'enviar_documento': {
      const filename = String(args.nombre_archivo || 'documento.txt').replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ]/g, '_')
      const ext = filename.split('.').pop()?.toLowerCase() || 'txt'
      const mime =
        { csv: 'text/csv', md: 'text/markdown', json: 'application/json', html: 'text/html' }[ext] || 'text/plain'
      ctx.documents.push({
        filename,
        buffer: Buffer.from(String(args.contenido || ''), 'utf8'),
        mime: `${mime}; charset=utf-8`,
        caption: args.descripcion ? String(args.descripcion) : undefined,
      })
      return { ok: true, adjunto: filename, nota: 'Se enviará junto a tu respuesta.' }
    }
    case 'enviar_mensaje_socios': {
      const texto = String(args.texto || '').trim()
      if (!texto) return { ok: false, error: 'texto vacío' }
      const from = ctx.scheduled ? 'Agente CRM' : ctx.userName
      const targets = alertChatIds().filter((id) => id !== String(ctx.chatId))
      for (const id of targets) await sendText(id, `Mensaje de ${from}:\n\n${texto}`)
      return { ok: true, enviado_a: targets.length }
    }
    case 'instrucciones_listar':
      return { ok: true, instrucciones: await listInstructions() }
    case 'instrucciones_guardar':
      return {
        ok: true,
        guardada: await addInstruction(String(args.texto || ''), args.modulo ? String(args.modulo) : null, ctx.userId),
      }
    case 'instrucciones_editar':
      return { ok: await updateInstruction(Number(args.id), String(args.texto || '')) }
    case 'instrucciones_borrar':
      return requestDeletion(ctx, {
        tabla: 'telegram_agent_instructions',
        id: Number(args.id),
        motivo: `Borrar la instrucción #${Number(args.id)} del agente`,
        max_filas: 1,
      })
    case 'avisos_programar': {
      const when = new Date(String(args.fecha_hora || ''))
      if (Number.isNaN(when.getTime())) return { ok: false, error: 'fecha_hora no es una fecha válida (ISO 8601)' }
      const repetir = (['diario', 'laborables', 'semanal', 'mensual', 'cada_n_dias'].includes(String(args.repetir))
        ? args.repetir
        : 'nunca') as ReminderRepeat
      // «Cada N días» exige un N válido: sin él no se crea, para no mandarlo a cada día por error
      const every = Number(args.cada_dias)
      const intervalo = Number.isInteger(every) && every >= REMINDER_EVERY_MIN_DAYS && every <= REMINDER_EVERY_MAX_DAYS ? every : null
      if (repetir === 'cada_n_dias' && intervalo === null) {
        return { ok: false, error: `cada_dias debe ser un número entero entre ${REMINDER_EVERY_MIN_DAYS} y ${REMINDER_EVERY_MAX_DAYS}` }
      }
      const reminder = await addReminder({
        chatId: ctx.chatId,
        createdBy: ctx.userId,
        tipo: args.tipo === 'tarea' ? 'tarea' : 'texto',
        texto: String(args.texto || ''),
        destino: args.destino === 'socios' ? 'socios' : 'chat',
        repetir,
        intervaloDias: intervalo,
        nextRunAt: when,
      })
      return {
        ok: true,
        aviso: reminder,
        primera_vez: when.toLocaleString('es-ES', { timeZone: MADRID }),
      }
    }
    case 'avisos_listar':
      return {
        ok: true,
        avisos: (await listReminders()).map((r) => ({
          ...r,
          proxima: new Date(r.next_run_at).toLocaleString('es-ES', { timeZone: MADRID }),
        })),
      }
    case 'avisos_pausar':
      return { ok: await setReminderActive(Number(args.id), args.activo === true) }
    case 'deshacer':
      return runUndoTool(ctx.chatId, args)
    case 'contexto_persona':
      return gatherPersonContext(args.nombre)
    case 'borrados_pendientes':
      return {
        ok: true,
        pendientes: (await listOpenPending(ctx.chatId)).map((p) => ({ id: p.id, resumen: p.summary, paso: p.step })),
      }
  }

  const personal = await runPersonalTool(name, args, {
    ownerKey: personalOwnerKey({ chatId: ctx.chatId }),
    chatId: ctx.chatId,
    userId: ctx.userId,
    ownChatOnly: false,
  })
  if (personal !== undefined) return personal

  // Avisos automáticos: los suyos van con su WhatsApp; desde Telegram, solo el canal común
  const isSocioWhatsApp = isWhatsAppChat(ctx.chatId) && allowedWhatsAppNumbers().has(phoneFromChatId(ctx.chatId))
  const notification = await runNotificationTool(name, args, {
    kind: 'socio',
    ownerKey: isSocioWhatsApp ? `chat:${ctx.chatId}` : null,
    chatId: ctx.chatId,
  })
  if (notification !== undefined) return notification

  if (MCP_TOOL_NAMES.has(name)) return runMcpTool(name, args)

  if (TASK_TOOL_NAMES.has(name)) {
    return runTaskTool(name, args, {
      actorName: ctx.scheduled ? 'Agente CRM' : ctx.userName,
      requestDeletion: (del) => requestDeletion(ctx, del),
    })
  }

  if (SECRETARIA_TOOLS.some((t) => t.function.name === name)) {
    const finalArgs = DIRECT_ACTIONS.has(name) ? { ...args, confirm: true } : args
    return executeCrmAssistantTool(name, finalArgs, createAssistantContext(`telegram:${ctx.chatId}`))
  }
  return { ok: false, error: `Herramienta desconocida: ${name}` }
}
