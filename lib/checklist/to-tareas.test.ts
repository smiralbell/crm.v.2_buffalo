import { describe, expect, it } from 'vitest'
import { findSocio, ownersForColumn, taskFromChecklistItem } from './to-tareas'

const users = [
  { id: 1, name: 'Santiago Miralbell', role: 'admin' },
  { id: 2, name: 'Sergi Masoliver', role: 'admin' },
  { id: 3, name: 'Sergio Comercial', role: 'comercial' },
]

describe('findSocio', () => {
  it('encuentra a cada socio por el nombre, sin acentos ni mayúsculas, y solo entre admins', () => {
    expect(findSocio(users, 'santi')).toBe(1)
    expect(findSocio(users, 'sergi')).toBe(2)
    expect(findSocio([{ id: 9, name: 'SANTÍ', role: 'admin' }], 'santi')).toBe(9)
  })

  it('si aún no está dado de alta, o hay dos que encajan, no elige a nadie', () => {
    expect(findSocio([{ id: 3, name: 'Sergi Dev', role: 'developer' }], 'sergi')).toBeNull()
    const twice = [...users, { id: 4, name: 'Sergi Bis', role: 'admin' }]
    expect(findSocio(twice, 'sergi')).toBeNull()
  })
})

describe('ownersForColumn', () => {
  const socios = { santi: 1, sergi: 2 }
  it('Santi a Santi, Sergi a Sergi y la compartida a los dos', () => {
    expect(ownersForColumn('santi', socios)).toEqual([1])
    expect(ownersForColumn('sergi', socios)).toEqual([2])
    expect(ownersForColumn('inbox', socios)).toEqual([1, 2])
  })
})

describe('taskFromChecklistItem', () => {
  it('conserva título, subtareas y estado; las hechas pasan como terminadas', () => {
    const t = taskFromChecklistItem({
      id: 1,
      title: '  Preparar propuesta  ',
      done: true,
      column_key: 'sergi',
      subtasks: [{ id: 'a', title: 'Precios', done: false }],
    })
    expect(t).toMatchObject({ title: 'Preparar propuesta', status: 'done' })
    expect(t.subtasks).toHaveLength(1)
    expect(t.description).toContain('Sergi')
  })

  it('las de la columna compartida dicen que son copia', () => {
    const t = taskFromChecklistItem({ id: 2, title: 'Idea', done: false, column_key: 'inbox', subtasks: null })
    expect(t.status).toBe('pending')
    expect(t.subtasks).toEqual([])
    expect(t.description).toContain('copia')
  })
})
