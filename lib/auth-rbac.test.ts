import { describe, expect, it } from 'vitest'
import { canAccessPage, defaultHomeForRole } from '@/lib/auth-rbac'

describe('project_manager page access', () => {
  const pm = 'project_manager' as const

  it('entra en Leads, Pipelines, Marketing, Onboarding, Proyectos y Retención', () => {
    for (const path of [
      '/leads',
      '/leads/12',
      '/pipelines',
      '/pipelines/3',
      '/marketing',
      '/blog',
      '/onboarding',
      '/onboarding/proyectos/7',
      '/gestion-proyecto',
      '/gestion-proyecto/proyectos/abc',
      '/retencion',
      '/retencion/proyectos/abc',
    ]) {
      expect(canAccessPage(path, pm), path).toBe(true)
    }
  })

  it('no entra en finanzas, dashboard admin, usuarios ni paneles de otros roles', () => {
    for (const path of ['/dashboard', '/finances', '/invoices', '/usuarios', '/comercial', '/developer', '/tickets', '/calendario']) {
      expect(canAccessPage(path, pm), path).toBe(false)
    }
  })

  it('su inicio es Leads', () => {
    expect(defaultHomeForRole(pm)).toBe('/leads')
  })
})

describe('módulo Tareas', () => {
  it('lo ven developer, comercial y PM; la ficha de usuarios sigue siendo solo de admin', () => {
    for (const role of ['developer', 'comercial', 'project_manager'] as const) {
      expect(canAccessPage('/tareas', role), role).toBe(true)
    }
    for (const role of ['developer', 'comercial', 'project_manager'] as const) {
      expect(canAccessPage('/usuarios/3', role), role).toBe(false)
    }
  })
})
