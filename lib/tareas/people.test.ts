import { describe, expect, it } from 'vitest'
import {
  NO_PERSON,
  buildNameIndex,
  buildPersonOptions,
  filterByPeople,
  taskPersonKey,
} from '@/lib/tareas/people'
import type { WorkPerson, WorkTask } from '@/lib/tareas/types'

const people: WorkPerson[] = [
  { id: 1, name: 'Santi', role: 'admin' },
  { id: 2, name: 'Sergi', role: 'admin' },
  { id: 3, name: 'Laura Pérez', role: 'developer' },
]

function task(p: Partial<WorkTask> & { id: string }): WorkTask {
  return {
    project_id: '',
    title: p.id,
    description: null,
    status: 'pending',
    priority: 'medium',
    assignee: null,
    estimated_hours: null,
    due_date: null,
    position: 0,
    status_changed_at: '2026-01-01T00:00:00.000Z',
    stale_extension_until: null,
    stale_notice_active: false,
    subtasks: [],
    attachments: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    source: 'personal',
    project_name: null,
    owner_user_id: null,
    created_by_id: null,
    created_by_name: null,
    ...p,
  }
}

const idx = buildNameIndex(people)

describe('a quién pertenece cada tarea', () => {
  it('tarea suelta → su dueño', () => {
    expect(taskPersonKey(task({ id: 'a', owner_user_id: 2, assignee: 'Sergi' }), idx)).toBe('u:2')
  })

  it('tarea de proyecto → el usuario cuyo nombre coincide (sin tildes ni mayúsculas)', () => {
    expect(taskPersonKey(task({ id: 'b', source: 'project', assignee: 'laura perez' }), idx)).toBe('u:3')
  })

  it('tarea de proyecto con alguien que no es usuario, o sin nadie', () => {
    expect(taskPersonKey(task({ id: 'c', source: 'project', assignee: 'Proveedor X' }), idx)).toBe('n:proveedor x')
    expect(taskPersonKey(task({ id: 'd', source: 'project', assignee: null }), idx)).toBe(NO_PERSON)
  })
})

describe('filtro de personas', () => {
  const tasks = [
    task({ id: 's1', owner_user_id: 1 }),
    task({ id: 's2', owner_user_id: 1, status: 'done' }),
    task({ id: 'g1', owner_user_id: 2 }),
    task({ id: 'p1', source: 'project', assignee: 'Laura Pérez' }),
    task({ id: 'p2', source: 'project', assignee: null }),
  ]

  it('sin nadie marcado se ve todo', () => {
    expect(filterByPeople(tasks, [], idx)).toHaveLength(5)
  })

  it('marcando varias personas se ven solo las suyas', () => {
    expect(filterByPeople(tasks, ['u:1', 'u:3'], idx).map((t) => t.id)).toEqual(['s1', 's2', 'p1'])
    expect(filterByPeople(tasks, [NO_PERSON], idx).map((t) => t.id)).toEqual(['p2'])
  })

  it('opciones: todos los usuarios con sus abiertas, y "Sin asignar" al final', () => {
    const opts = buildPersonOptions(tasks, people, idx)
    expect(opts.map((o) => o.label)).toEqual(['Laura Pérez', 'Santi', 'Sergi', 'Sin asignar'])
    const santi = opts.find((o) => o.key === 'u:1')!
    expect(santi).toMatchObject({ open: 1, total: 2, userId: 1 })
  })
})
