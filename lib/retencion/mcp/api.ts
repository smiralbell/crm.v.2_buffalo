import { z } from 'zod'
import { describeBlocked, type McpToolInfo, type ReadOnlyCheck } from './readonly'
import { inspectMcp, type McpTransport } from './client'
import { connectionFor, savedConnection, setMcpStatus, toPublic, type McpServerInput, type McpServerRow } from './store'

/** Lo que comparten las rutas de la API de MCP de retención. */

export const mcpInputSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120),
    url: z
      .string()
      .trim()
      .url()
      .refine((u) => u.startsWith('https://'), 'La URL del MCP debe empezar por https://'),
    transport: z.enum(['auto', 'http', 'sse']).default('auto'),
    auth_type: z.enum(['none', 'bearer', 'header']).default('none'),
    auth_header: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{1,80}$/, 'Nombre de cabecera no válido')
      .nullish(),
    auth_secret: z.string().max(4000).optional(),
  })
  .refine((v) => v.auth_type !== 'header' || Boolean(v.auth_header), {
    message: 'Indica el nombre de la cabecera',
    path: ['auth_header'],
  })

export type VerifyOutcome =
  | { ok: true; verified: { serverName: string | null; tools: McpToolInfo[]; transport: McpTransport } }
  | { ok: false; status: number; error: string; bloqueadas?: ReadOnlyCheck['bloqueadas'] }

/** Conecta con los datos del formulario y solo da el visto bueno si todo es de solo lectura. */
export async function verifyNew(input: McpServerInput, savedSecret: string | null): Promise<VerifyOutcome> {
  const secret = input.auth_secret !== undefined ? input.auth_secret.trim() || null : savedSecret
  if (input.auth_type !== 'none' && !secret) {
    return { ok: false, status: 400, error: 'Falta el token o clave de acceso' }
  }
  try {
    const res = await inspectMcp(connectionFor({ ...input, secret }))
    if (!res.check.ok) {
      return { ok: false, status: 400, error: describeBlocked(res.check), bloqueadas: res.check.bloqueadas }
    }
    return { ok: true, verified: { serverName: res.serverName, tools: res.tools, transport: res.transport } }
  } catch (e) {
    return { ok: false, status: 400, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Vuelve a comprobar un MCP guardado y deja su estado al día. */
export async function recheck(row: Parameters<typeof savedConnection>[0]) {
  try {
    const res = await inspectMcp(savedConnection(row))
    const estado: McpServerRow['estado'] = res.check.ok ? 'conectado' : 'bloqueado'
    const updated = await setMcpStatus(row.id, estado, res.check.ok ? null : describeBlocked(res.check), res.tools)
    return updated ? toPublic(updated) : null
  } catch (e) {
    const updated = await setMcpStatus(row.id, 'error', e instanceof Error ? e.message : String(e))
    return updated ? toPublic(updated) : null
  }
}
