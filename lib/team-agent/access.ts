import type { WorkTask } from '@/lib/tareas/types'
import type { TeamMember, TeamRole } from '@/lib/team-agent/identity'

/**
 * Reglas de acceso del agente del equipo. Sin base de datos, para poder probarlas.
 * Todas reciben al usuario ya resuelto por su móvil y la lista de SUS proyectos:
 * la IA no puede ampliar ninguna de las dos cosas.
 */

/** Una tarea es suya si es una tarea suelta suya o es de uno de sus proyectos. */
export function canSeeTask(member: Pick<TeamMember, 'id'>, task: WorkTask, myProjectIds: string[]): boolean {
  if (task.source === 'personal') return task.owner_user_id === member.id
  return myProjectIds.includes(task.project_id)
}

/**
 * Borrar: una tarea suelta solo si se la creó él mismo (las que pone un socio no,
 * igual que en el CRM); las de proyecto, si el proyecto es suyo.
 */
export function canDeleteTask(member: Pick<TeamMember, 'id'>, task: WorkTask, myProjectIds: string[]): boolean {
  if (!canSeeTask(member, task, myProjectIds)) return false
  if (task.source === 'personal') return task.created_by_id === member.id
  return true
}

/**
 * Filtro SQL que se guarda con la petición de borrado. Se vuelve a aplicar al
 * ejecutar el DELETE, así que aunque la tarea cambiase de dueño mientras se
 * confirma, no se borraría nada que ya no sea suyo.
 */
export function deleteFilterFor(
  member: Pick<TeamMember, 'id'>,
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
  return {
    tabla: 'project_dev_tasks',
    where_sql: 'id = $1::uuid AND project_id = ANY($2::uuid[])',
    where_params: [task.id, myProjectIds],
  }
}

/**
 * Herramientas ENCENDIDAS de cada rol. Lo que no está aquí no se ejecuta aunque
 * la IA lo pida. De momento, developers y PMs solo tienen su módulo de Tareas.
 */
const TASK_TOOLS = [
  'mis_tareas',
  'tarea_ver',
  'tarea_crear',
  'tarea_editar',
  'tarea_mover',
  'tarea_subtareas',
  'tarea_borrar',
  // Trabajo diario: lo que ha hecho cada día
  'trabajo_registrar',
  'trabajo_ver',
  'trabajo_editar',
  'trabajo_borrar',
  // Solo da formato a la respuesta (adjunta un listado largo); no lee nada
  'enviar_documento',
] as const

const ENABLED: Record<TeamRole, readonly string[]> = {
  developer: TASK_TOOLS,
  project_manager: TASK_TOOLS,
}

/**
 * Hechas pero APAGADAS, para ampliar más adelante: para encender una, se añade
 * al rol en ENABLED (y se revisa su texto en el prompt del agente).
 */
export const FUTURE_TOOLS: Record<TeamRole, readonly string[]> = {
  developer: ['mis_proyectos', 'proyecto_ver', 'mcp_listar', 'mcp_usar', 'tickets_listar', 'ticket_ver', 'ticket_responder', 'ticket_estado'],
  project_manager: [
    'mis_proyectos',
    'proyecto_ver',
    'mcp_listar',
    'mcp_usar',
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
  'trabajo_ver',
  'mis_proyectos',
  'proyecto_ver',
  'mcp_listar',
  'tickets_listar',
  'ticket_ver',
  'leads_buscar',
  'lead_ver',
  'contactos_buscar',
  'pipelines_listar',
  'pipeline_tarjetas',
])
