import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILTERS,
  applyTaskFilters,
  countActiveFilters,
  mergeVisibleTasks,
} from '@/lib/tareas/filters'
import { canDeletePersonalTask } from '@/lib/tareas/permissions'
import type { WorkTask } from '@/lib/tareas/types'

function task(over: Partial<WorkTask>): WorkTask {
  return {
    id: 'x',
    project_id: '',
    title: 'Tarea',
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
    created_by_id: null,
    created_by_name: null,
    ...over,
  }
}

const today = new Date(2026, 10, 11) // 11 nov 2026

describe('applyTaskFilters', () => {
  const list = [
    task({ id: 'a', title: 'Revisar factura', assignee: 'Ana', due_date: '2026-11-05' }),
    task({
      id: 'b',
      title: 'Montar webhook',
      source: 'project',
      project_id: 'p1',
      project_name: 'PREICO',
      priority: 'high',
      due_date: '2026-11-14',
    }),
    task({ id: 'c', title: 'Hecha', status: 'done', due_date: '2026-11-01' }),
    task({
      id: 'd',
      title: 'Otra',
      subtasks: [{ id: 's', title: 'Llamar a Ángel', done: false }],
    }),
  ]
  const ids = (f: Partial<typeof EMPTY_FILTERS>) =>
    applyTaskFilters(list, { ...EMPTY_FILTERS, ...f }, today).map((t) => t.id)

  it('sin filtros devuelve todo', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd'])
  })

  it('filtra por origen', () => {
    expect(ids({ origin: 'personal' })).toEqual(['a', 'c', 'd'])
    expect(ids({ origin: 'project:p1' })).toEqual(['b'])
  })

  it('filtra por persona y sin asignar', () => {
    expect(ids({ person: 'ana' })).toEqual(['a'])
    expect(ids({ person: 'none' })).toEqual(['b', 'c', 'd'])
  })

  it('vencidas y próximos 7 días ignoran las hechas', () => {
    expect(ids({ due: 'overdue' })).toEqual(['a'])
    expect(ids({ due: 'week' })).toEqual(['b'])
    expect(ids({ due: 'none' })).toEqual(['d'])
  })

  it('busca en título, proyecto y subtareas, sin tildes', () => {
    expect(ids({ q: 'preico' })).toEqual(['b'])
    expect(ids({ q: 'angel' })).toEqual(['d'])
    expect(ids({ q: 'revisar factura' })).toEqual(['a'])
  })

  it('oculta hechas y por prioridad', () => {
    expect(ids({ hideDone: true })).toEqual(['a', 'b', 'd'])
    expect(ids({ priority: 'high' })).toEqual(['b'])
  })

  it('cuenta filtros activos', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0)
    expect(countActiveFilters({ ...EMPTY_FILTERS, q: 'x', hideDone: true })).toBe(2)
  })
})

describe('mergeVisibleTasks', () => {
  const all = [{ id: '1', v: 0 }, { id: '2', v: 0 }, { id: '3', v: 0 }]

  it('aplica cambios y deja intactas las no visibles', () => {
    const prev = [all[0], all[1]]
    const next = [{ id: '1', v: 1 }, all[1]]
    expect(mergeVisibleTasks(all, prev, next)).toEqual([{ id: '1', v: 1 }, all[1], all[2]])
  })

  it('quita la borrada y añade la nueva', () => {
    const prev = [all[0], all[1]]
    const next = [all[0], { id: '4', v: 0 }]
    expect(mergeVisibleTasks(all, prev, next).map((t) => t.id)).toEqual(['1', '3', '4'])
  })
})

describe('canDeletePersonalTask', () => {
  it('admin siempre; el usuario solo las que se creó él', () => {
    expect(canDeletePersonalTask({ id: 0, role: 'admin' }, { owner_user_id: 5, created_by_id: null })).toBe(true)
    expect(canDeletePersonalTask({ id: 5, role: 'developer' }, { owner_user_id: 5, created_by_id: 5 })).toBe(true)
    expect(canDeletePersonalTask({ id: 5, role: 'developer' }, { owner_user_id: 5, created_by_id: null })).toBe(false)
    expect(canDeletePersonalTask({ id: 6, role: 'developer' }, { owner_user_id: 5, created_by_id: 6 })).toBe(false)
  })
})
