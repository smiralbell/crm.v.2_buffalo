import type { Server } from 'http'
import type { AddressInfo } from 'net'
// express viene con el SDK de MCP pero sin tipos.
// @ts-ignore
import express from 'express'
import { DemoInMemoryAuthProvider } from '@modelcontextprotocol/sdk/examples/server/demoInMemoryOAuthProvider.js'
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { encryptDbUrl } from '../db-url-crypto'
import { connectionForRow, verifyAndStore } from './api'
import { inspectMcp } from './client'
import { detectAuth, finishOAuth, startOAuth } from './oauth'
import type { McpServerRow } from './store'

/** La BD se sustituye por una fila en memoria (mismo cifrado que la real). */
const db = vi.hoisted(() => ({ row: null as unknown as McpServerRow }))

vi.mock('./store', async (importOriginal) => {
  const real = await importOriginal<typeof import('./store')>()
  const encJson = (v: unknown) => (v ? encryptDbUrl(JSON.stringify(v)) : null)
  return {
    ...real,
    getMcpServer: async () => db.row,
    patchMcpServer: async (_id: number, p: Record<string, unknown>) => {
      const r = { ...db.row } as Record<string, unknown>
      for (const [k, v] of Object.entries(p)) {
        if (k === 'oauth_client_info') r.oauth_client_enc = encJson(v)
        else if (k === 'oauth_tokens') r.oauth_tokens_enc = encJson(v)
        else if (k !== 'checked') r[k] = v
      }
      db.row = r as unknown as McpServerRow
      return db.row
    },
  }
})

/** Servidor MCP protegido con OAuth (servidor de autorización de ejemplo del SDK, aprueba solo). */
function startOAuthMcp(withWriteTool: () => boolean): Promise<{ server: Server; base: string; mcpUrl: string }> {
  return new Promise((resolve) => {
    const app = express()
    const server = app.listen(0, '127.0.0.1', () => {
      const base = `http://localhost:${(server.address() as AddressInfo).port}`
      const mcpUrl = `${base}/mcp`
      const provider = new DemoInMemoryAuthProvider()
      app.use(express.json())
      app.use(mcpAuthRouter({ provider, issuerUrl: new URL(base), resourceServerUrl: new URL(mcpUrl) }))
      app.post(
        '/mcp',
        requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(mcpUrl)) }),
        async (req: any, res: any) => {
          const mcp = new McpServer({ name: 'cliente-oauth', version: '1.0.0' })
          mcp.registerTool(
            'ver_resumen',
            { description: 'Resumen', inputSchema: { dia: z.string().optional() }, annotations: { readOnlyHint: true } },
            async () => ({ content: [{ type: 'text', text: '12 leads hoy' }] })
          )
          if (withWriteTool()) {
            mcp.registerTool('enviar_whatsapp', { description: 'Envía', inputSchema: {} }, async () => ({ content: [] }))
          }
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
          res.on('close', () => void transport.close())
          await mcp.connect(transport)
          await transport.handleRequest(req, res, req.body)
        }
      )
      resolve({ server, base, mcpUrl })
    })
  })
}

function oauthRow(url: string): McpServerRow {
  return {
    id: 1,
    proyecto_id: 'p',
    nombre: 'Cliente',
    url,
    transport: 'http',
    auth_mode: 'oauth',
    oauth_client: 'published',
    header_names: [],
    headers_enc: null,
    oauth_client_enc: null,
    oauth_tokens_enc: null,
    oauth_verifier: null,
    oauth_state: null,
    auth_server: null,
    disabled_tools: [],
    estado: 'pendiente',
    detalle: null,
    server_name: null,
    tools: [],
    checked_at: null,
    created_at: '',
    auth_type: null,
    auth_header: null,
    auth_secret_enc: null,
  }
}

describe('conector MCP con inicio de sesión OAuth (como en Claude)', () => {
  let writeTool = false
  let srv: Awaited<ReturnType<typeof startOAuthMcp>>
  // URL pública del CRM simulada: a ella vuelve el login.
  const crm = 'http://localhost:9'

  beforeAll(async () => {
    srv = await startOAuthMcp(() => writeTool)
  })
  afterAll(() => new Promise<void>((r) => srv.server.close(() => r())))

  it('detecta que pide OAuth y que admite registro automático', async () => {
    const d = await detectAuth(srv.mcpUrl)
    expect(d.oauth).toBe(true)
    expect(d.registro_automatico).toBe(true)
    expect(d.abierto).toBe(false)
  })

  it('sin sesión no deja usarlo', async () => {
    db.row = oauthRow(srv.mcpUrl)
    await expect(inspectMcp(connectionForRow(db.row))).rejects.toThrow(/iniciar sesión/)
  })

  async function login() {
    db.row = oauthRow(srv.mcpUrl)
    const { authorizeUrl } = await startOAuth(db.row, crm)
    expect(authorizeUrl).toContain('/authorize')
    expect(db.row.oauth_verifier).toBeTruthy()
    expect(db.row.oauth_client_enc).toBeTruthy() // registrado automáticamente

    // El «usuario» entra y el servidor redirige al callback del CRM con el código.
    const res = await fetch(authorizeUrl!, { redirect: 'manual' })
    const back = new URL(res.headers.get('location')!)
    expect(back.origin + back.pathname).toBe(`${crm}/api/retencion/mcp/oauth/callback`)
    expect(back.searchParams.get('state')).toBe(db.row.oauth_state)

    await finishOAuth(db.row, back.searchParams.get('code')!, crm)
    expect(db.row.oauth_tokens_enc).toBeTruthy()
    expect(db.row.oauth_state).toBeNull()
  }

  it('inicia sesión, guarda los tokens y queda conectado si es de solo lectura', async () => {
    writeTool = false
    await login()
    const pub = await verifyAndStore(db.row)
    expect(pub?.estado).toBe('conectado')
    expect(pub?.sesion_iniciada).toBe(true)
    expect(pub?.tools.map((t) => t.name)).toEqual(['ver_resumen'])
  })

  it('si tras iniciar sesión no es de solo lectura, se bloquea y se borra la sesión', async () => {
    writeTool = true
    await login()
    const pub = await verifyAndStore(db.row)
    expect(pub?.estado).toBe('bloqueado')
    expect(pub?.detalle).toMatch(/enviar_whatsapp/)
    expect(pub?.sesion_iniciada).toBe(false)
    expect(db.row.oauth_tokens_enc).toBeNull()
  })
})
