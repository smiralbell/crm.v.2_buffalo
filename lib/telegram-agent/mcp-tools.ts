import { getPool } from '@/lib/db'
import { connectionForRow } from '@/lib/retencion/mcp/api'
import { callMcpTool, McpSignInRequired } from '@/lib/retencion/mcp/client'
import { describeBlocked } from '@/lib/retencion/mcp/readonly'
import { getMcpServer, listMcpServers, patchMcpServer } from '@/lib/retencion/mcp/store'

/**
 * MCP de los proyectos de retención, para consultar los sistemas de los clientes.
 * Solo lectura: callMcpTool vuelve a comprobar todo el servidor antes de cada llamada.
 */

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'function' as const, function: { name, description, parameters: { type: 'object', properties, required } } }
}

export const MCP_TOOLS = [
  tool(
    'mcp_listar',
    'Lista los MCP conectados a los proyectos de retención (los servidores que han hecho los developers para consultar cada proyecto), con sus herramientas y parámetros. Úsalo antes de mcp_usar.',
    { proyecto: { type: 'string', description: 'Nombre o parte del nombre del proyecto/cliente (opcional)' } }
  ),
  tool(
    'mcp_usar',
    'Consulta el sistema de un cliente llamando a una herramienta de su MCP (siempre de solo lectura). Saca mcp_id, herramienta y argumentos de mcp_listar.',
    {
      mcp_id: { type: 'number' },
      herramienta: { type: 'string' },
      argumentos: { type: 'object', description: 'Argumentos según el esquema de la herramienta' },
    },
    ['mcp_id', 'herramienta']
  ),
]

export const MCP_TOOL_NAMES = new Set(MCP_TOOLS.map((t) => t.function.name))

function compactSchema(schema: unknown): unknown {
  const s = (schema || {}) as { properties?: Record<string, Record<string, unknown>>; required?: string[] }
  const props: Record<string, string> = {}
  for (const [k, v] of Object.entries(s.properties || {})) {
    const type = Array.isArray(v.enum) ? `uno de ${v.enum.join('|')}` : String(v.type || 'any')
    props[k] = v.description ? `${type}: ${String(v.description).slice(0, 160)}` : type
  }
  return { parametros: props, obligatorios: s.required || [] }
}

export async function runMcpTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'mcp_listar') {
    const rows = await listMcpServers()
    const ids = Array.from(new Set(rows.map((r) => r.proyecto_id)))
    const names = new Map<string, string>()
    if (ids.length) {
      const { rows: ps } = await getPool().query<{ id: string; name: string }>(
        `SELECT id::text, name FROM proyectos WHERE id = ANY($1::uuid[])`,
        [ids]
      )
      for (const p of ps) names.set(p.id, p.name)
    }
    const filtro = String(args.proyecto || '').trim().toLowerCase()
    const list = rows
      .map((r) => ({ r, proyecto: names.get(r.proyecto_id) || r.proyecto_id }))
      .filter(({ r, proyecto }) => !filtro || proyecto.toLowerCase().includes(filtro) || r.nombre.toLowerCase().includes(filtro))
    if (!list.length) {
      return { ok: true, mcp: [], nota: 'No hay MCP conectados. Se conectan en el CRM: Retención, el proyecto, pestaña MCP.' }
    }
    return {
      ok: true,
      mcp: list.map(({ r, proyecto }) => ({
        mcp_id: r.id,
        proyecto,
        nombre: r.nombre,
        estado: r.estado,
        ...(r.estado === 'pendiente'
          ? { aviso: 'Falta iniciar sesión: un admin tiene que pulsar Conectar en el CRM (Retención, proyecto, MCP).' }
          : r.estado !== 'conectado'
            ? { aviso: r.detalle || 'No se puede usar ahora' }
            : {}),
        herramientas: r.tools.filter((t) => !(r.disabled_tools || []).includes(t.name)).map((t) => ({
          nombre: t.name,
          descripcion: (t.description || '').slice(0, 300),
          ...(compactSchema(t.inputSchema) as object),
        })),
      })),
    }
  }

  if (name === 'mcp_usar') {
    const row = await getMcpServer(Number(args.mcp_id))
    if (!row) return { ok: false, error: 'Ese MCP no existe. Mira mcp_listar.' }
    const herramienta = String(args.herramienta || '')
    const argumentos =
      args.argumentos && typeof args.argumentos === 'object' && !Array.isArray(args.argumentos)
        ? (args.argumentos as Record<string, unknown>)
        : {}
    if ((row.disabled_tools || []).includes(herramienta)) {
      return { ok: false, error: `La herramienta ${herramienta} está desactivada para el agente en el CRM.` }
    }
    if (row.auth_mode === 'oauth' && !row.oauth_tokens_enc) {
      return { ok: false, error: `${row.nombre} no tiene la sesión iniciada. Un admin tiene que pulsar Conectar en el CRM (Retención, proyecto, MCP).` }
    }
    try {
      const res = await callMcpTool(connectionForRow(row), herramienta, argumentos)
      if (!res.ok && res.check) {
        await patchMcpServer(row.id, { estado: 'bloqueado', detalle: describeBlocked(res.check), oauth_tokens: null, checked: true })
        return { ok: false, error: `Bloqueado: ${res.error} No se ha llamado a nada. Avisa a los socios para que lo revisen los developers.` }
      }
      if (!res.ok) return res
      if (row.estado !== 'conectado') await patchMcpServer(row.id, { estado: 'conectado', detalle: null })
      return { ok: !res.esError, mcp: row.nombre, herramienta, resultado: res.resultado }
    } catch (e) {
      if (e instanceof McpSignInRequired) {
        await patchMcpServer(row.id, { estado: 'pendiente', detalle: null, oauth_tokens: null })
        return { ok: false, error: `La sesión de ${row.nombre} ha caducado. Un admin tiene que volver a pulsar Conectar en el CRM.` }
      }
      const msg = e instanceof Error ? e.message : String(e)
      await patchMcpServer(row.id, { estado: 'error', detalle: msg })
      return { ok: false, error: msg }
    }
  }

  return { ok: false, error: `Herramienta desconocida: ${name}` }
}
