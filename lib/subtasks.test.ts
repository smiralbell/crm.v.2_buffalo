import { describe, expect, it } from 'vitest'
import { MAX_SUBTASKS, newSubtask, normalizeSubtasks, subtaskProgress } from './subtasks'

describe('normalizeSubtasks', () => {
  it('devuelve [] para valores que no son lista', () => {
    expect(normalizeSubtasks(null)).toEqual([])
    expect(normalizeSubtasks(undefined)).toEqual([])
    expect(normalizeSubtasks({})).toEqual([])
    expect(normalizeSubtasks('no json')).toEqual([])
  })

  it('acepta JSON en texto y limpia títulos', () => {
    const out = normalizeSubtasks('[{"id":"a","title":"  Diseñar logo  ","done":true}]')
    expect(out).toEqual([{ id: 'a', title: 'Diseñar logo', done: true }])
  })

  it('descarta entradas sin título y fuerza done a booleano', () => {
    const out = normalizeSubtasks([
      { id: 'a', title: '' },
      { id: 'b', title: 'Paso', done: 'yes' },
      'texto suelto',
    ])
    expect(out).toEqual([{ id: 'b', title: 'Paso', done: false }])
  })

  it('genera id nuevo si falta o está repetido', () => {
    const out = normalizeSubtasks([
      { id: 'x', title: 'Uno' },
      { id: 'x', title: 'Dos' },
      { title: 'Tres' },
    ])
    expect(out).toHaveLength(3)
    expect(new Set(out.map((s) => s.id)).size).toBe(3)
    expect(out[0].id).toBe('x')
  })

  it('guarda la descripción limpia y la omite si está vacía', () => {
    const out = normalizeSubtasks([
      { id: 'a', title: 'Con texto', description: '  Explicar el paso\ncon detalle  ' },
      { id: 'b', title: 'Vacía', description: '   ' },
      { id: 'c', title: 'Rara', description: 42 },
    ])
    expect(out[0]).toEqual({ id: 'a', title: 'Con texto', done: false, description: 'Explicar el paso\ncon detalle' })
    expect(out[1]).toEqual({ id: 'b', title: 'Vacía', done: false })
    expect(out[2]).toEqual({ id: 'c', title: 'Rara', done: false })
  })

  it('corta en el máximo permitido', () => {
    const many = Array.from({ length: MAX_SUBTASKS + 10 }, (_, i) => ({ title: `Paso ${i}` }))
    expect(normalizeSubtasks(many)).toHaveLength(MAX_SUBTASKS)
  })
})

describe('subtaskProgress', () => {
  it('cuenta hechas y totales', () => {
    const a = { ...newSubtask('A'), done: true }
    const b = newSubtask('B')
    expect(subtaskProgress([a, b])).toEqual({ done: 1, total: 2 })
    expect(subtaskProgress(undefined)).toEqual({ done: 0, total: 0 })
  })
})
