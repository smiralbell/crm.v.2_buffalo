import { describe, expect, it } from 'vitest'
import type { WorkTask } from '@/lib/tareas/types'
import { FUTURE_TOOLS, allowedToolNames, canDeleteTask, canSeeTask, deleteFilterFor } from './access'
import { validateTeamPhone } from './identity'
import { teamTools } from './tools'
import { teamPrompt } from './agent'

const socios = new Set(['34600111222'])

describe('validateTeamPhone', () => {
  it('normaliza y acepta móviles con prefijo', () => {
    expect(validateTeamPhone('+34 611 22 33 44', socios)).toEqual({ ok: true, phone: '34611223344' })
    expect(validateTeamPhone('', socios)).toEqual({ ok: true, phone: null })
  })

  it('pide el prefijo, rechaza basura y nunca deja usar el móvil de un socio', () => {
    expect(validateTeamPhone('611223344', socios).ok).toBe(false)
    expect(validateTeamPhone('12ab', socios).ok).toBe(false)
    expect(validateTeamPhone('34 600 111 222', socios)).toMatchObject({ ok: false })
  })
})

function task(over: Partial<WorkTask>): WorkTask {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    project_id: '',
    title: 'T',
    description: null,
    status: 'pending',
    priority: 'medium',
    assignee: null,
    estimated_hours: null,
    due_date: null,
    position: 0,
    status_changed_at: '2026-11-01T00:00:00.000Z',
    stale_extension_until: null,
    stale_notice_active: false,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    subtasks: [],
    source: 'personal',
    project_name: null,
    owner_user_id: 5,
    created_by_id: 5,
    created_by_name: 'Abel',
    ...over,
  }
}

describe('acceso a tareas', () => {
  const me = { id: 5 }
  const mine = ['p1']

  it('ve sus tareas sueltas y las de sus proyectos, nada más', () => {
    expect(canSeeTask(me, task({}), mine)).toBe(true)
    expect(canSeeTask(me, task({ owner_user_id: 6 }), mine)).toBe(false)
    expect(canSeeTask(me, task({ source: 'project', project_id: 'p1', owner_user_id: null }), mine)).toBe(true)
    expect(canSeeTask(me, task({ source: 'project', project_id: 'p2', owner_user_id: null }), mine)).toBe(false)
  })

  it('no borra lo que le puso un socio ni nada ajeno', () => {
    expect(canDeleteTask(me, task({}), mine)).toBe(true)
    expect(canDeleteTask(me, task({ created_by_id: null }), mine)).toBe(false)
    expect(canDeleteTask(me, task({ owner_user_id: 6, created_by_id: 5 }), mine)).toBe(false)
    expect(canDeleteTask(me, task({ source: 'project', project_id: 'p2' }), mine)).toBe(false)
  })

  it('el filtro del borrado vuelve a exigir que sea suyo al ejecutarlo', () => {
    expect(deleteFilterFor(me, task({}), mine)).toEqual({
      tabla: 'crm_user_tasks',
      where_sql: 'id = $1::uuid AND user_id = $2 AND created_by_id = $2',
      where_params: [task({}).id, 5],
    })
    const f = deleteFilterFor(me, task({ source: 'project', project_id: 'p1' }), mine)
    expect(f.tabla).toBe('project_dev_tasks')
    expect(f.where_params).toEqual([task({}).id, ['p1']])
  })
})

describe('herramientas por rol', () => {
  const dev = teamTools('developer').map((t) => t.function.name)
  const pm = teamTools('project_manager').map((t) => t.function.name)

  const TAREAS = ['mis_tareas', 'tarea_ver', 'tarea_crear', 'tarea_editar', 'tarea_mover', 'tarea_subtareas', 'tarea_borrar', 'enviar_documento']

  it('de momento los dos roles solo tienen su módulo de Tareas', () => {
    expect(dev).toEqual(TAREAS)
    expect(pm).toEqual(TAREAS)
  })

  it('proyectos, tickets, leads, pipelines y MCP están apagados', () => {
    for (const role of ['developer', 'project_manager'] as const) {
      const on = allowedToolNames(role)
      for (const name of FUTURE_TOOLS[role]) expect(on.has(name), `${role}:${name}`).toBe(false)
    }
  })

  it('ninguno tiene SQL, facturación, borrados genéricos ni herramientas de los socios', () => {
    const forbidden = [
      'db_consultar',
      'db_ejecutar_sql',
      'db_insertar',
      'db_actualizar',
      'solicitar_borrado',
      'solicitar_sql_destructivo',
      'get_finance_brief',
      'search_invoices',
      'get_bank_recent',
      'tareas_crear',
      'tareas_personas',
      'instrucciones_guardar',
      'avisos_programar',
      'enviar_mensaje_socios',
      'delegar_subagentes',
    ]
    for (const name of forbidden) {
      expect(dev, name).not.toContain(name)
      expect(pm, name).not.toContain(name)
    }
  })

  it('ninguna herramienta acepta un usuario por parámetro', () => {
    for (const role of ['developer', 'project_manager'] as const) {
      for (const t of teamTools(role)) {
        const props = Object.keys((t.function.parameters as { properties: Record<string, unknown> }).properties)
        for (const p of ['user_id', 'usuario', 'persona', 'owner', 'userId']) expect(props, t.function.name).not.toContain(p)
      }
    }
  })

  it('la lista que ve la IA y la que se deja ejecutar son la misma', () => {
    expect(new Set(dev)).toEqual(allowedToolNames('developer'))
    expect(new Set(pm)).toEqual(allowedToolNames('project_manager'))
  })
})

describe('prompt del equipo', () => {
  it('fija la identidad por el móvil y lista solo sus proyectos', () => {
    const prompt = teamPrompt({
      member: { id: 5, name: 'Abel', email: 'a@b.c', role: 'developer', phone: '34611223344' },
      assignedIds: ['p1'],
      projects: [{ id: 'p1', name: 'PREICO' }],
    })
    expect(prompt).toContain('Hablas con Abel')
    expect(prompt).toContain('identificada por su número de móvil')
    expect(prompt).toContain('- PREICO')
    expect(prompt).toContain('SOLO tiene acceso a su módulo de Tareas')
    expect(prompt).toContain('facturación')
  })
})
