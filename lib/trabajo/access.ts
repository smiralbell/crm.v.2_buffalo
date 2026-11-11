import type { AuthUser } from '@/lib/auth'
import { findCrmUserById } from '@/lib/crm-users'
import { getUserProjects } from '@/lib/project-access'
import { listOpenProjects } from '@/lib/tareas/store'
import type { ProjectRef } from '@/lib/trabajo/format'

/** Quién tiene módulo de Trabajo diario. */
export const WORKLOG_ROLES = ['developer', 'project_manager'] as const

export function hasWorkLog(role: string): boolean {
  return (WORKLOG_ROLES as readonly string[]).includes(role)
}

export type WorkScope =
  | { ok: true; user: { id: number; name: string; role: string } | null }
  | { ok: false; status: number; error: string }

/**
 * De quién se mira o se apunta el trabajo.
 * - developer / PM: siempre de sí mismo (se ignora lo que pida).
 * - admin: de quien diga (?user_id) o, sin nadie, de todo el equipo (solo lectura).
 * - el resto: no tiene acceso.
 */
export async function resolveWorkScope(viewer: AuthUser, requestedUserId: unknown): Promise<WorkScope> {
  if (hasWorkLog(viewer.role)) return { ok: true, user: { id: viewer.id, name: viewer.name, role: viewer.role } }
  if (viewer.role !== 'admin') return { ok: false, status: 403, error: 'No tienes módulo de trabajo diario' }
  const id = parseInt(String(requestedUserId ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) return { ok: true, user: null }
  const row = await findCrmUserById(id)
  if (!row) return { ok: false, status: 404, error: 'Usuario no encontrado' }
  return { ok: true, user: { id: row.id, name: row.name, role: row.role } }
}

/** Proyectos abiertos de una persona (para elegir en el formulario o reconocerlos en el texto). */
export async function workProjectsFor(userId: number): Promise<ProjectRef[]> {
  const ids = (await getUserProjects(userId)).map((p) => p.id)
  return listOpenProjects(ids)
}

/** Puede cambiar o borrar una entrada: la suya, o cualquiera si es admin. */
export function canEditWorkEntry(viewer: Pick<AuthUser, 'id' | 'role'>, entry: { user_id: number }): boolean {
  return viewer.role === 'admin' || entry.user_id === viewer.id
}
