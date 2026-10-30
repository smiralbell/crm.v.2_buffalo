import { UnauthorizedError, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { checkReadOnly, describeBlocked, type McpToolInfo, type ReadOnlyCheck } from './readonly'

/** Cliente MCP remoto (HTTP). Cada operación abre y cierra su propia conexión. */

export type McpTransport = 'auto' | 'http' | 'sse'

export type McpConnection = {
  url: string
  transport: McpTransport
  headers: Record<string, string>
  /** Inicio de sesión OAuth (tokens guardados y refresco). */
  authProvider?: OAuthClientProvider
}

const TIMEOUT_MS = 30_000
const MAX_RESULT_CHARS = 60_000

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what}: el MCP no respondió en ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

/** El servidor pide iniciar sesión (no hay tokens o ya no valen). */
export class McpSignInRequired extends Error {
  constructor() {
    super('Hay que iniciar sesión en este MCP: pulsa Conectar.')
  }
}

async function open(conn: McpConnection): Promise<{ client: Client; transport: 'http' | 'sse' }> {
  const url = new URL(conn.url)
  const requestInit = { headers: conn.headers }
  const attempts: ('http' | 'sse')[] = conn.transport === 'auto' ? ['http', 'sse'] : [conn.transport]
  let lastError: unknown
  for (const kind of attempts) {
    const client = new Client({ name: 'buffalo-crm', version: '1.0.0' })
    try {
      const transport =
        kind === 'http'
          ? new StreamableHTTPClientTransport(url, { requestInit, authProvider: conn.authProvider })
          : new SSEClientTransport(url, {
              requestInit,
              authProvider: conn.authProvider,
              eventSourceInit: {
                fetch: (input, init) =>
                  fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), ...conn.headers } }),
              },
            })
      await withTimeout(client.connect(transport), 'Conectar')
      return { client, transport: kind }
    } catch (e) {
      lastError = e
      await client.close().catch(() => {})
      if (e instanceof UnauthorizedError) throw new McpSignInRequired()
    }
  }
  throw new Error(`No se pudo conectar al MCP: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function listAllTools(client: Client): Promise<McpToolInfo[]> {
  const tools: McpToolInfo[] = []
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const res = await withTimeout(client.listTools(cursor ? { cursor } : {}), 'Listar herramientas')
    for (const t of res.tools) {
      tools.push({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })
    }
    cursor = res.nextCursor
    if (!cursor) break
  }
  return tools
}

export type InspectResult = {
  transport: 'http' | 'sse'
  serverName: string | null
  tools: McpToolInfo[]
  check: ReadOnlyCheck
}

/** Conecta, lista las herramientas y comprueba que todas son de solo lectura. */
export async function inspectMcp(conn: McpConnection): Promise<InspectResult> {
  const { client, transport } = await open(conn)
  try {
    const tools = await listAllTools(client)
    const info = client.getServerVersion()
    return { transport, serverName: info?.name || null, tools, check: checkReadOnly(tools) }
  } finally {
    await client.close().catch(() => {})
  }
}

/**
 * Llama a una herramienta. Antes vuelve a comprobar en vivo que todo el MCP sigue
 * siendo de solo lectura: si el servidor ha añadido herramientas de escritura, no se usa.
 */
export async function callMcpTool(
  conn: McpConnection,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ ok: true; resultado: string; esError: boolean } | { ok: false; error: string; check?: ReadOnlyCheck }> {
  const { client } = await open(conn)
  try {
    const tools = await listAllTools(client)
    const check = checkReadOnly(tools)
    if (!check.ok) return { ok: false, error: describeBlocked(check), check }
    if (!tools.some((t) => t.name === toolName)) {
      return { ok: false, error: `El MCP no tiene la herramienta ${toolName}. Disponibles: ${tools.map((t) => t.name).join(', ')}` }
    }
    const res = await withTimeout(client.callTool({ name: toolName, arguments: args }), toolName)
    return { ok: true, resultado: resultToText(res).slice(0, MAX_RESULT_CHARS), esError: res.isError === true }
  } finally {
    await client.close().catch(() => {})
  }
}

function resultToText(res: { content?: unknown; structuredContent?: unknown; toolResult?: unknown }): string {
  const parts: string[] = []
  const content = Array.isArray(res.content) ? (res.content as Record<string, unknown>[]) : []
  for (const c of content) {
    if (c.type === 'text') parts.push(String(c.text ?? ''))
    else if (c.type === 'resource' && c.resource && typeof c.resource === 'object') {
      const r = c.resource as Record<string, unknown>
      parts.push(typeof r.text === 'string' ? r.text : `[recurso ${String(r.uri ?? '')}]`)
    } else if (c.type === 'resource_link') parts.push(`[enlace ${String(c.uri ?? '')}]`)
    else parts.push(`[${String(c.type)} no mostrable]`)
  }
  if (!parts.length && res.structuredContent) parts.push(JSON.stringify(res.structuredContent))
  if (!parts.length && res.toolResult !== undefined) parts.push(JSON.stringify(res.toolResult))
  return parts.join('\n\n')
}
