import type { AuthUser } from '@/lib/auth'
import { userHasProjectAccess } from '@/lib/project-access'

export async function assertTicketAccess(
  user: AuthUser,
  ticket: { assignee_user_id?: number | null; project_id: string }
): Promise<boolean> {
  if (user.role === 'admin') return true
  if (ticket.assignee_user_id !== user.id) return false
  return userHasProjectAccess(user.id, ticket.project_id)
}
