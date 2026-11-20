import { describe, expect, it } from 'vitest'
import {
  canViewerSeeProjectTask,
  isTaskAssignedTo,
  joinAssigneeNames,
  nameMatchesUser,
  splitAssigneeNames,
} from './task-assignees'

const calvin = { id: 7, name: 'Calvin', role: 'developer' }
const eddy = { id: 9, name: 'Eddy Ruiz', role: 'developer' }
const admin = { id: 1, name: 'Santi', role: 'admin' }
const pm = { id: 2, name: 'Laura', role: 'project_manager' }

describe('nombres', () => {
  it('separa y junta sin repetir', () => {
    expect(splitAssigneeNames(' Calvin ,Eddy, calvin ,,')).toEqual(['Calvin', 'Eddy'])
    expect(joinAssigneeNames(['Calvin', 'Eddy', ''])).toBe('Calvin, Eddy')
    expect(joinAssigneeNames([])).toBeNull()
  })

  it('casa nombre corto con nombre completo, no apellidos distintos', () => {
    expect(nameMatchesUser('calvin', 'Calvin')).toBe(true)
    expect(nameMatchesUser('Eddy', 'Eddy Ruiz')).toBe(true)
    expect(nameMatchesUser('Eddy Gómez', 'Eddy Ruiz')).toBe(false)
    expect(nameMatchesUser('Calvin', 'Eddy')).toBe(false)
  })
})

describe('a quién va una tarea', () => {
  it('con ids manda el id, no el nombre', () => {
    const t = { assignee: 'Calvin', assignee_user_ids: [9] }
    expect(isTaskAssignedTo(t, calvin)).toBe(false)
    expect(isTaskAssignedTo(t, eddy)).toBe(true)
  })

  it('las antiguas (solo texto) se casan por nombre', () => {
    const t = { assignee: 'Calvin, Eddy', assignee_user_ids: [] }
    expect(isTaskAssignedTo(t, calvin)).toBe(true)
    expect(isTaskAssignedTo(t, eddy)).toBe(true)
  })
})

describe('quién ve cada tarea', () => {
  const deCalvin = { assignee: 'Calvin', assignee_user_ids: [7] }
  const deLosDos = { assignee: 'Calvin, Eddy Ruiz', assignee_user_ids: [7, 9] }
  const deNadie = { assignee: null, assignee_user_ids: [] }

  it('un developer no ve las de otro en un proyecto compartido', () => {
    expect(canViewerSeeProjectTask(deCalvin, eddy, 2)).toBe(false)
    expect(canViewerSeeProjectTask(deCalvin, calvin, 2)).toBe(true)
  })

  it('las de varios las ve cada uno', () => {
    expect(canViewerSeeProjectTask(deLosDos, eddy, 2)).toBe(true)
    expect(canViewerSeeProjectTask(deLosDos, calvin, 2)).toBe(true)
  })

  it('las sin asignar: solo si es el único developer', () => {
    expect(canViewerSeeProjectTask(deNadie, calvin, 1)).toBe(true)
    expect(canViewerSeeProjectTask(deNadie, calvin, 2)).toBe(false)
  })

  it('admin y project manager lo ven todo', () => {
    expect(canViewerSeeProjectTask(deCalvin, admin, 2)).toBe(true)
    expect(canViewerSeeProjectTask(deNadie, pm, 3)).toBe(true)
  })
})
