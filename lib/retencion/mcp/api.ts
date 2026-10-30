import { z } from 'zod'
import { describeBlocked } from './readonly'
import { inspectMcp, McpSignInRequired, type McpConnection } from './client'
import { DbOAuthProvider } from './oauth'
import { patchMcpServer, savedConnection, toPublic, type McpServerPublic, type McpServerRow } from './store'

/** Lo que comparten las rutas de la API de conectores MCP de retención. */

const urlSchema = z
  .string()
  .trim()
  .url('URL no válida')
  .refine((u) => u.startsWith('https://'), 'La URL del servidor MCP debe empezar por https://')

export const detectSchema = z.object({ url: urlSchema })

const headerSchema = z.object({
  name: z.string().trim().regex(/^[A-Za-z0-9-]{1,80}$/, 'Nombre de cabecera no válido'),
  value: z.string().min(1, 'Falta el valor de la cabecera').max(4000),
})

export const createSchema = z
  .object({
    nombre: z.string().trim().min(1, 'Ponle un nombre').max(120),
    url: urlSchema,
    transport: z.enum(['auto', 'http', 'sse']).default('auto'),
    /** Como en Claude: iniciar sesión ahora, cuando haga falta, o sin inicio de sesión. */
    sign_in: z.enum(['now', 'later', 'none']),
    oauth_client: z.enum(['published', 'auto', 'custom']).default('published'),
    client_id: z.string().trim().max(500).nullish(),
    client_secret: z.string().trim().max(2000).nullish(),
    headers: z.array(headerSchema).max(20).default([]),
  })
  .refine((v) => v.sign_in === 'none' || v.oauth_client !== 'custom' || Boolean(v.client_id), {
    message: 'Falta el Client ID de tu cliente OAuth',
    path: ['client_id'],
  })

/** Conexión completa de un conector guardado: cabeceras + sesión OAuth si la tiene. */
export function connectionForRow(row: McpServerRow): McpConnection {
  const conn = savedConnection(row)
  if (row.auth_mode === 'oauth') conn.authProvider = new DbOAuthProvider(row)
  return conn
}

/**
 * Comprueba en vivo un conector guardado y deja su estado al día:
 * conectado, bloqueado (no es de solo lectura: se cierra la sesión), pendiente (falta login) o error.
 */
export async function verifyAndStore(row: McpServerRow): Promise<McpServerPublic | null> {
  if (row.auth_mode === 'oauth' && !row.oauth_tokens_enc) {
    const updated = await patchMcpServer(row.id, { estado: 'pendiente', detalle: null })
    return updated ? toPublic(updated) : null
  }
  try {
    const res = await inspectMcp(connectionForRow(row))
    if (!res.check.ok) {
      // No es de solo lectura: no se conecta. Se borra la sesión para que nadie pueda usarlo.
      const updated = await patchMcpServer(row.id, {
        estado: 'bloqueado',
        detalle: describeBlocked(res.check),
        tools: res.tools,
        oauth_tokens: null,
        checked: true,
      })
      return updated ? toPublic(updated) : null
    }
    const updated = await patchMcpServer(row.id, {
      estado: 'conectado',
      detalle: null,
      tools: res.tools,
      server_name: res.serverName,
      transport: res.transport,
      checked: true,
    })
    return updated ? toPublic(updated) : null
  } catch (e) {
    const signIn = e instanceof McpSignInRequired
    const updated = await patchMcpServer(row.id, {
      estado: signIn ? 'pendiente' : 'error',
      detalle: signIn ? null : e instanceof Error ? e.message : String(e),
      ...(signIn ? { oauth_tokens: null } : {}),
      checked: true,
    })
    return updated ? toPublic(updated) : null
  }
}
