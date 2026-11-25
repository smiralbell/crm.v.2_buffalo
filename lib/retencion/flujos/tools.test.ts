import { describe, expect, it } from 'vitest'
import { FLOW_TOOLS, executeFlowTool, toolsForGroups } from './tools'
import { cleanTools } from './store'
import { FLOW_SYSTEM_PROMPT, MAX_TOOL_ROUNDS } from './runner'

describe('herramientas del flujo', () => {
  it('expone MCP, incidencias y tickets con nombres estables', () => {
    const names = FLOW_TOOLS.map((t) => t.name)
    expect(names).toEqual([
      'mcp_listar_herramientas',
      'mcp_llamar_herramienta',
      'incidencias_listar',
      'tickets_listar',
    ])
  })

  it('no ofrece ninguna herramienta de escritura en la base de datos', () => {
    const text = JSON.stringify(FLOW_TOOLS).toLowerCase()
    expect(text).not.toMatch(/sql|insert|update|delete|postgres/)
  })

  it('una herramienta desconocida devuelve error sin romper el flujo', async () => {
    const out = await executeFlowTool('00000000-0000-0000-0000-000000000000', 'borrar_todo', {})
    expect(out.ok).toBe(false)
    expect(out.preview).toMatch(/desconocida/)
  })

  it('valida los argumentos de mcp_llamar_herramienta antes de tocar nada', async () => {
    const out = await executeFlowTool('00000000-0000-0000-0000-000000000000', 'mcp_llamar_herramienta', {})
    expect(out.ok).toBe(false)
  })
})

describe('agente de flujos', () => {
  it('pide JSON como salida y tiene un límite de pasos', () => {
    expect(FLOW_SYSTEM_PROMPT).toMatch(/JSON/)
    expect(MAX_TOOL_ROUNDS).toBeGreaterThan(0)
    expect(MAX_TOOL_ROUNDS).toBeLessThanOrEqual(10)
  })
})


describe('herramientas activadas por flujo', () => {
  it('solo deja pasar las conocidas y nunca devuelve una lista vacía', () => {
    expect(cleanTools(['tickets', 'postgres', 'tickets'])).toEqual(['tickets'])
    expect(cleanTools([])).toEqual(['mcp', 'incidencias', 'tickets'])
    expect(cleanTools(null)).toEqual(['mcp', 'incidencias', 'tickets'])
  })

  it('el modelo solo ve las funciones de las herramientas activadas', () => {
    expect(toolsForGroups(['incidencias']).map((t) => t.name)).toEqual(['incidencias_listar'])
    expect(toolsForGroups(['mcp']).map((t) => t.name)).toEqual(['mcp_listar_herramientas', 'mcp_llamar_herramienta'])
  })

  it('una herramienta desactivada devuelve error sin ejecutarse', async () => {
    const out = await executeFlowTool('00000000-0000-0000-0000-000000000000', 'tickets_listar', {}, ['mcp'])
    expect(out.ok).toBe(false)
    expect(out.preview).toMatch(/desactivada/)
  })
})
