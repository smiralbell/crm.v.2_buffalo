import { describe, expect, it } from 'vitest'
import type { WorkTask } from '@/lib/tareas/types'
import { FUTURE_TOOLS, allowedToolNames, canDeleteTask, canSeeTask, canSeeTicket, deleteFilterFor } from './access'
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
  const me = { id: 5, name: 'Abel', role: 'developer' as const }
  const mine = ['p1']

  const projectTask = (over: Partial<WorkTask>) => task({ source: 'project', project_id: 'p1', owner_user_id: null, ...over })

  it('ve sus tareas sueltas y las de sus proyectos, nada más', () => {
    expect(canSeeTask(me, task({}), mine)).toBe(true)
    expect(canSeeTask(me, task({ owner_user_id: 6 }), mine)).toBe(false)
    expect(canSeeTask(me, projectTask({ assignee_user_ids: [5] }), mine, 2)).toBe(true)
    expect(canSeeTask(me, projectTask({ project_id: 'p2', assignee_user_ids: [5] }), mine, 2)).toBe(false)
  })

  it('de un proyecto compartido no ve las tareas de otro developer', () => {
    expect(canSeeTask(me, projectTask({ assignee_user_ids: [6], assignee: 'Calvin' }), mine, 2)).toBe(false)
    expect(canSeeTask(me, projectTask({ assignee_user_ids: [5, 6], assignee: 'Abel, Calvin' }), mine, 2)).toBe(true)
    // Tareas antiguas sin ids: se casa por nombre
    expect(canSeeTask(me, projectTask({ assignee: 'Calvin' }), mine, 2)).toBe(false)
    expect(canSeeTask(me, projectTask({ assignee: 'Abel' }), mine, 2)).toBe(true)
    // Sin asignar: solo si es el único developer del proyecto
    expect(canSeeTask(me, projectTask({}), mine, 2)).toBe(false)
    expect(canSeeTask(me, projectTask({}), mine, 1)).toBe(true)
    // Y tampoco las puede borrar
    expect(canDeleteTask(me, projectTask({ assignee_user_ids: [6] }), mine, 2)).toBe(false)
  })

  it('el project manager ve todas las de sus proyectos, pero no las de otros proyectos', () => {
    const pm = { id: 7, name: 'Pepa', role: 'project_manager' as const }
    expect(canSeeTask(pm, projectTask({ assignee_user_ids: [6] }), mine, 2)).toBe(true)
    expect(canSeeTask(pm, projectTask({ project_id: 'p2' }), mine, 2)).toBe(false)
  })

  it('solo ve los tickets asignados a él en sus proyectos de Retención', () => {
    expect(canSeeTicket(me, { assignee_user_id: 5, project_id: 'p1' }, ['p1'])).toBe(true)
    expect(canSeeTicket(me, { assignee_user_id: 6, project_id: 'p1' }, ['p1'])).toBe(false)
    expect(canSeeTicket(me, { assignee_user_id: null, project_id: 'p1' }, ['p1'])).toBe(false)
    expect(canSeeTicket(me, { assignee_user_id: 5, project_id: 'p2' }, ['p1'])).toBe(false)
  })

  it('no borra lo que le puso un socio ni nada ajeno', () => {
    expect(canDeleteTask(me, task({}), mine)).toBe(true)
    expect(canDeleteTask(me, task({ created_by_id: null }), mine)).toBe(false)
    expect(canDeleteTask(me, task({ owner_user_id: 6, created_by_id: 5 }), mine)).toBe(false)
    expect(canDeleteTask(me, task({ source: 'project', project_id: 'p2' }), mine, 1)).toBe(false)
  })

  it('el filtro del borrado vuelve a exigir que sea suyo al ejecutarlo', () => {
    expect(deleteFilterFor(me, task({}), mine)).toEqual({
      tabla: 'crm_user_tasks',
      where_sql: 'id = $1::uuid AND user_id = $2 AND created_by_id = $2',
      where_params: [task({}).id, 5],
    })
    const f = deleteFilterFor(me, task({ source: 'project', project_id: 'p1', assignee: 'Abel' }), mine)
    expect(f.tabla).toBe('project_dev_tasks')
    // Developer: además tiene que seguir siendo suya al ejecutar el DELETE
    expect(f.where_sql).toContain('$3::int = ANY(assignee_user_ids)')
    expect(f.where_params).toEqual([task({}).id, ['p1'], 5, 'Abel'])
    const pm = deleteFilterFor({ id: 7, name: 'Pepa', role: 'project_manager' }, task({ source: 'project', project_id: 'p1' }), mine)
    expect(pm.where_params).toEqual([task({}).id, ['p1']])
  })
})

describe('herramientas por rol', () => {
  const dev = teamTools('developer').map((t) => t.function.name)
  const pm = teamTools('project_manager').map((t) => t.function.name)

  const TAREAS = ['mis_tareas', 'tarea_ver', 'tarea_crear', 'tarea_editar', 'tarea_mover', 'tarea_subtareas', 'tarea_borrar']
  const RETENCION = ['mis_proyectos', 'retencion_ver', 'incidencia_resolver', 'tickets_listar', 'ticket_ver', 'ticket_responder', 'ticket_estado', 'mcp_listar', 'mcp_usar']

  it('los dos roles tienen sus Tareas y la Retención de sus proyectos', () => {
    for (const list of [dev, pm]) {
      for (const name of [...TAREAS, ...RETENCION, 'enviar_documento']) expect(list, name).toContain(name)
    }
  })

  it('cada uno configura su propio agente: preferencias y avisos (sin poder mandar a otros)', () => {
    for (const name of [
      'mis_instrucciones',
      'instruccion_guardar',
      'instruccion_cambiar',
      'instruccion_quitar',
      'avisos_programar',
      'avisos_listar',
      'avisos_cambiar',
      'avisos_auto_ver',
      'avisos_auto_cambiar',
      'avisos_auto_general',
      'avisos_auto_restablecer',
      'avisos_auto_historial',
    ]) {
      expect(dev, name).toContain(name)
    }
    const avisos = teamTools('developer').find((t) => t.function.name === 'avisos_programar')!
    const props = Object.keys((avisos.function.parameters as { properties: Record<string, unknown> }).properties)
    expect(props).not.toContain('destino')
    expect(props).not.toContain('chat_id')
  })

  it('la ficha de proyecto, leads y pipelines están apagados', () => {
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
      'instrucciones_borrar',
      'avisos_pausar',
      // Reúne datos de cualquier persona: solo para los socios
      'contexto_persona',
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
      retencion: [{ id: 'p1', name: 'PREICO' }],
      devCounts: new Map(),
    })
    expect(prompt).toContain('Hablas con Abel')
    expect(prompt).toContain('identificada por su número de móvil')
    expect(prompt).toContain('- PREICO')
    expect(prompt).toContain('Nunca puede ver nada de otra persona')
    expect(prompt).toContain('Sus proyectos en Retención')
    expect(prompt).toContain('facturación')
  })
})
