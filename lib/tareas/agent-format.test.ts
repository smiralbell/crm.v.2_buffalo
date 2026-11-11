import { describe, expect, it } from 'vitest'
import {
  agentSubtasksInput,
  parseAgentDate,
  parseAgentPriority,
  parseAgentStatus,
  taskDetailForAgent,
  taskSummaryForAgent,
} from '@/lib/tareas/agent-format'
import type { WorkTask } from '@/lib/tareas/types'

function task(over: Partial<WorkTask>): WorkTask {
  return {
    id: 't1',
    project_id: '',
    title: 'Revisar webhook',
    description: 'Detalle',
    status: 'in_progress',
    priority: 'high',
    assignee: 'Ekaitz',
    estimated_hours: 3,
    due_date: '2026-11-20',
    position: 0,
    status_changed_at: '2026-11-01T00:00:00.000Z',
    stale_extension_until: null,
    stale_notice_active: false,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    subtasks: [
      { id: 'a', title: 'Paso 1', done: true, description: 'Hazlo así' },
      { id: 'b', title: 'Paso 2', done: false },
    ],
    source: 'personal',
    project_name: null,
    owner_user_id: 7,
    created_by_id: null,
    created_by_name: 'Sergi',
    ...over,
  }
}

describe('estados y prioridades del agente', () => {
  it('entiende el español y lo que guarda el CRM', () => {
    expect(parseAgentStatus('pendiente')).toBe('pending')
    expect(parseAgentStatus('En curso')).toBe('in_progress')
    expect(parseAgentStatus('validacion')).toBe('buffalo_validation')
    expect(parseAgentStatus('hecha')).toBe('done')
    expect(parseAgentStatus('done')).toBe('done')
    expect(parseAgentStatus('archivada')).toBeNull()
    expect(parseAgentPriority('Alta')).toBe('high')
    expect(parseAgentPriority('urgente')).toBe('high')
    expect(parseAgentPriority('x')).toBeNull()
  })
})

describe('parseAgentDate', () => {
  it('no tocar, quitar o fecha válida', () => {
    expect(parseAgentDate(undefined)).toBeUndefined()
    expect(parseAgentDate('')).toBeNull()
    expect(parseAgentDate(null)).toBeNull()
    expect(parseAgentDate('2026-11-20')).toBe('2026-11-20')
    expect(parseAgentDate('2026-11-20T10:00:00+01:00')).toBe('2026-11-20')
  })

  it('rechaza fechas que no existen o mal escritas', () => {
    expect(() => parseAgentDate('2026-02-30')).toThrow()
    expect(() => parseAgentDate('20/11/2026')).toThrow()
  })
})

describe('agentSubtasksInput', () => {
  it('acepta objetos en español o textos sueltos y descarta vacíos', () => {
    expect(
      agentSubtasksInput([{ titulo: 'Uno', explicacion: 'Cómo' }, 'Dos', { titulo: '  ' }, { title: 'Tres', done: true }])
    ).toEqual([
      { title: 'Uno', description: 'Cómo', done: false },
      { title: 'Dos', done: false },
      { title: 'Tres', done: true },
    ])
    expect(agentSubtasksInput('no')).toEqual([])
  })
})

describe('formato para el agente', () => {
  it('resumen de una tarea suelta', () => {
    expect(taskSummaryForAgent(task({}))).toEqual({
      id: 't1',
      titulo: 'Revisar webhook',
      tipo: 'suelta',
      persona: 'Ekaitz',
      estado: 'en_curso',
      prioridad: 'alta',
      fecha_fin: '2026-11-20',
      subtareas: '1/2',
      puesta_por: 'Sergi',
    })
  })

  it('ficha de una tarea de proyecto con subtareas numeradas y enlace al proyecto', () => {
    const d = taskDetailForAgent(
      task({ source: 'project', project_id: 'p9', project_name: 'PREICO', owner_user_id: null }),
      'https://crm.test'
    )
    expect(d).toMatchObject({ tipo: 'proyecto', proyecto: 'PREICO' })
    expect(d.subtareas).toEqual([
      { numero: 1, titulo: 'Paso 1', hecha: true, explicacion: 'Hazlo así' },
      { numero: 2, titulo: 'Paso 2', hecha: false },
    ])
    expect(d.enlace).toBe('https://crm.test/gestion-proyecto/proyectos/p9?tab=tareas')
  })
})
