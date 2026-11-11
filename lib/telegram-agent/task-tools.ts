import { prisma } from '@/lib/prisma'
import { getUserProjects } from '@/lib/project-access'
import type { Subtask } from '@/lib/subtasks'
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
  reassignPersonalTask,
  updatePersonalTask,
  updateProjectTask,
} from '@/lib/tareas/store'
import type { WorkProject, WorkTask } from '@/lib/tareas/types'

/**
 * Tareas de developers, project managers y comerciales para el agente de los socios
 * (WhatsApp y Telegram). Son las mismas que ven en su módulo Tareas del CRM:
 * tareas sueltas (crm_user_tasks) y tareas de proyecto (project_dev_tasks).
 * Borrar siempre pasa por la doble confirmación del socio.
 */

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'function' as const, function: { name, description, parameters: { type: 'object', properties, required } } }
}

const subtaskItem = {
  type: 'object',
  properties: {
    titulo: { type: 'string' },
    explicacion: { type: 'string', description: 'Qué hay que hacer en este paso (opcional, admite markdown)' },
  },
  required: ['titulo'],
}

const personaProp = {
  type: 'string',
  description: 'Nombre (o parte), email o id de la persona del equipo. Mira tareas_personas si dudas.',
}
const proyectoProp = { type: 'string', description: 'Nombre (o parte) o id del proyecto' }
const estadoProp = { type: 'string', enum: [...AGENT_STATUSES], description: 'Columna del tablero' }
const prioridadProp = { type: 'string', enum: [...AGENT_PRIORITIES] }

export const TASK_TOOLS = [
  tool(
    'tareas_personas',
    'Lista las personas del equipo (developers, project managers, comerciales) a las que se les pueden poner tareas, con sus proyectos y cuántas tareas sueltas abiertas tienen.',
    { buscar: { type: 'string', description: 'Filtrar por nombre o email (opcional)' } }
  ),
  tool(
    'tareas_listar',
    'Lista tareas del módulo Tareas: las sueltas de cada persona y las de los proyectos. Sin filtros devuelve todas las abiertas. Con persona: sus tareas sueltas y las de sus proyectos (lo mismo que ve en el CRM).',
    {
      persona: personaProp,
      proyecto: proyectoProp,
      tipo: { type: 'string', enum: ['todas', 'sueltas', 'proyecto'] },
      estado: estadoProp,
      prioridad: prioridadProp,
      vencidas: { type: 'boolean', description: 'Solo las que tienen fecha fin pasada y no están hechas' },
      buscar: { type: 'string', description: 'Texto en título, descripción, proyecto o subtareas' },
      incluir_hechas: { type: 'boolean', description: 'Por defecto no salen las hechas' },
      limite: { type: 'number', description: 'Máximo de tareas (por defecto 60)' },
    }
  ),
  tool('tareas_ver', 'Ficha completa de una tarea: descripción, subtareas numeradas con su explicación, adjuntos y enlace.', {
    id: { type: 'string' },
  }, ['id']),
  tool(
    'tareas_crear',
    'Crea una tarea. Con "persona": tarea suelta para esa persona (sin proyecto). Con "proyecto": tarea en el tablero de ese proyecto (y "asignado" opcional). Uno de los dos es obligatorio. Puede llevar subtareas con su explicación.',
    {
      persona: personaProp,
      proyecto: proyectoProp,
      titulo: { type: 'string' },
      descripcion: { type: 'string' },
      prioridad: prioridadProp,
      estado: estadoProp,
      fecha_fin: { type: 'string', description: 'YYYY-MM-DD' },
      horas_estimadas: { type: 'number' },
      asignado: { type: 'string', description: 'Solo tareas de proyecto: nombre de quien la hace' },
      subtareas: { type: 'array', items: subtaskItem },
    },
    ['titulo']
  ),
  tool(
    'tareas_editar',
    'Cambia una tarea: título, descripción, prioridad, estado (columna), fecha fin ("" para quitarla), horas, asignado (proyecto) o persona (pasa una tarea suelta a otra persona). Solo se cambia lo que mandes.',
    {
      id: { type: 'string' },
      titulo: { type: 'string' },
      descripcion: { type: 'string' },
      prioridad: prioridadProp,
      estado: estadoProp,
      fecha_fin: { type: 'string', description: 'YYYY-MM-DD, o "" para quitarla' },
      horas_estimadas: { type: 'number' },
      asignado: { type: 'string', description: 'Solo tareas de proyecto ("" para dejarla sin asignar)' },
      persona: { type: 'string', description: 'Solo tareas sueltas: a quién se la pasas' },
    },
    ['id']
  ),
  tool('tareas_mover', 'Mueve una tarea de columna: pendiente, en_curso, validacion (validación por Buffalo) o hecha.', {
    id: { type: 'string' },
    estado: estadoProp,
  }, ['id', 'estado']),
  tool(
    'tareas_subtareas',
    'Gestiona las subtareas de una tarea. accion: anadir (titulo, explicacion), editar (numero, titulo y/o explicacion), marcar / desmarcar (numero), quitar (numero), reemplazar (subtareas: la lista entera nueva). Los números salen de tareas_ver.',
    {
      id: { type: 'string' },
      accion: { type: 'string', enum: ['anadir', 'editar', 'marcar', 'desmarcar', 'quitar', 'reemplazar'] },
      numero: { type: 'number', description: 'Número de la subtarea (empieza en 1)' },
      titulo: { type: 'string' },
      explicacion: { type: 'string' },
      subtareas: { type: 'array', items: subtaskItem },
    },
    ['id', 'accion']
  ),
  tool(
    'tareas_borrar',
    'Pide borrar una tarea. NO la borra: el socio recibe la doble confirmación. Si solo hay que quitarla de en medio, mejor moverla a hecha.',
    { id: { type: 'string' }, motivo: { type: 'string' } },
    ['id']
  ),
]

export const TASK_TOOL_NAMES = new Set(TASK_TOOLS.map((t) => t.function.name))
export const TASK_READ_ONLY = ['tareas_personas', 'tareas_listar', 'tareas_ver']

/** Quién pide el cambio y cómo se piden borrados (lo pone tools.ts). */
export interface TaskToolContext {
  actorName: string
  requestDeletion: (args: { tabla: string; id: string; motivo: string; max_filas: number }) => Promise<unknown>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEES_PROJECTS = new Set(['developer', 'project_manager'])
const STATUS_ORDER = { pending: 0, in_progress: 1, buffalo_validation: 2, done: 3 } as const
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const

type Person = { id: number; name: string; email: string; role: string }
type Resolved<T> = { ok: true; value: T } | { ok: false; error: string }

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

async function listPeople(): Promise<Person[]> {
  return prisma.$queryRaw<Person[]>`
    SELECT id, name, email, role FROM crm_users
    WHERE active = TRUE AND role <> 'admin'
    ORDER BY name ASC
  `
}

export async function resolvePerson(raw: unknown): Promise<Resolved<Person>> {
  const q = String(raw ?? '').trim()
  if (!q) return { ok: false, error: 'Falta la persona' }
  const people = await listPeople()
  const asId = /^\d+$/.test(q) ? Number(q) : null
  const byId = asId !== null ? people.find((p) => p.id === asId) : undefined
  if (byId) return { ok: true, value: byId }
  const n = norm(q)
  const exact = people.filter((p) => norm(p.name) === n || norm(p.email) === n)
  if (exact.length === 1) return { ok: true, value: exact[0] }
  const partial = people.filter((p) => norm(p.name).includes(n) || norm(p.email).includes(n))
  if (partial.length === 1) return { ok: true, value: partial[0] }
  if (partial.length === 0) {
    return { ok: false, error: `No hay nadie del equipo que coincida con "${q}". Personas: ${people.map((p) => p.name).join(', ')}` }
  }
  return { ok: false, error: `"${q}" coincide con varias personas: ${partial.map((p) => `${p.name} (id ${p.id})`).join(', ')}. Di cuál.` }
}

export async function resolveProject(raw: unknown): Promise<Resolved<WorkProject>> {
  const q = String(raw ?? '').trim()
  if (!q) return { ok: false, error: 'Falta el proyecto' }
  if (UUID_RE.test(q)) {
    const rows = await prisma.$queryRaw<WorkProject[]>`SELECT id::text AS id, name FROM proyectos WHERE id = ${q}::uuid`
    return rows[0] ? { ok: true, value: rows[0] } : { ok: false, error: 'No existe un proyecto con ese id' }
  }
  const open = await listOpenProjects(null)
  const n = norm(q)
  const exact = open.filter((p) => norm(p.name) === n)
  if (exact.length === 1) return { ok: true, value: exact[0] }
  const partial = open.filter((p) => norm(p.name).includes(n))
  if (partial.length === 1) return { ok: true, value: partial[0] }
  if (partial.length > 1) {
    return { ok: false, error: `"${q}" coincide con varios proyectos: ${partial.map((p) => p.name).join(', ')}. Di cuál.` }
  }
  return { ok: false, error: `No hay ningún proyecto abierto que coincida con "${q}". Proyectos: ${open.map((p) => p.name).join(', ')}` }
}

async function findTask(raw: unknown): Promise<Resolved<WorkTask>> {
  const id = String(raw ?? '').trim()
  if (!UUID_RE.test(id)) return { ok: false, error: 'id de tarea no válido: sácalo de tareas_listar' }
  const task = (await getPersonalTask(id)) ?? (await getProjectTask(id))
  return task ? { ok: true, value: task } : { ok: false, error: 'Esa tarea no existe (puede que ya la hayan borrado)' }
}

function sortTasks(list: WorkTask[]): WorkTask[] {
  return [...list].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
      a.title.localeCompare(b.title, 'es')
  )
}

function todayMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

function hoursArg(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) throw new Error('horas_estimadas tiene que ser un número positivo')
  return n
}

function textArg(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  const s = String(v ?? '').trim()
  return s ? s : null
}

async function saveSubtasks(task: WorkTask, list: Subtask[]): Promise<WorkTask | null> {
  return task.source === 'personal'
    ? updatePersonalTask(task, { subtasks: list })
    : updateProjectTask(task, { subtasks: list })
}

export async function runTaskTool(
  name: string,
  args: Record<string, unknown>,
  ctx: TaskToolContext
): Promise<unknown> {
  switch (name) {
    case 'tareas_personas': {
      const people = await listPeople()
      const n = norm(String(args.buscar ?? ''))
      const list = n ? people.filter((p) => norm(p.name).includes(n) || norm(p.email).includes(n)) : people
      const open = await prisma
        .$queryRawUnsafe<{ user_id: number; n: number }[]>(
          `SELECT user_id, COUNT(*)::int AS n FROM crm_user_tasks WHERE status <> 'done' GROUP BY user_id`
        )
        .catch(() => [] as { user_id: number; n: number }[])
      const openBy = new Map(open.map((r) => [Number(r.user_id), r.n]))
      const out = []
      for (const p of list) {
        const projects = SEES_PROJECTS.has(p.role) ? await getUserProjects(p.id) : []
        out.push({
          id: p.id,
          nombre: p.name,
          rol: p.role,
          proyectos: projects.map((x) => x.name),
          tareas_sueltas_abiertas: openBy.get(p.id) ?? 0,
          enlace_tareas: `${baseUrl()}/usuarios/${p.id}/tareas`,
        })
      }
      return { ok: true, personas: out }
    }

    case 'tareas_listar': {
      let person: Person | null = null
      let project: WorkProject | null = null
      if (args.persona) {
        const r = await resolvePerson(args.persona)
        if (!r.ok) return r
        person = r.value
      }
      if (args.proyecto) {
        const r = await resolveProject(args.proyecto)
        if (!r.ok) return r
        project = r.value
      }
      const tipo = String(args.tipo ?? 'todas')

      let personal: WorkTask[] = []
      if (tipo !== 'proyecto' && !project) personal = await listPersonalTasks(person ? person.id : null)

      let projectTasks: WorkTask[] = []
      if (tipo !== 'sueltas') {
        let projects: WorkProject[]
        if (project) projects = [project]
        else if (person) {
          projects = SEES_PROJECTS.has(person.role)
            ? await listOpenProjects((await getUserProjects(person.id)).map((p) => p.id))
            : []
        } else projects = await listOpenProjects(null)
        projectTasks = await listProjectTasks(projects)
      }

      let tasks = [...personal, ...projectTasks]
      const estado = args.estado ? parseAgentStatus(args.estado) : null
      if (args.estado && !estado) return { ok: false, error: `estado no válido. Usa: ${AGENT_STATUSES.join(', ')}` }
      if (estado) tasks = tasks.filter((t) => t.status === estado)
      else if (args.incluir_hechas !== true) tasks = tasks.filter((t) => t.status !== 'done')
      const prioridad = args.prioridad ? parseAgentPriority(args.prioridad) : null
      if (prioridad) tasks = tasks.filter((t) => t.priority === prioridad)
      if (args.vencidas === true) {
        const today = todayMadrid()
        tasks = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < today)
      }
      if (args.buscar) tasks = applyTaskFilters(tasks, { ...EMPTY_FILTERS, q: String(args.buscar) })

      const limite = Math.min(Math.max(Number(args.limite) || 60, 1), 200)
      const sorted = sortTasks(tasks)
      const porEstado: Record<string, number> = {}
      for (const t of sorted) porEstado[statusLabel(t.status)] = (porEstado[statusLabel(t.status)] ?? 0) + 1
      return {
        ok: true,
        ...(person ? { persona: person.name, enlace: `${baseUrl()}/usuarios/${person.id}/tareas` } : {}),
        ...(project ? { proyecto: project.name } : {}),
        total: sorted.length,
        por_estado: porEstado,
        tareas: sorted.slice(0, limite).map(taskSummaryForAgent),
        ...(sorted.length > limite ? { nota: `Hay ${sorted.length - limite} más: filtra o sube el límite.` } : {}),
      }
    }

    case 'tareas_ver': {
      const r = await findTask(args.id)
      if (!r.ok) return r
      return { ok: true, tarea: taskDetailForAgent(r.value, baseUrl()) }
    }

    case 'tareas_crear': {
      const title = String(args.titulo ?? '').trim()
      if (!title) return { ok: false, error: 'Falta el título' }
      if (!!args.persona === !!args.proyecto) {
        return { ok: false, error: 'Indica persona (tarea suelta) o proyecto (tarea de proyecto), uno de los dos.' }
      }
      const status = args.estado ? parseAgentStatus(args.estado) : 'pending'
      if (!status) return { ok: false, error: `estado no válido. Usa: ${AGENT_STATUSES.join(', ')}` }
      const priority = args.prioridad ? parseAgentPriority(args.prioridad) : 'medium'
      if (!priority) return { ok: false, error: `prioridad no válida. Usa: ${AGENT_PRIORITIES.join(', ')}` }
      const common = {
        title,
        description: textArg(args.descripcion) ?? null,
        status,
        priority,
        estimated_hours: hoursArg(args.horas_estimadas) ?? null,
        due_date: parseAgentDate(args.fecha_fin) ?? null,
        subtasks: agentSubtasksInput(args.subtareas),
      }
      if (args.persona) {
        const r = await resolvePerson(args.persona)
        if (!r.ok) return r
        const task = await createPersonalTask({
          ...common,
          user_id: r.value.id,
          created_by_id: null,
          created_by_name: ctx.actorName,
        })
        return { ok: true, creada: taskDetailForAgent(task, baseUrl()) }
      }
      const r = await resolveProject(args.proyecto)
      if (!r.ok) return r
      const task = await createProjectTask({
        ...common,
        project_id: r.value.id,
        assignee: textArg(args.asignado) ?? null,
      })
      return { ok: true, creada: taskDetailForAgent(task, baseUrl()) }
    }

    case 'tareas_editar':
    case 'tareas_mover': {
      const r = await findTask(args.id)
      if (!r.ok) return r
      let task = r.value
      const status = args.estado !== undefined ? parseAgentStatus(args.estado) : undefined
      if (status === null) return { ok: false, error: `estado no válido. Usa: ${AGENT_STATUSES.join(', ')}` }
      if (name === 'tareas_mover') {
        if (!status) return { ok: false, error: 'Falta el estado' }
        const moved =
          task.source === 'personal' ? await updatePersonalTask(task, { status }) : await updateProjectTask(task, { status })
        if (!moved) return { ok: false, error: 'No se pudo mover' }
        return { ok: true, tarea: taskSummaryForAgent(moved), antes: statusLabel(task.status) }
      }
      const priority = args.prioridad !== undefined ? parseAgentPriority(args.prioridad) : undefined
      if (priority === null) return { ok: false, error: `prioridad no válida. Usa: ${AGENT_PRIORITIES.join(', ')}` }
      const title = args.titulo !== undefined ? String(args.titulo).trim() : undefined
      if (title === '') return { ok: false, error: 'El título no puede quedar vacío' }
      const patch = {
        title,
        description: textArg(args.descripcion),
        status,
        priority,
        estimated_hours: hoursArg(args.horas_estimadas),
        due_date: parseAgentDate(args.fecha_fin),
      }

      if (task.source === 'personal') {
        if (args.asignado !== undefined) {
          return { ok: false, error: 'Es una tarea suelta: para cambiar de persona usa "persona".' }
        }
        if (args.persona !== undefined) {
          const p = await resolvePerson(args.persona)
          if (!p.ok) return p
          if (p.value.id !== task.owner_user_id) {
            const moved = await reassignPersonalTask(task, p.value.id)
            if (!moved) return { ok: false, error: 'No se pudo pasar la tarea' }
            task = moved
          }
        }
        const updated = await updatePersonalTask(task, patch)
        return updated ? { ok: true, tarea: taskDetailForAgent(updated, baseUrl()) } : { ok: false, error: 'No se pudo guardar' }
      }

      if (args.persona !== undefined) {
        return { ok: false, error: 'Es una tarea de proyecto: para cambiar quién la hace usa "asignado".' }
      }
      const updated = await updateProjectTask(task, { ...patch, assignee: textArg(args.asignado) })
      return updated ? { ok: true, tarea: taskDetailForAgent(updated, baseUrl()) } : { ok: false, error: 'No se pudo guardar' }
    }

    case 'tareas_subtareas': {
      const r = await findTask(args.id)
      if (!r.ok) return r
      const task = r.value
      const list = [...(task.subtasks ?? [])]
      const applied = applySubtaskAction(list, args)
      if (!applied.ok) return { ...applied, subtareas: subtasksForAgent(list, false) }
      const next = applied.next
      const saved = await saveSubtasks(task, next)
      if (!saved) return { ok: false, error: 'No se pudieron guardar las subtareas' }
      return { ok: true, tarea: saved.title, subtareas: subtasksForAgent(saved.subtasks, false) }
    }

    case 'tareas_borrar': {
      const r = await findTask(args.id)
      if (!r.ok) return r
      const t = r.value
      const donde = t.source === 'personal' ? `tarea suelta de ${t.assignee}` : `tarea del proyecto ${t.project_name}`
      return ctx.requestDeletion({
        tabla: t.source === 'personal' ? 'crm_user_tasks' : 'project_dev_tasks',
        id: t.id,
        motivo: String(args.motivo ?? '').trim() || `Borrar la ${donde}: "${t.title}"`,
        max_filas: 1,
      })
    }
  }
  return { ok: false, error: `Herramienta desconocida: ${name}` }
}
