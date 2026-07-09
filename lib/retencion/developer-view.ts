import type { AuthUser } from '@/lib/auth'

export function isDeveloperViewer(user: AuthUser): boolean {
  return user.role === 'developer'
}

export function stripRetencionListRowForDeveloper<T extends {
  setup_fee_eur?: number | null
  monthly_fee_eur?: number | null
  maint_plan?: string | null
  has_mensualidad?: boolean
}>(row: T, user: AuthUser): T {
  if (!isDeveloperViewer(user)) return row
  return {
    ...row,
    setup_fee_eur: null,
    monthly_fee_eur: null,
    maint_plan: null,
    has_mensualidad: undefined,
  }
}

export function stripProyectoFeesForDeveloper<T extends {
  setup_fee_eur?: number | null
  monthly_fee_eur?: number | null
  maint_plan?: string | null
  has_mensualidad?: boolean
}>(proyecto: T, user: AuthUser): T {
  if (!isDeveloperViewer(user)) return proyecto
  return {
    ...proyecto,
    setup_fee_eur: null,
    monthly_fee_eur: null,
    maint_plan: null,
    has_mensualidad: undefined,
  }
}
