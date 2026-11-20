import { canViewerSeeProjectTask, isTaskAssignedTo, seesAllProjectTasks } from '@/lib/gestion-proyecto/task-assignees'
import type { WorkTask } from '@/lib/tareas/types'
import type { TeamMember, TeamRole } from '@/lib/team-agent/identity'

/**
 * Reglas de acceso del agente del equipo. Sin base de datos, para poder probarlas.
 * Todas reciben al usuario ya resuelto por su móvil y la lista de SUS proyectos:
 * la IA no puede ampliar ninguna de las dos cosas.
 *
 * Un developer nunca ve nada de otro developer: de un proyecto compartido solo
 * ve las tareas que tiene asignadas (las sin asignar, solo si es el único
 * developer del proyecto), igual que en su tablero del CRM.
 */

export type TaskMember = Pick<TeamMember, 'id' | 'name' | 'role'>

/**
 * Una tarea es suya si es una tarea suelta suya, o es de uno de sus proyectos
 * y le toca a él (project manager: todas las de sus proyectos).
 * projectDeveloperCount: developers del proyecto de la tarea (para las sin asignar).
 */
export function canSeeTask(
  member: TaskMember,
  task: WorkTask,
  myProjectIds: string[],
  projectDeveloperCount = 0
): boolean {
  if (task.source === 'personal') return task.owner_user_id === member.id
  if (!myProjectIds.includes(task.project_id)) return false
  return canViewerSeeProjectTask(task, member, projectDeveloperCount)
}

/**
 * Borrar: una tarea suelta solo si se la creó él mismo (las que pone un socio no,
 * igual que en el CRM); las de proyecto, si la puede ver.
 */
export function canDeleteTask(
  member: TaskMember,
  task: WorkTask,
  myProjectIds: string[],
  projectDeveloperCount = 0
): boolean {
  if (!canSeeTask(member, task, myProjectIds, projectDeveloperCount)) return false
  if (task.source === 'personal') return task.created_by_id === member.id
  return true
}

/**
 * Filtro SQL que se guarda con la petición de borrado. Se vuelve a aplicar al
 * ejecutar el DELETE, así que aunque la tarea cambiase de dueño mientras se
 * confirma, no se borraría nada que ya no sea suyo.
 */
export function deleteFilterFor(
  member: TaskMember,
  task: WorkTask,
  myProjectIds: string[]
): { tabla: string; where_sql: string; where_params: unknown[] } {
  if (task.source === 'personal') {
    return {
      tabla: 'crm_user_tasks',
      where_sql: 'id = $1::uuid AND user_id = $2 AND created_by_id = $2',
      where_params: [task.id, member.id],
    }
  }
  if (seesAllProjectTasks(member.role)) {
    return {
      tabla: 'project_dev_tasks',
      where_sql: 'id = $1::uuid AND project_id = ANY($2::uuid[])',
      where_params: [task.id, myProjectIds],
    }
  }
  // Developer: además, que siga siendo suya. Con ids, que esté entre los asignados;
  // sin ids (tareas antiguas), que el asignado no haya cambiado desde que lo pidió.
  return {
    tabla: 'project_dev_tasks',
    where_sql:
      'id = $1::uuid AND project_id = ANY($2::uuid[]) AND ($3::int = ANY(assignee_user_ids) OR (cardinality(assignee_user_ids) = 0 AND assignee IS NOT DISTINCT FROM $4::text))',
    where_params: [task.id, myProjectIds, member.id, task.assignee],
  }
}

/** Un ticket es suyo si se lo han asignado a él y es de uno de sus proyectos de Retención. */
export function canSeeTicket(
  member: Pick<TeamMember, 'id'>,
  ticket: { assignee_user_id: number | null; project_id: string },
  retencionIds: string[]
): boolean {
  return ticket.assignee_user_id === member.id && retencionIds.includes(ticket.project_id)
}

/** ¿La tarea va a nombre de esta persona? */
export function isAssignedToMember(task: WorkTask, member: TaskMember): boolean {
  return task.source === 'personal' ? task.owner_user_id === member.id : isTaskAssignedTo(task, member)
}

/**
 * Herramientas ENCENDIDAS de cada rol. Lo que no está aquí no se ejecuta aunque
 * la IA lo pida.
 */
const TASK_TOOLS = [
  'mis_tareas',
  'tarea_ver',
  'tarea_crear',
  'tarea_editar',
  'tarea_mover',
  'tarea_subtareas',
  'tarea_borrar',
] as const

/** Retención de SUS proyectos en producción: incidencias, vigilancia, sus tickets y el MCP del cliente. */
const RETENCION_TOOLS = [
  'mis_proyectos',
  'retencion_ver',
  'incidencia_resolver',
  'tickets_listar',
  'ticket_ver',
  'ticket_responder',
  'ticket_estado',
  'mcp_listar',
  'mcp_usar',
] as const

/** Su propio agente. */
const PERSONAL_TOOLS = [
  // Solo da formato a la respuesta (adjunta un listado largo); no lee nada
  'enviar_documento',
] as const

const ENABLED: Record<TeamRole, readonly string[]> = {
  developer: [...TASK_TOOLS, ...RETENCION_TOOLS, ...PERSONAL_TOOLS],
  project_manager: [...TASK_TOOLS, ...RETENCION_TOOLS, ...PERSONAL_TOOLS],
}

/**
 * Hechas pero APAGADAS, para ampliar más adelante: para encender una, se añade
 * al rol en ENABLED (y se revisa su texto en el prompt del agente).
 */
export const FUTURE_TOOLS: Record<TeamRole, readonly string[]> = {
  developer: ['proyecto_ver'],
  project_manager: [
    'proyecto_ver',
    'leads_buscar',
    'lead_ver',
    'lead_nota',
    'lead_estado',
    'contactos_buscar',
    'pipelines_listar',
    'pipeline_tarjetas',
    'pipeline_mover',
  ],
}

export function allowedToolNames(role: TeamRole): Set<string> {
  return new Set<string>(ENABLED[role] ?? [])
}

/** Solo lectura: no se apuntan en el registro de acciones. */
export const TEAM_READ_ONLY = new Set([
  'mis_tareas',
  'tarea_ver',
  'mis_proyectos',
  'proyecto_ver',
  'retencion_ver',
  'mcp_listar',
  'tickets_listar',
  'ticket_ver',
  'leads_buscar',
  'lead_ver',
  'contactos_buscar',
  'pipelines_listar',
  'pipeline_tarjetas',
  'mis_instrucciones',
  'avisos_listar',
])
