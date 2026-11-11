import { prisma } from '@/lib/prisma'
import { stripPriceLines } from '@/lib/price-visibility'
import {
  AGENT_PRIORITIES,
  AGENT_STATUSES,
  agentSubtasksInput,
  applySubtaskAction,
  parseAgentDate,
  parseAgentPriority,
  parseAgentStatus,
  statusLabel,
  subtasksForAgent,
  taskDetailForAgent,
  taskSummaryForAgent,
} from '@/lib/tareas/agent-format'
import { EMPTY_FILTERS, applyTaskFilters } from '@/lib/tareas/filters'
import {
  createPersonalTask,
  createProjectTask,
  getPersonalTask,
  getProjectTask,
  listOpenProjects,
  listPersonalTasks,
  listProjectTasks,
  updatePersonalTask,
  updateProjectTask,
} from '@/lib/tareas/store'
import type { WorkProject, WorkTask } from '@/lib/tareas/types'
import { previewDelete, serializeRows } from '@/lib/telegram-agent/db-tools'
import { runMcpTool } from '@/lib/telegram-agent/mcp-tools'
import { audit, createPending } from '@/lib/telegram-agent/store'
import type { AgentContext, ToolSchema } from '@/lib/telegram-agent/tools'
import { listTickets } from '@/lib/tickets/list'
import { notifyClientTicketUpdate } from '@/lib/tickets/notify'
import { getTicketWithProject, insertTicketUpdate, listTicketUpdates, updateTicketStatus } from '@/lib/tickets/updates'
import { TEAM_READ_ONLY, allowedToolNames, canDeleteTask, canSeeTask, deleteFilterFor } from './access'
import type { TeamMember } from './identity'

/**
 * Herramientas del agente de WhatsApp del equipo (developers y project managers).
 *
 * Seguridad:
 * - Quién es la persona (member) y cuáles son SUS proyectos (scope) los pone el
 *   servidor a partir de su móvil. Ninguna herramienta acepta un usuario por
 *   parámetro, así que la IA no puede actuar en nombre de otro.
 * - Cada herramienta comprueba el acceso antes de leer o escribir.
 * - No hay SQL libre, ni facturación, ni precios, ni datos de otros usuarios.
 * - Borrar pasa por la doble confirmación por códigos, con un filtro que vuelve
 *   a comprobar el dueño al ejecutar el DELETE.
 */

export interface TeamScope {
  member: TeamMember
  /** Todos sus proyectos (crm_user_projects): para el MCP de los clientes */
  assignedIds: string[]
  /** Sus proyectos abiertos: los que salen en Proyectos y en Tareas del CRM */
  projects: WorkProject[]
}

export async function loadTeamScope(member: TeamMember): Promise<TeamScope> {
  const rows = await prisma.$queryRaw<{ project_id: string }[]>`
    SELECT project_id::text AS project_id FROM crm_user_projects WHERE user_id = ${member.id}
  `
  const assignedIds = rows.map((r) => r.project_id)
  const projects = await listOpenProjects(assignedIds)
  return { member, assignedIds, projects }
}

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolSchema {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } }
}

const subtaskItem = {
  type: 'object',
  properties: { titulo: { type: 'string' }, explicacion: { type: 'string' } },
  required: ['titulo'],
}
const estadoProp = { type: 'string', enum: [...AGENT_STATUSES] }
const prioridadProp = { type: 'string', enum: [...AGENT_PRIORITIES] }
const proyectoProp = { type: 'string', description: 'Nombre (o parte) de uno de tus proyectos' }
const TICKET_STATUSES = ['abierto', 'en_curso', 'resuelto', 'cerrado'] as const
const LEAD_STATUSES = ['frio', 'caliente', 'reunion', 'propuesta', 'negociando', 'cerrado', 'activo', 'perdido'] as const

const ALL_TOOLS: ToolSchema[] = [
  tool('mis_tareas', 'Tus tareas: las sueltas y las de tus proyectos (lo mismo que ves en Tareas del CRM). Por defecto sin las hechas.', {
    proyecto: proyectoProp,
    tipo: { type: 'string', enum: ['todas', 'sueltas', 'proyecto'] },
    estado: estadoProp,
    prioridad: prioridadProp,
    vencidas: { type: 'boolean' },
    buscar: { type: 'string' },
    incluir_hechas: { type: 'boolean' },
    limite: { type: 'number' },
  }),
  tool('tarea_ver', 'Ficha completa de una de tus tareas: descripción y subtareas numeradas con su explicación.', { id: { type: 'string' } }, ['id']),
  tool(
    'tarea_crear',
    'Crea una tarea. Sin proyecto: tarea suelta tuya. Con proyecto: en el tablero de ese proyecto (tiene que ser tuyo).',
    {
      proyecto: proyectoProp,
      titulo: { type: 'string' },
      descripcion: { type: 'string' },
      prioridad: prioridadProp,
      estado: estadoProp,
      fecha_fin: { type: 'string', description: 'YYYY-MM-DD' },
      horas_estimadas: { type: 'number' },
      asignado: { type: 'string', description: 'Solo en proyecto: nombre de quien la hace' },
      subtareas: { type: 'array', items: subtaskItem },
    },
    ['titulo']
  ),
  tool(
    'tarea_editar',
    'Cambia una de tus tareas. Solo se cambia lo que mandes. fecha_fin "" la quita.',
    {
      id: { type: 'string' },
      titulo: { type: 'string' },
      descripcion: { type: 'string' },
      prioridad: prioridadProp,
      estado: estadoProp,
      fecha_fin: { type: 'string' },
      horas_estimadas: { type: 'number' },
      asignado: { type: 'string', description: 'Solo tareas de proyecto ("" = sin asignar)' },
    },
    ['id']
  ),
  tool('tarea_mover', 'Mueve una de tus tareas de columna.', { id: { type: 'string' }, estado: estadoProp }, ['id', 'estado']),
  tool(
    'tarea_subtareas',
    'Subtareas de una de tus tareas. accion: anadir (titulo, explicacion), editar (numero, titulo/explicacion), marcar, desmarcar, quitar (numero) o reemplazar (subtareas).',
    {
      id: { type: 'string' },
      accion: { type: 'string', enum: ['anadir', 'editar', 'marcar', 'desmarcar', 'quitar', 'reemplazar'] },
      numero: { type: 'number' },
      titulo: { type: 'string' },
      explicacion: { type: 'string' },
      subtareas: { type: 'array', items: subtaskItem },
    },
    ['id', 'accion']
  ),
  tool(
    'tarea_borrar',
    'Pide borrar una tarea. NO la borra: te llegan dos códigos para confirmarlo. Las tareas que te puso un socio no se pueden borrar (muévelas a hecha).',
    { id: { type: 'string' }, motivo: { type: 'string' } },
    ['id']
  ),
  tool('mis_proyectos', 'Tus proyectos asignados, con su estado y cuántas tareas abiertas tienen.', {}),
  tool('proyecto_ver', 'Información de trabajo de uno de tus proyectos: resumen, contexto, alcance, stack, entregables, contactos, notas y documentos.', { proyecto: proyectoProp }, ['proyecto']),
  tool('mcp_listar', 'MCP conectados a tus proyectos (para consultar los sistemas de esos clientes), con sus herramientas. Solo lectura.', { proyecto: proyectoProp }),
  tool(
    'mcp_usar',
    'Consulta el sistema de un cliente de tus proyectos con una herramienta de su MCP (siempre de solo lectura). Saca mcp_id y herramienta de mcp_listar.',
    { mcp_id: { type: 'number' }, herramienta: { type: 'string' }, argumentos: { type: 'object' } },
    ['mcp_id', 'herramienta']
  ),
  tool('enviar_documento', 'Adjunta un archivo de texto (txt, csv, md, json) a tu respuesta, para listados largos.', {
    nombre_archivo: { type: 'string' },
    contenido: { type: 'string' },
    descripcion: { type: 'string' },
  }, ['nombre_archivo', 'contenido']),

  // Developers
  tool('tickets_listar', 'Tickets de clientes asignados a ti en tus proyectos.', {
    estado: { type: 'string', enum: [...TICKET_STATUSES] },
    proyecto: proyectoProp,
  }),
  tool('ticket_ver', 'Un ticket asignado a ti, con su conversación.', { id: { type: 'string' } }, ['id']),
  tool(
    'ticket_responder',
    'Responde a un ticket asignado a ti. El mensaje LE LLEGA AL CLIENTE. Primero llámala con confirmado=false para enseñar el texto, y solo con confirmado=true cuando el developer haya dicho que sí a ese texto exacto.',
    {
      id: { type: 'string' },
      mensaje: { type: 'string' },
      estado: { type: 'string', enum: [...TICKET_STATUSES] },
      confirmado: { type: 'boolean' },
    },
    ['id', 'mensaje']
  ),
  tool('ticket_estado', 'Cambia el estado de un ticket asignado a ti (se avisa al cliente del cambio).', {
    id: { type: 'string' },
    estado: { type: 'string', enum: [...TICKET_STATUSES] },
  }, ['id', 'estado']),

  // Project managers
  tool('leads_buscar', 'Busca leads por nombre, empresa, email o teléfono, y/o por estado. Sin precios.', {
    buscar: { type: 'string' },
    estado: { type: 'string', enum: [...LEAD_STATUSES] },
    limite: { type: 'number' },
  }),
  tool('lead_ver', 'Ficha de un lead: contacto, estado, notas, actividad reciente y proyectos. Sin precios.', { id: { type: 'number' } }, ['id']),
  tool('lead_nota', 'Añade una nota al final de las notas de un lead.', { id: { type: 'number' }, texto: { type: 'string' } }, ['id', 'texto']),
  tool('lead_estado', 'Cambia el estado de un lead.', {
    id: { type: 'number' },
    estado: { type: 'string', enum: [...LEAD_STATUSES] },
  }, ['id', 'estado']),
  tool('contactos_buscar', 'Busca contactos por nombre, empresa, email o teléfono.', { buscar: { type: 'string' } }, ['buscar']),
  tool('pipelines_listar', 'Pipelines (kanban) con sus columnas y cuántas tarjetas hay en cada una.', {}),
  tool('pipeline_tarjetas', 'Tarjetas de un pipeline, opcionalmente de una columna. Sin importes.', {
    pipeline: { type: 'string', description: 'Nombre o id del pipeline' },
    etapa: { type: 'string', description: 'Nombre de la columna' },
    limite: { type: 'number' },
  }, ['pipeline']),
  tool('pipeline_mover', 'Mueve una tarjeta de pipeline a otra columna del mismo pipeline.', {
    tarjeta_id: { type: 'string' },
    etapa: { type: 'string', description: 'Nombre de la columna destino' },
  }, ['tarjeta_id', 'etapa']),
]

/** Las herramientas que ve la IA según el rol. */
export function teamTools(role: TeamMember['role']): ToolSchema[] {
  const allowed = allowedToolNames(role)
  return ALL_TOOLS.filter((t) => allowed.has(t.function.name))
}

// ——— Utilidades ———

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUS_ORDER = { pending: 0, in_progress: 1, buffalo_validation: 2, done: 3 } as const
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const
const TICKET_FROM: Record<string, string> = {
  abierto: 'open',
  en_curso: 'in_progress',
  resuelto: 'resolved',
  cerrado: 'closed',
  open: 'open',
  in_progress: 'in_progress',
  resolved: 'resolved',
  closed: 'closed',
}
const TICKET_TO: Record<string, string> = { open: 'abierto', in_progress: 'en_curso', resolved: 'resuelto', closed: 'cerrado' }

type Fail = { ok: false; error: string }
const fail = (error: string): Fail => ({ ok: false, error })

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
}

function textArg(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  const s = String(v ?? '').trim()
  return s ? s : null
}

function hoursArg(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) throw new Error('horas_estimadas tiene que ser un número positivo')
  return n
}

/** Uno de SUS proyectos abiertos por nombre o id. Nunca uno que no tenga asignado. */
function findMyProject(scope: TeamScope, raw: unknown): WorkProject | Fail {
  const q = String(raw ?? '').trim()
  if (!q) return fail('Falta el proyecto')
  const byId = scope.projects.find((p) => p.id === q)
  if (byId) return byId
  const n = norm(q)
  const exact = scope.projects.filter((p) => norm(p.name) === n)
  if (exact.length === 1) return exact[0]
  const partial = scope.projects.filter((p) => norm(p.name).includes(n))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) return fail(`"${q}" coincide con varios de tus proyectos: ${partial.map((p) => p.name).join(', ')}`)
  return fail(
    scope.projects.length
      ? `No tienes ningún proyecto que coincida con "${q}". Tus proyectos: ${scope.projects.map((p) => p.name).join(', ')}`
      : 'No tienes proyectos asignados.'
  )
}

const isFail = (v: unknown): v is Fail => !!v && typeof v === 'object' && (v as Fail).ok === false

/** Una tarea SUYA por id; si no es suya, se dice que no existe (no se confirma que exista). */
async function findMyTask(scope: TeamScope, raw: unknown): Promise<WorkTask | Fail> {
  const id = String(raw ?? '').trim()
  if (!UUID_RE.test(id)) return fail('id de tarea no válido: sácalo de mis_tareas')
  const task = (await getPersonalTask(id)) ?? (await getProjectTask(id))
  if (!task || !canSeeTask(scope.member, task, scope.projects.map((p) => p.id))) {
    return fail('No tienes ninguna tarea con ese id')
  }
  return task
}

function sortTasks(list: WorkTask[]): WorkTask[] {
  return [...list].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
  )
}

async function myTicket(scope: TeamScope, raw: unknown) {
  const id = String(raw ?? '').trim()
  if (!UUID_RE.test(id)) return fail('id de ticket no válido: sácalo de tickets_listar')
  const row = await getTicketWithProject(id)
  // Igual que en el CRM: asignado a él y en uno de sus proyectos
  if (!row || row.assignee_user_id !== scope.member.id || !scope.assignedIds.includes(row.project_id)) {
    return fail('No tienes ningún ticket con ese id')
  }
  return row
}

// ——— Ejecución ———

export async function executeTeamTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentContext,
  scope: TeamScope
): Promise<unknown> {
  let result: unknown
  let ok = true
  try {
    // Defensa extra: aunque la IA llame a algo que no está en su lista, no se ejecuta
    if (!allowedToolNames(scope.member.role).has(name)) {
      result = fail(`No tienes acceso a ${name}.`)
    } else {
      result = await runTeamTool(name, args, ctx, scope)
    }
    if (isFail(result)) ok = false
  } catch (e) {
    ok = false
    result = fail(e instanceof Error ? e.message : String(e))
  }
  if (!TEAM_READ_ONLY.has(name)) {
    ctx.actions.push(`${name}${ok ? '' : ' (error)'}`)
    await audit({
      chatId: ctx.chatId,
      userId: ctx.userId,
      agent: `equipo:${scope.member.role}:${scope.member.id}`,
      tool: name,
      args,
      ok,
      result,
    })
  }
  return result
}

async function runTeamTool(name: string, args: Record<string, unknown>, ctx: AgentContext, scope: TeamScope): Promise<unknown> {
  const me = scope.member
  const myProjectIds = scope.projects.map((p) => p.id)

  switch (name) {
    // ——— Tareas ———
    case 'mis_tareas': {
      let project: WorkProject | null = null
      if (args.proyecto) {
        const p = findMyProject(scope, args.proyecto)
        if (isFail(p)) return p
        project = p
      }
      const tipo = String(args.tipo ?? 'todas')
      const personal = tipo !== 'proyecto' && !project ? await listPersonalTasks(me.id) : []
      const projectTasks = tipo !== 'sueltas' ? await listProjectTasks(project ? [project] : scope.projects) : []
      let tasks = [...personal, ...projectTasks].filter((t) => canSeeTask(me, t, myProjectIds))

      const estado = args.estado ? parseAgentStatus(args.estado) : null
      if (args.estado && !estado) return fail(`estado no válido. Usa: ${AGENT_STATUSES.join(', ')}`)
      if (estado) tasks = tasks.filter((t) => t.status === estado)
      else if (args.incluir_hechas !== true) tasks = tasks.filter((t) => t.status !== 'done')
      const prioridad = args.prioridad ? parseAgentPriority(args.prioridad) : null
      if (prioridad) tasks = tasks.filter((t) => t.priority === prioridad)
      if (args.vencidas === true) {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
        tasks = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < today)
      }
      if (args.buscar) tasks = applyTaskFilters(tasks, { ...EMPTY_FILTERS, q: String(args.buscar) })
      const limite = Math.min(Math.max(Number(args.limite) || 60, 1), 200)
      const sorted = sortTasks(tasks)
      return {
        ok: true,
        total: sorted.length,
        tareas: sorted.slice(0, limite).map(taskSummaryForAgent),
        enlace: `${baseUrl()}/tareas`,
        ...(sorted.length > limite ? { nota: `Hay ${sorted.length - limite} más: filtra.` } : {}),
      }
    }

    case 'tarea_ver': {
      const t = await findMyTask(scope, args.id)
      return isFail(t) ? t : { ok: true, tarea: { ...taskDetailForAgent(t, baseUrl()), enlace: `${baseUrl()}/tareas` } }
    }

    case 'tarea_crear': {
      const title = String(args.titulo ?? '').trim()
      if (!title) return fail('Falta el título')
      const status = args.estado ? parseAgentStatus(args.estado) : 'pending'
      if (!status) return fail(`estado no válido. Usa: ${AGENT_STATUSES.join(', ')}`)
      const priority = args.prioridad ? parseAgentPriority(args.prioridad) : 'medium'
      if (!priority) return fail(`prioridad no válida. Usa: ${AGENT_PRIORITIES.join(', ')}`)
      const common = {
        title,
        description: textArg(args.descripcion) ?? null,
        status,
        priority,
        estimated_hours: hoursArg(args.horas_estimadas) ?? null,
        due_date: parseAgentDate(args.fecha_fin) ?? null,
        subtasks: agentSubtasksInput(args.subtareas),
      }
      if (!args.proyecto) {
        // Tarea suelta: siempre para él mismo y creada por él (así la puede borrar)
        const task = await createPersonalTask({ ...common, user_id: me.id, created_by_id: me.id, created_by_name: me.name })
        return { ok: true, creada: taskSummaryForAgent(task) }
      }
      const p = findMyProject(scope, args.proyecto)
      if (isFail(p)) return p
      const task = await createProjectTask({ ...common, project_id: p.id, assignee: textArg(args.asignado) ?? null })
      return { ok: true, creada: taskSummaryForAgent(task) }
    }

    case 'tarea_editar':
    case 'tarea_mover': {
      const t = await findMyTask(scope, args.id)
      if (isFail(t)) return t
      const status = args.estado !== undefined ? parseAgentStatus(args.estado) : undefined
      if (status === null) return fail(`estado no válido. Usa: ${AGENT_STATUSES.join(', ')}`)
      if (name === 'tarea_mover') {
        if (!status) return fail('Falta el estado')
        const moved = t.source === 'personal' ? await updatePersonalTask(t, { status }) : await updateProjectTask(t, { status })
        return moved ? { ok: true, tarea: taskSummaryForAgent(moved), antes: statusLabel(t.status) } : fail('No se pudo mover')
      }
      const priority = args.prioridad !== undefined ? parseAgentPriority(args.prioridad) : undefined
      if (priority === null) return fail(`prioridad no válida. Usa: ${AGENT_PRIORITIES.join(', ')}`)
      const title = args.titulo !== undefined ? String(args.titulo).trim() : undefined
      if (title === '') return fail('El título no puede quedar vacío')
      const patch = {
        title,
        description: textArg(args.descripcion),
        status,
        priority,
        estimated_hours: hoursArg(args.horas_estimadas),
        due_date: parseAgentDate(args.fecha_fin),
      }
      if (t.source === 'personal') {
        if (args.asignado !== undefined) return fail('Es una tarea suelta tuya: no se puede asignar a otra persona.')
        const u = await updatePersonalTask(t, patch)
        return u ? { ok: true, tarea: taskSummaryForAgent(u) } : fail('No se pudo guardar')
      }
      const u = await updateProjectTask(t, { ...patch, assignee: textArg(args.asignado) })
      return u ? { ok: true, tarea: taskSummaryForAgent(u) } : fail('No se pudo guardar')
    }

    case 'tarea_subtareas': {
      const t = await findMyTask(scope, args.id)
      if (isFail(t)) return t
      const list = [...(t.subtasks ?? [])]
      const applied = applySubtaskAction(list, args)
      if (!applied.ok) return { ...applied, subtareas: subtasksForAgent(list, false) }
      const saved =
        t.source === 'personal'
          ? await updatePersonalTask(t, { subtasks: applied.next })
          : await updateProjectTask(t, { subtasks: applied.next })
      return saved ? { ok: true, tarea: saved.title, subtareas: subtasksForAgent(saved.subtasks, false) } : fail('No se pudo guardar')
    }

    case 'tarea_borrar': {
      const t = await findMyTask(scope, args.id)
      if (isFail(t)) return t
      if (!canDeleteTask(me, t, myProjectIds)) {
        return fail('Esta tarea te la puso un socio: no se puede borrar. Si ya no hace falta, muévela a hecha.')
      }
      const filter = deleteFilterFor(me, t, myProjectIds)
      const preview = await previewDelete({ ...filter, max_filas: 1 })
      if (!preview.ok) return preview
      const pending = await createPending({
        chatId: ctx.chatId,
        requestedBy: ctx.userId,
        kind: 'delete_rows',
        payload: preview.payload as unknown as Record<string, unknown>,
        summary: String(args.motivo ?? '').trim() || `Borrar la tarea "${t.title}"`,
        preview: { tabla: filter.tabla, filas: preview.count, muestra: preview.sample },
      })
      ctx.pending.push(pending)
      return {
        ok: true,
        estado: 'PENDIENTE_DOBLE_CONFIRMACION',
        mensaje: 'No se ha borrado todavía: le llegan dos códigos para confirmarlo. Díselo así.',
      }
    }

    // ——— Proyectos ———
    case 'mis_proyectos': {
      if (!scope.projects.length) return { ok: true, proyectos: [], nota: 'No tienes proyectos asignados.' }
      const ids = scope.projects.map((p) => p.id)
      const rows = await prisma.$queryRaw<
        { id: string; name: string; status: string; service_type: string | null; cliente: string | null; abiertas: number }[]
      >`
        SELECT p.id::text AS id, p.name, p.status, p.service_type,
               COALESCE(NULLIF(c.empresa, ''), c.nombre) AS cliente,
               (SELECT COUNT(*)::int FROM project_dev_tasks t WHERE t.project_id = p.id AND t.status <> 'done') AS abiertas
        FROM proyectos p
        LEFT JOIN contacts c ON c.id = p.contact_id
        WHERE p.id = ANY(${ids}::uuid[])
        ORDER BY p.name
      `
      return {
        ok: true,
        proyectos: rows.map((r) => ({
          nombre: r.name,
          estado: r.status,
          servicio: r.service_type,
          cliente: r.cliente,
          tareas_abiertas: r.abiertas,
          enlace: `${baseUrl()}/gestion-proyecto/proyectos/${r.id}?tab=tareas`,
        })),
      }
    }

    case 'proyecto_ver': {
      const p = findMyProject(scope, args.proyecto)
      if (isFail(p)) return p
      const [onb] = await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT summary, client_context, scope_text, stack_text, deliverables, contacts, internal_notes
        FROM project_dev_onboarding WHERE project_id = ${p.id}::uuid LIMIT 1
      `.catch(() => [] as Record<string, unknown>[])
      const docs = await prisma.$queryRaw<{ title: string; doc_type: string; url: string | null; file_name: string | null }[]>`
        SELECT title, doc_type, url, file_name FROM project_dev_onboarding_docs
        WHERE project_id = ${p.id}::uuid ORDER BY created_at ASC
      `.catch(() => [])
      const field = (k: string) => stripPriceLines(String(onb?.[k] ?? '')) || undefined
      return {
        ok: true,
        proyecto: p.name,
        resumen: field('summary'),
        contexto_cliente: field('client_context'),
        alcance: field('scope_text'),
        stack: field('stack_text'),
        entregables: field('deliverables'),
        contactos: field('contacts'),
        notas_internas: field('internal_notes'),
        documentos: docs.map((d) => ({ titulo: d.title, ...(d.doc_type === 'link' && d.url ? { url: d.url } : { archivo: d.file_name }) })),
        enlace: `${baseUrl()}/gestion-proyecto/proyectos/${p.id}?tab=tareas`,
      }
    }

    case 'mcp_listar':
    case 'mcp_usar':
      // Solo los MCP de sus proyectos: lo filtra mcp-tools con la lista que pone el servidor
      return runMcpTool(name, args, { projectIds: scope.assignedIds })

    case 'enviar_documento': {
      const filename = String(args.nombre_archivo || 'documento.txt').replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ]/g, '_')
      const ext = filename.split('.').pop()?.toLowerCase() || 'txt'
      const mime = { csv: 'text/csv', md: 'text/markdown', json: 'application/json' }[ext] || 'text/plain'
      ctx.documents.push({
        filename,
        buffer: Buffer.from(String(args.contenido || '').slice(0, 2_000_000), 'utf8'),
        mime: `${mime}; charset=utf-8`,
        caption: args.descripcion ? String(args.descripcion) : undefined,
      })
      return { ok: true, adjunto: filename }
    }

    // ——— Tickets (developers) ———
    case 'tickets_listar': {
      let ids = scope.assignedIds
      if (args.proyecto) {
        const p = findMyProject(scope, args.proyecto)
        if (isFail(p)) return p
        ids = [p.id]
      }
      if (!ids.length) return { ok: true, tickets: [] }
      const status = args.estado ? TICKET_FROM[norm(args.estado)] : null
      if (args.estado && !status) return fail(`estado no válido. Usa: ${TICKET_STATUSES.join(', ')}`)
      const rows = await listTickets({ status, projectIds: ids, assigneeUserId: me.id, limit: 50, offset: 0 })
      return {
        ok: true,
        tickets: rows.map((r) => ({
          id: r.id,
          titulo: r.title,
          proyecto: r.project_name,
          estado: TICKET_TO[r.status] ?? r.status,
          prioridad: r.priority,
          ultimo_mensaje_cliente: (r.last_client_message || '').slice(0, 200),
          creado: r.created_at instanceof Date ? r.created_at.toISOString().slice(0, 10) : String(r.created_at),
        })),
      }
    }

    case 'ticket_ver': {
      const row = await myTicket(scope, args.id)
      if (isFail(row)) return row
      const updates = await listTicketUpdates(row.id).catch(() => [])
      return {
        ok: true,
        ticket: {
          id: row.id,
          titulo: row.title,
          proyecto: row.project_name,
          estado: TICKET_TO[row.status] ?? row.status,
          prioridad: row.priority,
          descripcion: row.description,
          cliente: row.reporter_name,
          conversacion: updates.slice(-20).map((u) => ({
            de: u.is_from_client ? 'cliente' : u.author_name || 'Buffalo',
            mensaje: u.message,
            fecha: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at),
          })),
          enlace: `${baseUrl()}/tickets`,
        },
      }
    }

    case 'ticket_responder':
    case 'ticket_estado': {
      const row = await myTicket(scope, args.id)
      if (isFail(row)) return row
      const status = args.estado ? TICKET_FROM[norm(args.estado)] : null
      if (args.estado && !status) return fail(`estado no válido. Usa: ${TICKET_STATUSES.join(', ')}`)
      const message = name === 'ticket_responder' ? String(args.mensaje ?? '').trim() : ''
      if (name === 'ticket_responder') {
        if (!message) return fail('Falta el mensaje')
        if (args.confirmado !== true) {
          return {
            ok: true,
            estado: 'BORRADOR_SIN_ENVIAR',
            mensaje_al_cliente: message,
            nota: 'No se ha enviado. Enséñale este texto y envíalo (confirmado=true) solo si dice que sí.',
          }
        }
      } else if (!status) {
        return fail('Falta el estado')
      }
      if (status) await updateTicketStatus(row.id, status)
      const nextStatus = status || row.status
      if (message) {
        await insertTicketUpdate({ ticketId: row.id, authorName: me.email, message, status })
      }
      const notify = await notifyClientTicketUpdate({
        callbackUrl: row.ticket_callback_url,
        callbackToken: row.ticket_callback_token,
        payload: {
          event: 'ticket.updated',
          ticket_id: row.id,
          external_id: row.external_id,
          project_ref: row.config_ref,
          status: nextStatus,
          message: message || `Estado actualizado a ${nextStatus}`,
          updated_by: me.email,
          updated_at: new Date().toISOString(),
        },
      })
      return { ok: true, estado: TICKET_TO[nextStatus] ?? nextStatus, cliente_avisado: notify.sent }
    }

    // ——— Leads, contactos y pipelines (project managers). Nunca precios. ———
    case 'leads_buscar': {
      const q = String(args.buscar ?? '').trim()
      const estado = args.estado ? norm(args.estado) : null
      if (estado && !LEAD_STATUSES.includes(estado as (typeof LEAD_STATUSES)[number])) {
        return fail(`estado no válido. Usa: ${LEAD_STATUSES.join(', ')}`)
      }
      const limite = Math.min(Math.max(Number(args.limite) || 30, 1), 100)
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT l.id, c.nombre, c.empresa, c.email, c.telefono, l.estado, l.origen_principal AS origen,
                l.prioridad, l.updated_at
         FROM leads l JOIN contacts c ON c.id = l.contact_id
         WHERE ($1::text = '' OR c.nombre ILIKE $2 OR c.empresa ILIKE $2 OR c.email ILIKE $2 OR c.telefono ILIKE $2)
           AND ($3::text IS NULL OR l.estado = $3)
         ORDER BY l.updated_at DESC
         LIMIT $4`,
        q,
        `%${q}%`,
        estado,
        limite
      )
      return { ok: true, leads: serializeRows(rows) }
    }

    case 'lead_ver': {
      const id = Number(args.id)
      if (!Number.isInteger(id) || id <= 0) return fail('id de lead no válido')
      const [lead] = await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT l.id, l.contact_id, c.nombre, c.empresa, c.email, c.telefono, c.ciudad,
               l.estado, l.origen_principal AS origen, l.prioridad, l.notas, l.ultima_interaccion,
               l.created_at, l.updated_at
        FROM leads l JOIN contacts c ON c.id = l.contact_id
        WHERE l.id = ${id}
      `
      if (!lead) return fail('No existe ese lead')
      const actividad = await prisma.$queryRaw<{ kind: string; title: string; body: string | null; created_at: Date; created_by: string | null }[]>`
        SELECT kind, title, body, created_at, created_by FROM crm_activities
        WHERE lead_id = ${id} OR contact_id = ${Number(lead.contact_id)}
        ORDER BY created_at DESC LIMIT 10
      `.catch(() => [])
      const proyectos = await prisma.$queryRaw<{ name: string; status: string }[]>`
        SELECT name, status FROM proyectos WHERE lead_id = ${id}
      `.catch(() => [])
      const { notas, contact_id: _c, ...rest } = lead
      return {
        ok: true,
        lead: {
          ...serializeRows([rest])[0],
          notas: stripPriceLines(String(notas ?? '')),
          actividad: actividad.map((a) => ({
            tipo: a.kind,
            titulo: stripPriceLines(a.title),
            texto: stripPriceLines(a.body).slice(0, 500),
            fecha: a.created_at instanceof Date ? a.created_at.toISOString() : String(a.created_at),
            por: a.created_by,
          })),
          proyectos: proyectos.map((p) => ({ nombre: p.name, estado: p.status })),
          enlace: `${baseUrl()}/leads/${id}`,
        },
      }
    }

    case 'lead_nota': {
      const id = Number(args.id)
      const texto = String(args.texto ?? '').trim()
      if (!Number.isInteger(id) || id <= 0) return fail('id de lead no válido')
      if (!texto) return fail('Falta el texto')
      const [lead] = await prisma.$queryRaw<{ notas: string | null }[]>`SELECT notas FROM leads WHERE id = ${id}`
      if (!lead) return fail('No existe ese lead')
      const stamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
      const block = `[WhatsApp · ${me.name} · ${stamp}]\n${texto.slice(0, 5000)}`
      // Se añade al final: lo que ya había (también las líneas con precios) no se toca
      await prisma.$executeRaw`
        UPDATE leads SET notas = CASE WHEN COALESCE(TRIM(notas), '') = '' THEN ${block} ELSE notas || ${'\n\n' + block} END,
          updated_at = NOW()
        WHERE id = ${id}
      `
      return { ok: true, lead_id: id, nota: texto }
    }

    case 'lead_estado': {
      const id = Number(args.id)
      const estado = norm(args.estado)
      if (!Number.isInteger(id) || id <= 0) return fail('id de lead no válido')
      if (!LEAD_STATUSES.includes(estado as (typeof LEAD_STATUSES)[number])) {
        return fail(`estado no válido. Usa: ${LEAD_STATUSES.join(', ')}`)
      }
      const n = await prisma.$executeRaw`UPDATE leads SET estado = ${estado}, updated_at = NOW() WHERE id = ${id}`
      return n ? { ok: true, lead_id: id, estado } : fail('No existe ese lead')
    }

    case 'contactos_buscar': {
      const q = String(args.buscar ?? '').trim()
      if (q.length < 2) return fail('Escribe al menos 2 letras para buscar')
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT c.id, c.nombre, c.empresa, c.email, c.telefono, c.ciudad, l.id AS lead_id, l.estado AS lead_estado
         FROM contacts c LEFT JOIN leads l ON l.contact_id = c.id
         WHERE c.nombre ILIKE $1 OR c.empresa ILIKE $1 OR c.email ILIKE $1 OR c.telefono ILIKE $1
         ORDER BY c.updated_at DESC LIMIT 30`,
        `%${q}%`
      )
      return { ok: true, contactos: serializeRows(rows) }
    }

    case 'pipelines_listar': {
      const rows = await prisma.$queryRaw<{ pipeline_id: string; pipeline: string; etapa: string | null; tarjetas: number }[]>`
        SELECT p.id::text AS pipeline_id, p.name AS pipeline, s.name AS etapa,
               (SELECT COUNT(*)::int FROM pipeline_cards c
                 WHERE c.pipeline_id = p.id AND c.stage = s.name AND c.deleted_at IS NULL) AS tarjetas
        FROM pipelines p
        LEFT JOIN pipeline_stages s ON s.pipeline_id = p.id
        ORDER BY p.name, s.position
      `
      const by = new Map<string, { id: string; nombre: string; columnas: { nombre: string; tarjetas: number }[] }>()
      for (const r of rows) {
        const entry = by.get(r.pipeline_id) ?? { id: r.pipeline_id, nombre: r.pipeline, columnas: [] }
        if (r.etapa) entry.columnas.push({ nombre: r.etapa, tarjetas: r.tarjetas })
        by.set(r.pipeline_id, entry)
      }
      return { ok: true, pipelines: Array.from(by.values()) }
    }

    case 'pipeline_tarjetas': {
      const pipeline = await findPipeline(args.pipeline)
      if (isFail(pipeline)) return pipeline
      const etapa = String(args.etapa ?? '').trim()
      const limite = Math.min(Math.max(Number(args.limite) || 50, 1), 200)
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT c.id::text AS id, c.stage AS columna, c.tags, c.capture_date, c.notes, c.entity_type,
                COALESCE(NULLIF(ct.empresa, ''), ct.nombre, c.entity_id) AS nombre
         FROM pipeline_cards c
         LEFT JOIN contacts ct ON c.entity_type = 'contact' AND ct.id::text = c.entity_id
         WHERE c.pipeline_id = $1::uuid AND c.deleted_at IS NULL
           AND ($2::text = '' OR LOWER(c.stage) = LOWER($2))
         ORDER BY c.stage, c.position
         LIMIT $3`,
        pipeline.id,
        etapa,
        limite
      )
      return {
        ok: true,
        pipeline: pipeline.name,
        tarjetas: serializeRows(rows).map((r) => ({ ...r, notes: stripPriceLines(String(r.notes ?? '')) || undefined })),
      }
    }

    case 'pipeline_mover': {
      const cardId = String(args.tarjeta_id ?? '').trim()
      if (!UUID_RE.test(cardId)) return fail('tarjeta_id no válido: sácalo de pipeline_tarjetas')
      const [card] = await prisma.$queryRaw<{ pipeline_id: string; stage: string }[]>`
        SELECT pipeline_id::text AS pipeline_id, stage FROM pipeline_cards WHERE id = ${cardId}::uuid AND deleted_at IS NULL
      `
      if (!card) return fail('No existe esa tarjeta')
      const stages = await prisma.$queryRaw<{ name: string; color: string }[]>`
        SELECT name, color FROM pipeline_stages WHERE pipeline_id = ${card.pipeline_id}::uuid ORDER BY position
      `
      const target = stages.find((s) => norm(s.name) === norm(args.etapa))
      if (!target) return fail(`Esa columna no existe en este pipeline. Columnas: ${stages.map((s) => s.name).join(', ')}`)
      const [mp] = await prisma.$queryRaw<{ max_pos: number | null }[]>`
        SELECT MAX(position)::int AS max_pos FROM pipeline_cards
        WHERE pipeline_id = ${card.pipeline_id}::uuid AND stage = ${target.name} AND deleted_at IS NULL
      `
      await prisma.$executeRaw`
        UPDATE pipeline_cards SET stage = ${target.name}, stage_color = ${target.color},
          position = ${(mp?.max_pos ?? -1) + 1}, updated_at = NOW()
        WHERE id = ${cardId}::uuid
      `
      return { ok: true, antes: card.stage, ahora: target.name }
    }
  }
  return fail(`Herramienta desconocida: ${name}`)
}

async function findPipeline(raw: unknown): Promise<{ id: string; name: string } | Fail> {
  const q = String(raw ?? '').trim()
  if (!q) return fail('Falta el pipeline')
  const all = await prisma.$queryRaw<{ id: string; name: string }[]>`SELECT id::text AS id, name FROM pipelines ORDER BY name`
  const byId = all.find((p) => p.id === q)
  if (byId) return byId
  const exact = all.filter((p) => norm(p.name) === norm(q))
  if (exact.length === 1) return exact[0]
  const partial = all.filter((p) => norm(p.name).includes(norm(q)))
  if (partial.length === 1) return partial[0]
  return fail(`No encuentro ese pipeline. Pipelines: ${all.map((p) => p.name).join(', ')}`)
}
