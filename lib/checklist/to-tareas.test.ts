import { describe, expect, it } from 'vitest'
import { planChecklistImport, suggestOwners, taskFromChecklistItem } from './to-tareas'

const users = [
  { id: 1, name: 'Santiago Miralbell', role: 'admin' },
  { id: 2, name: 'Sergi Masoliver', role: 'admin' },
  { id: 3, name: 'Laura Dev', role: 'developer' },
]

describe('suggestOwners', () => {
  it('casa Santi y Sergi por el nombre (sin acentos ni mayúsculas) y no sugiere la columna compartida', () => {
    expect(suggestOwners(users)).toEqual({ inbox: null, santi: 1, sergi: 2 })
    expect(suggestOwners([{ id: 9, name: 'SANTÍ', role: 'admin' }]).santi).toBe(9)
  })

  it('con dos coincidencias elige al admin; si no hay forma de saberlo, nada', () => {
    const two = [...users, { id: 4, name: 'Sergio Comercial', role: 'comercial' }]
    expect(suggestOwners(two).sergi).toBe(2)
    const ambiguous = [
      { id: 5, name: 'Sergi A', role: 'developer' },
      { id: 6, name: 'Sergi B', role: 'developer' },
    ]
    expect(suggestOwners(ambiguous).sergi).toBeNull()
  })
})

describe('planChecklistImport', () => {
  const items = [
    { id: 1, title: 'Llamar al gestor', done: false, column_key: 'santi', subtasks: [] },
    { id: 2, title: 'Factura enero', done: true, column_key: 'santi', subtasks: [] },
    { id: 3, title: 'Revisar web', done: false, column_key: 'sergi', subtasks: [] },
    { id: 4, title: 'Idea suelta', done: false, column_key: 'inbox', subtasks: [] },
  ]

  it('pasa cada columna a su dueño y deja fuera lo hecho y lo que no tiene dueño', () => {
    const plan = planChecklistImport(items, { inbox: null, santi: 1, sergi: 2 }, false)
    expect(plan.create.map((c) => [c.item.id, c.ownerId])).toEqual([
      [1, 1],
      [3, 2],
    ])
    expect(plan.skippedDone).toBe(1)
    expect(plan.skippedUnassigned).toBe(1)
  })

  it('con «incluir hechas» y la compartida asignada, pasa todo', () => {
    const plan = planChecklistImport(items, { inbox: 2, santi: 1, sergi: 2 }, true)
    expect(plan.create).toHaveLength(4)
  })
})

describe('taskFromChecklistItem', () => {
  it('conserva título, estado y subtareas, y dice de dónde viene', () => {
    const t = taskFromChecklistItem({
      id: 1,
      title: '  Preparar propuesta  ',
      done: true,
      column_key: 'sergi',
      subtasks: [{ id: 'a', title: 'Precios', done: false }],
    })
    expect(t.title).toBe('Preparar propuesta')
    expect(t.status).toBe('done')
    expect(t.subtasks).toHaveLength(1)
    expect(t.description).toContain('Sergi')
  })
})
