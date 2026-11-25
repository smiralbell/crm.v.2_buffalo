import { z } from 'zod'
import type { ORTool } from '@/lib/openrouter'
import { query } from '@/lib/db'
import { listMcpServers } from '@/lib/retencion/mcp/store'
import { connectionForRow } from '@/lib/retencion/mcp/api'
import { callMcpTool, inspectMcp, type McpConnection } from '@/lib/retencion/mcp/client'
import { ensureIncidentsTable } from '@/lib/retencion/incidents'
import type { FlujoHerramienta } from '@/lib/retencion/flujos/store'

/**
 * Las tres herramientas de un flujo:
 *   1. MCP del proyecto (solo lectura, como ya está validado en Retención)
 *   2. Incidencias del proyecto
 *   3. Tickets del proyecto
 * Cada resultado se recorta para no inflar el contexto del modelo.
 */

const MAX_RESULT_CHARS = 6000
const MAX_ROWS = 100

const incidentesArgs = z.object({
  estado: z.enum(['open', 'solved', 'todas']).optional().default('todas'),
  limite: z.number().int().min(1).max(MAX_ROWS).optional().default(50),
})

const ticketsArgs = z.object({
  estado: z.enum(['open', 'in_progress', 'resolved', 'closed', 'todos']).optional().default('todos'),
  limite: z.number().int().min(1).max(MAX_ROWS).optional().default(50),
})

const mcpLlamarArgs = z.object({
  nombre: z.string().min(1).max(200),
  argumentos: z.record(z.unknown()).optional().default({}),
})

export const FLOW_TOOLS: ORTool[] = [
  {
    name: 'mcp_listar_herramientas',
    description:
      'Lista las herramientas de solo lectura del MCP conectado al proyecto (nombre y descripción). Úsala antes de llamar a una herramienta del MCP.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'mcp_llamar_herramienta',
    description:
      'Ejecuta una herramienta del MCP del proyecto por su nombre y devuelve su resultado. Solo lectura.',
    parameters: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre exacto de la herramienta del MCP' },
        argumentos: { type: 'object', description: 'Argumentos que pide la herramienta' },
      },
      required: ['nombre'],
      additionalProperties: false,
    },
  },
  {
    name: 'incidencias_listar',
    description:
      'Incidencias de producción del proyecto: error, estado, número de ocurrencias y fechas. Devuelve también recuentos por estado.',
    parameters: {
      type: 'object',
      properties: {
        estado: { type: 'string', enum: ['open', 'solved', 'todas'] },
        limite: { type: 'integer', minimum: 1, maximum: MAX_ROWS },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'tickets_listar',
    description:
      'Tickets de cliente del proyecto: título, estado, prioridad y fechas. Devuelve también recuentos por estado.',
    parameters: {
      type: 'object',
      properties: {
        estado: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed', 'todos'] },
        limite: { type: 'integer', minimum: 1, maximum: MAX_ROWS },
      },
      additionalProperties: false,
    },
  },
]

/** A qué herramienta del flujo pertenece cada función que ve el modelo. */
export const TOOL_GROUP: Record<string, FlujoHerramienta> = {
  mcp_listar_herramientas: 'mcp',
  mcp_llamar_herramienta: 'mcp',
  incidencias_listar: 'incidencias',
  tickets_listar: 'tickets',
}

/** Funciones que ve el modelo según las herramientas activadas en el flujo. */
export function toolsForGroups(groups: readonly FlujoHerramienta[]): ORTool[] {
  return FLOW_TOOLS.filter((t) => groups.includes(TOOL_GROUP[t.name]))
}

export type ToolOutcome = { ok: boolean; result: unknown; preview: string }

function clip(value: unknown): { text: string; value: unknown } {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null)
  if (text.length <= MAX_RESULT_CHARS) return { text, value }
  return {
    text: text.slice(0, MAX_RESULT_CHARS) + `… [recortado: ${text.length} caracteres]`,
    value: text.slice(0, MAX_RESULT_CHARS),
  }
}

/** Primer MCP conectado del proyecto. */
async function projectMcpConnection(proyectoId: string): Promise<McpConnection> {
  const rows = await listMcpServers(proyectoId)
  const row = rows.find((r) => r.estado === 'conectado') ?? null
  if (!row) throw new Error('El proyecto no tiene un MCP conectado')
  return connectionForRow(row)
}

async function incidentesListar(proyectoId: string, rawArgs: unknown): Promise<unknown> {
  const args = incidentesArgs.parse(rawArgs ?? {})
  await ensureIncidentsTable()
  const filter = args.estado === 'todas' ? '' : 'AND status = $2'
  const params: unknown[] = [proyectoId, ...(args.estado === 'todas' ? [] : [args.estado])]
  const [rows, counts] = await Promise.all([
    query<{ id: string; error_text: string; status: string; occurrences: number; created_at: Date; last_seen_at: Date }>(
      `SELECT id::text, error_text, status, occurrences, created_at, last_seen_at
         FROM retencion_incidents
        WHERE proyecto_id = $1::uuid ${filter}
        ORDER BY last_seen_at DESC LIMIT ${args.limite}`,
      params
    ),
    query<{ status: string; n: number; ocurrencias: number }>(
      `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(occurrences), 0)::int AS ocurrencias
         FROM retencion_incidents WHERE proyecto_id = $1::uuid GROUP BY status`,
      [proyectoId]
    ),
  ])
  return {
    recuentos: counts.rows,
    total_listadas: rows.rows.length,
    incidencias: rows.rows.map((r) => ({
      id: r.id,
      error: r.error_text,
      estado: r.status,
      ocurrencias: r.occurrences,
      creada: r.created_at,
      ultima_vez: r.last_seen_at,
    })),
  }
}

async function ticketsListar(proyectoId: string, rawArgs: unknown): Promise<unknown> {
  const args = ticketsArgs.parse(rawArgs ?? {})
  const filter = args.estado === 'todos' ? '' : 'AND status = $2'
  const params: unknown[] = [proyectoId, ...(args.estado === 'todos' ? [] : [args.estado])]
  const [rows, counts] = await Promise.all([
    query<{ id: string; title: string; status: string; priority: string; created_at: Date; updated_at: Date }>(
      `SELECT id::text, title, status, priority, created_at, updated_at
         FROM tickets WHERE project_id = $1::uuid ${filter}
        ORDER BY created_at DESC LIMIT ${args.limite}`,
      params
    ),
    query<{ status: string; n: number }>(
      `SELECT status, COUNT(*)::int AS n FROM tickets WHERE project_id = $1::uuid GROUP BY status`,
      [proyectoId]
    ),
  ])
  return {
    recuentos: counts.rows,
    total_listados: rows.rows.length,
    tickets: rows.rows.map((r) => ({
      id: r.id,
      titulo: r.title,
      estado: r.status,
      prioridad: r.priority,
      creado: r.created_at,
      actualizado: r.updated_at,
    })),
  }
}

/** Ejecuta una herramienta del flujo. Los errores vuelven al modelo como resultado, no rompen el flujo. */
export async function executeFlowTool(
  proyectoId: string,
  name: string,
  rawArgs: unknown,
  allowed: readonly FlujoHerramienta[] = ['mcp', 'incidencias', 'tickets']
): Promise<ToolOutcome> {
  try {
    const group = TOOL_GROUP[name]
    if (group && !allowed.includes(group)) throw new Error(`La herramienta ${group} está desactivada en este flujo`)
    let result: unknown
    if (name === 'mcp_listar_herramientas') {
      const conn = await projectMcpConnection(proyectoId)
      const info = await inspectMcp(conn)
      if (!info.check.ok) throw new Error('El MCP no es de solo lectura: no se usa')
      result = info.tools.map((t) => ({ nombre: t.name, descripcion: t.description ?? '' }))
    } else if (name === 'mcp_llamar_herramienta') {
      const args = mcpLlamarArgs.parse(rawArgs ?? {})
      const conn = await projectMcpConnection(proyectoId)
      const out = await callMcpTool(conn, args.nombre, args.argumentos)
      if (!out.ok) throw new Error(out.error)
      result = out.esError ? { error_del_mcp: out.resultado } : out.resultado
    } else if (name === 'incidencias_listar') {
      result = await incidentesListar(proyectoId, rawArgs)
    } else if (name === 'tickets_listar') {
      result = await ticketsListar(proyectoId, rawArgs)
    } else {
      throw new Error(`Herramienta desconocida: ${name}`)
    }
    const c = clip(result)
    return { ok: true, result: c.value, preview: c.text.slice(0, 300) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, result: { error: msg }, preview: msg.slice(0, 300) }
  }
}
