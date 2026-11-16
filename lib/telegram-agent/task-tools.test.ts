import { describe, expect, it } from 'vitest'
import { getModule } from './modules'
import { TASK_READ_ONLY, TASK_TOOLS } from './task-tools'
import { orchestratorTools, subagentTools } from './tools'

const names = (list: { function: { name: string } }[]) => list.map((t) => t.function.name)

describe('herramientas de tareas del agente', () => {
  const all = names(TASK_TOOLS)

  it('cubren leer, crear, editar, mover, subtareas y borrar', () => {
    expect(all).toEqual([
      'tareas_personas',
      'tareas_listar',
      'tareas_ver',
      'tareas_crear',
      'tareas_editar',
      'tareas_mover',
      'tareas_subtareas',
      'tareas_borrar',
    ])
    expect(TASK_READ_ONLY.every((n) => all.includes(n))).toBe(true)
  })

  it('las tiene el orquestador y el subagente de proyectos, no el de finanzas', () => {
    expect(names(orchestratorTools())).toEqual(expect.arrayContaining(all))
    expect(names(subagentTools(getModule('proyectos')!))).toEqual(expect.arrayContaining(all))
    expect(names(subagentTools(getModule('finanzas')!))).not.toContain('tareas_crear')
  })

  it('los campos obligatorios existen en cada esquema', () => {
    for (const t of TASK_TOOLS) {
      const params = t.function.parameters as { properties: Record<string, unknown>; required: string[] }
      for (const r of params.required) expect(Object.keys(params.properties), `${t.function.name}.${r}`).toContain(r)
    }
  })

  it('no hay nombres repetidos entre todas las herramientas del orquestador', () => {
    const list = names(orchestratorTools())
    expect(new Set(list).size).toBe(list.length)
  })
})
