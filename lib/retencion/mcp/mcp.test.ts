import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { callMcpTool, inspectMcp } from './client'
import { checkReadOnly, writeWordIn } from './readonly'

describe('checkReadOnly', () => {
  const ro = { readOnlyHint: true }

  it('acepta un MCP con todas las herramientas de lectura', () => {
    const check = checkReadOnly([
      { name: 'listar_leads', annotations: ro },
      { name: 'ver_lead', annotations: ro },
      { name: 'get_schedule', annotations: ro },
      { name: 'fireflies_get_transcript', annotations: ro },
    ])
    expect(check).toEqual({ ok: true, bloqueadas: [] })
  })

  it('rechaza herramientas sin readOnlyHint, destructivas o con nombre de escritura', () => {
    const check = checkReadOnly([
      { name: 'listar_leads', annotations: ro },
      { name: 'buscar' },
      { name: 'purge_cache', annotations: { readOnlyHint: true, destructiveHint: true } },
      { name: 'send_email', annotations: ro },
      { name: 'fireflies_create_soundbite', annotations: ro },
      { name: 'leadDelete', annotations: ro },
    ])
    expect(check.ok).toBe(false)
    expect(check.bloqueadas.map((b) => b.name)).toEqual([
      'buscar',
      'purge_cache',
      'send_email',
      'fireflies_create_soundbite',
      'leadDelete',
    ])
  })

  it('detecta el verbo de escritura en cualquier formato de nombre', () => {
    expect(writeWordIn('crear_lead')).toBe('crear')
    expect(writeWordIn('updateInvoice')).toBe('update')
    expect(writeWordIn('mark-message-spam')).toBe('mark')
    expect(writeWordIn('listar_llamadas')).toBeNull()
    expect(writeWordIn('ver_agente_voz')).toBeNull()
  })
})

/** MCP de prueba real por HTTP: una herramienta de lectura y, si se pide, otra de escritura. */
function startMcp(withWriteTool: () => boolean): Promise<{ server: Server; url: string; seenAuth: string[] }> {
  const seenAuth: string[] = []
  const server = createServer(async (req, res) => {
    seenAuth.push(String(req.headers.authorization || ''))
    const mcp = new McpServer({ name: 'cliente-demo', version: '1.0.0' })
    mcp.registerTool(
      'listar_leads',
      { description: 'Lista leads', inputSchema: { estado: z.string().optional() }, annotations: { readOnlyHint: true } },
      async ({ estado }) => ({ content: [{ type: 'text', text: `3 leads ${estado || 'todos'}` }] })
    )
    if (withWriteTool()) {
      mcp.registerTool('borrar_lead', { description: 'Borra', inputSchema: { id: z.number() } }, async () => ({
        content: [{ type: 'text', text: 'borrado' }],
      }))
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => void transport.close())
    await mcp.connect(transport)
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => void transport.handleRequest(req, res, body ? JSON.parse(body) : undefined))
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, seenAuth })
    )
  )
}

describe('cliente MCP contra un servidor real', () => {
  let writeTool = false
  let mcp: Awaited<ReturnType<typeof startMcp>>
  const conn = () => ({ url: mcp.url, transport: 'http' as const, headers: { Authorization: 'Bearer secreto-123' } })

  beforeAll(async () => {
    mcp = await startMcp(() => writeTool)
  })
  afterAll(() => new Promise<void>((r) => mcp.server.close(() => r())))

  it('conecta, envía el token y ve que es de solo lectura', async () => {
    writeTool = false
    const res = await inspectMcp(conn())
    expect(res.serverName).toBe('cliente-demo')
    expect(res.tools.map((t) => t.name)).toEqual(['listar_leads'])
    expect(res.check.ok).toBe(true)
    expect(mcp.seenAuth).toContain('Bearer secreto-123')
  })

  it('llama a la herramienta y devuelve el texto', async () => {
    writeTool = false
    const res = await callMcpTool(conn(), 'listar_leads', { estado: 'nuevos' })
    expect(res).toEqual({ ok: true, resultado: '3 leads nuevos', esError: false })
  })

  it('si el MCP añade una herramienta de escritura, no se conecta ni se llama a nada', async () => {
    writeTool = true
    const inspected = await inspectMcp(conn())
    expect(inspected.check.ok).toBe(false)
    expect(inspected.check.bloqueadas.map((b) => b.name)).toEqual(['borrar_lead'])

    const call = await callMcpTool(conn(), 'listar_leads', {})
    expect(call.ok).toBe(false)
    expect(call.ok === false && call.error).toMatch(/no es de solo lectura/)
  })

  it('da un error claro si no puede conectar', async () => {
    await expect(inspectMcp({ url: 'http://127.0.0.1:1/mcp', transport: 'auto', headers: {} })).rejects.toThrow(
      /No se pudo conectar al MCP/
    )
  })
})
