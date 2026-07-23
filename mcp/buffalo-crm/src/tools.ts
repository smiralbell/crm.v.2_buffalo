import { z } from 'zod'
import {
  assertIdent,
  quoteIdent,
  query,
  serializeRows,
  withClient,
} from './db'
import {
  confirmStep1Response,
  consumeConfirmToken,
  issueConfirmToken,
} from './confirm'

const DESTRUCTIVE =
  /\b(delete|drop|truncate|alter\s+table|alter\s+schema|create\s+table|create\s+schema|grant|revoke|vacuum|reindex)\b/i

function text(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

function err(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }, null, 2) }],
    isError: true,
  }
}

export const HELP_TEXT = `# MCP Buffalo CRM — guía rápida

Eres un agente con acceso TOTAL al CRM Buffalo vía este MCP (Postgres).

## Capacidades
- Leer schema y datos (list_tables, describe_table, query, search, get_row)
- Escribir (insert_row, update_row, execute_sql)
- Borrar / destruir (delete_rows, execute_destructive) — SIEMPRE doble confirmación

## Doble confirmación (OBLIGATORIA en borrados)
1. Llama con confirm_step=1 → recibes confirm_token + preview. NO se ejecuta nada.
2. Llama OTRA VEZ con confirm_step=2, confirm=true y el mismo confirm_token + mismos parámetros.
Sin el paso 2 no se borra nada. El token caduca en 10 minutos.

## Dominios del CRM (tablas habituales)
- contacts, leads, pipelines / pipeline stages & cards
- proyectos, tickets, checklist
- coldcall campaigns / prospects / calls
- demos, invoices, finances
- crm_users, retencion_agent_configs, retencion_monthly_reports

## Modelo de negocio
ENG1 Marketing → ENG2 Onboarding → ENG3 Proyectos (es_buffalo) → ENG4 Retención (mensualidad)

## Reglas
- Preferir tools de alto nivel (search, get_row, insert/update) antes que SQL crudo.
- Para DELETE/DROP/TRUNCATE usa delete_rows o execute_destructive (doble confirm).
- Nunca inventes IDs: búscalos primero.
- Responde en español.
`

/** Registro de todas las tools en el McpServer. */
export function registerTools(server: {
  tool: (...args: any[]) => unknown
}) {
  server.tool(
    'crm_help',
    'Documentación del MCP y del CRM Buffalo: cómo usar las tools, doble confirmación y tablas clave.',
    {
      topic: z.string().optional().describe('Opcional: tema a resaltar'),
    },
    async () => text({ ok: true, help: HELP_TEXT })
  )

  server.tool(
    'crm_list_tables',
    'Lista tablas (y vistas) del schema public con estimación de filas.',
    {
      include_views: z.boolean().optional().describe('Incluir vistas (default false)'),
    },
    async (args: { include_views?: boolean }) => {
      try {
        const kinds = args.include_views ? `('r','v','m','p')` : `('r','p')`
        const res = await query(
          `
          SELECT n.nspname AS schema, c.relname AS table,
                 CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END AS approx_rows,
                 CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'matview' ELSE c.relkind::text END AS kind
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ${kinds}
            AND n.nspname NOT IN ('pg_catalog','information_schema')
          ORDER BY n.nspname, c.relname
          `
        )
        return text({ ok: true, tables: serializeRows(res.rows), count: res.rowCount })
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Error listando tablas')
      }
    }
  )

  server.tool(
    'crm_describe_table',
    'Describe columnas, tipos y nullability de una tabla.',
    {
      table: z.string().describe('Nombre de tabla'),
      schema: z.string().optional().describe('Schema (default public)'),
    },
    async (args: { table: string; schema?: string }) => {
      try {
        const schema = assertIdent(args.schema || 'public', 'schema')
        const table = assertIdent(args.table, 'table')
        const res = await query(
          `
          SELECT column_name, data_type, udt_name, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position
          `,
          [schema, table]
        )
        if (!res.rows.length) return err(`Tabla no encontrada: ${schema}.${table}`)
        return text({ ok: true, schema, table, columns: serializeRows(res.rows) })
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Error describe')
      }
    }
  )

  server.tool(
    'crm_query',
    'Ejecuta un SELECT / WITH…SELECT de solo lectura. Limit por defecto 100 (máx 500).',
    {
      sql: z.string().describe('Consulta SELECT o WITH…SELECT'),
      limit: z.number().int().min(1).max(500).optional(),
    },
    async (args: { sql: string; limit?: number }) => {
      try {
        const cleaned = args.sql
          .replace(/--[^\n]*/g, ' ')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .trim()
          .replace(/;+\s*$/, '')
        if (!/^(with|select)\b/i.test(cleaned)) {
          return err('crm_query solo admite SELECT o WITH…SELECT. Para escritura usa crm_execute_sql / crm_insert_row / crm_update_row. Para borrar: crm_delete_rows.')
        }
        if (DESTRUCTIVE.test(cleaned)) {
          return err('La consulta contiene operaciones destructivas. Usa crm_delete_rows o crm_execute_destructive.')
        }
        const limit = Math.min(Math.max(args.limit ?? 100, 1), 500)
        const wrapped = `SELECT * FROM (${cleaned}) AS _mcp_q LIMIT ${limit}`
        const res = await query(wrapped)
        return text({
          ok: true,
          rowCount: res.rowCount,
          fields: res.fields,
          rows: serializeRows(res.rows),
          truncated_hint: res.rowCount >= limit ? `Limit ${limit} alcanzado` : null,
        })
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Error en query')
      }
    }
  )

  server.tool(
    'crm_search',
    'Búsqueda unificada en contacts, leads, proyectos y tickets.',
    {
      q: z.string().min(2).describe('Texto a buscar'),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async (args: { q: string; limit?: number }) => {
      try {
        const limit = Math.min(args.limit ?? 10, 50)
        const term = `%${args.q.trim()}%`
        const [contacts, leads, proyectos, tickets] = await Promise.all([
          query(
            `SELECT id, nombre, email, telefono, empresa FROM contacts
             WHERE nombre ILIKE $1 OR email ILIKE $1 OR telefono ILIKE $1 OR empresa ILIKE $1
             ORDER BY updated_at DESC NULLS LAST LIMIT $2`,
            [term, limit]
          ),
          query(
            `SELECT l.id, c.nombre, c.empresa, c.email, l.estado, l.valor::float8 AS valor
             FROM leads l INNER JOIN contacts c ON c.id = l.contact_id
             WHERE c.nombre ILIKE $1 OR c.empresa ILIKE $1 OR c.email ILIKE $1
                OR COALESCE(l.notas,'') ILIKE $1 OR COALESCE(l.estado,'') ILIKE $1
             ORDER BY l.updated_at DESC NULLS LAST LIMIT $2`,
            [term, limit]
          ),
          query(
            `SELECT id::text, name, status, service_type, es_buffalo,
                    monthly_fee_eur::float8 AS monthly_fee_eur, lead_id
             FROM proyectos
             WHERE name ILIKE $1 OR service_type ILIKE $1 OR COALESCE(status,'') ILIKE $1
             ORDER BY updated_at DESC NULLS LAST LIMIT $2`,
            [term, limit]
          ),
          query(
            `SELECT t.id::text, t.title, t.status, t.priority, p.name AS project_name
             FROM tickets t LEFT JOIN proyectos p ON p.id = t.project_id
             WHERE t.title ILIKE $1 OR COALESCE(t.description,'') ILIKE $1
             ORDER BY t.updated_at DESC NULLS LAST LIMIT $2`,
            [term, limit]
          ),
        ])
        return text({
          ok: true,
          q: args.q,
          contacts: serializeRows(contacts.rows),
          leads: serializeRows(leads.rows),
          proyectos: serializeRows(proyectos.rows),
          tickets: serializeRows(tickets.rows),
        })
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Error search')
      }
    }
  )

  server.tool(
    'crm_get_row',
    'Obtiene una fila por tabla + id (PK numérica o UUID en columna id).',
    {
      table: z.string(),
      id: z.union([z.string(), z.number()]),
      schema: z.string().optional(),
      id_column: z.string().optional().describe('Columna PK (default id)'),
    },
    async (args: { table: string; id: string | number; schema?: string; id_column?: string }) => {
      try {
        const schema = assertIdent(args.schema || 'public', 'schema')
        const table = assertIdent(args.table, 'table')
        const idCol = assertIdent(args.id_column || 'id', 'id_column')
        const res = await query(
          `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${quoteIdent(idCol)} = $1 LIMIT 1`,
          [args.id]
        )
        if (!res.rows.length) return err('Fila no encontrada')
        return text({ ok: true, row: serializeRows(res.rows)[0] })
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Error get_row')
      }
    }
  )

  server.tool(
    'crm_insert_row',
    'Inserta una fila en una tabla. data = objeto columna→valor. Devuelve la fila insertada si RETURNING es posible.',
    {
      table: z.string(),
      data: z.record(z.unknown()).describe('Columnas y valores'),
      schema: z.string().optional(),
      returning: z.boolean().optional().describe('Default true'),
    },
    async (args: {
      table: string
      data: Record<string, unknown>
      schema?: string
      returning?: boolean
    }) => {
      try {
        const schema = assertIdent(args.schema || 'public', 'schema')
        const table = assertIdent(args.table, 'table')
        const keys = Object.keys(args.data || {})
        if (!keys.length) return err('data vacío')
        for (const k of keys) assertIdent(k, 'columna')
        const cols = keys.map(quoteIdent).join(', ')
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
        const values = keys.map((k) => args.data[k])
        const ret = args.returning === false ? '' : ' RETURNING *'
        const sql = `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${cols}) VALUES (${placeholders})${ret}`
        const res = await query(sql, values)
        return text({
          ok: true,
          inserted: args.returning === false ? { rowCount: res.rowCount } : serializeRows(res.rows)[0],
        })
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Error insert')
      }
    }
  )

  server.tool(
    'crm_update_row',
    'Actualiza filas por id o por where SQL parametrizado. data = columnas a setear.',
    {
      table: z.string(),
      data: z.record(z.unknown()),
      id: z.union([z.string(), z.number()]).optional().describe('PK id'),
      id_column: z.string().optional(),
      where_sql: z
        .string()
        .optional()
        .describe('Fragmento WHERE sin la palabra WHERE, con $n empezando en $1 tras los SET'),
      where_params: z.array(z.unknown()).optional(),
      schema: z.string().optional(),
      returning: z.boolean().optional(),
    },
    async (args: {
      table: string
      data: Record<string, unknown>
      id?: string | number
      id_column?: string
      where_sql?: string
      where_params?: unknown[]
      schema?: string
      returning?: boolean
    }) => {
      try {
        const schema = assertIdent(args.schema || 'public', 'schema')
        const table = assertIdent(args.table, 'table')
        const keys = Object.keys(args.data || {})
        if (!keys.length) return err('data vacío')
        for (const k of keys) assertIdent(k, 'columna')

        const setParts = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`)
        const values: unknown[] = keys.map((k) => args.data[k])
        let where: string
        if (args.id != null) {
          const idCol = assertIdent(args.id_column || 'id', 'id_column')
          values.push(args.id)
          where = `${quoteIdent(idCol)} = $${values.length}`
        } else if (args.where_sql) {
          // Reindex where params after SET params
          const base = keys.length
          const wp = args.where_params || []
          let rewritten = args.where_sql
          // Replace $1, $2... in where with $base+1...
          rewritten = rewritten.replace(/\$(\d+)/g, (_, n) => `$${base + Number(n)}`)
          values.push(...wp)
          where = rewritten
        } else {
          return err('Indica id o where_sql')
        }

        const ret = args.returning === false ? '' : ' RETURNING *'
        const sql = `UPDATE ${quoteIdent(schema)}.${quoteIdent(table)} SET ${setParts.join(', ')} WHERE ${where}${ret}`
        const res = await query(sql, values)
        return text({
          ok: true,
          rowCount: res.rowCount,
          rows: args.returning === false ? undefined : serializeRows(res.rows),
        })
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Error update')
      }
    }
  )

  server.tool(
    'crm_execute_sql',
    'Ejecuta SQL de escritura no destructiva (INSERT/UPDATE). Prohibido DELETE/DROP/TRUNCATE aquí.',
    {
      sql: z.string(),
      params: z.array(z.unknown()).optional(),
    },
    async (args: { sql: string; params?: unknown[] }) => {
      try {
        const cleaned = args.sql.trim()
        if (/\b(delete|drop|truncate)\b/i.test(cleaned)) {
          return err('Para DELETE/DROP/TRUNCATE usa crm_delete_rows o crm_execute_destructive (doble confirmación).')
        }
        if (/^(select|with)\b/i.test(cleaned)) {
          return err('Para SELECT usa crm_query.')
        }
        const res = await query(cleaned, args.params || [])
        return text({
          ok: true,
          rowCount: res.rowCount,
          rows: serializeRows(res.rows).slice(0, 50),
          fields: res.fields,
        })
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Error execute_sql')
      }
    }
  )

  // ——— DELETE con DOBLE CONFIRMACIÓN ———
  server.tool(
    'crm_delete_rows',
    'BORRA filas. REQUIERE DOBLE CONFIRMACIÓN: paso 1 (preview+token) y paso 2 (confirm_token + confirm=true).',
    {
      table: z.string(),
      id: z.union([z.string(), z.number()]).optional(),
      id_column: z.string().optional(),
      where_sql: z.string().optional().describe('WHERE sin la palabra WHERE'),
      where_params: z.array(z.unknown()).optional(),
      schema: z.string().optional(),
      confirm_step: z
        .union([z.literal(1), z.literal(2)])
        .describe('1 = pedir token/preview; 2 = ejecutar con token'),
      confirm_token: z.string().optional(),
      confirm: z.boolean().optional().describe('Obligatorio true en paso 2'),
      limit: z.number().int().min(1).max(1000).optional().describe('Tope de filas a borrar (default 50)'),
    },
    async (args: {
      table: string
      id?: string | number
      id_column?: string
      where_sql?: string
      where_params?: unknown[]
      schema?: string
      confirm_step: 1 | 2
      confirm_token?: string
      confirm?: boolean
      limit?: number
    }) => {
      try {
        const schema = assertIdent(args.schema || 'public', 'schema')
        const table = assertIdent(args.table, 'table')
        const limit = Math.min(args.limit ?? 50, 1000)

        let where: string
        const params: unknown[] = []
        if (args.id != null) {
          const idCol = assertIdent(args.id_column || 'id', 'id_column')
          params.push(args.id)
          where = `${quoteIdent(idCol)} = $1`
        } else if (args.where_sql) {
          where = args.where_sql
          params.push(...(args.where_params || []))
        } else {
          return err('Indica id o where_sql (nunca borramos la tabla entera sin WHERE)')
        }

        const payload = {
          schema,
          table,
          where,
          params,
          limit,
        }

        // Preview rows
        const previewSql = `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${where} LIMIT ${limit}`
        const preview = await query(previewSql, params)
        if (!preview.rows.length) {
          return text({ ok: true, message: 'Nada que borrar (0 filas coinciden)', preview: [] })
        }

        if (args.confirm_step === 1) {
          const pending = issueConfirmToken('crm_delete_rows', payload, {
            schema,
            table,
            where,
            params,
            match_count: preview.rowCount,
            sample_rows: serializeRows(preview.rows).slice(0, 10),
          })
          return text(confirmStep1Response(pending))
        }

        if (args.confirm_step !== 2) {
          return err('confirm_step debe ser 1 o 2')
        }

        const problem = consumeConfirmToken({
          action: 'crm_delete_rows',
          token: args.confirm_token || '',
          payload,
          confirm: args.confirm === true,
        })
        if (problem) return err(problem)

        // Ejecuta en transacción: cuenta filas y aborta si supera limit
        const res = await withClient(async (client) => {
          await client.query('BEGIN')
          try {
            const countRes = await client.query(
              `SELECT COUNT(*)::int AS n FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${where}`,
              params
            )
            const n = Number(countRes.rows[0]?.n ?? 0)
            if (n > limit) {
              await client.query('ROLLBACK')
              throw new Error(
                `Abortado: el filtro afectaría ${n} filas (> limit ${limit}). Acota where_sql o sube limit.`
              )
            }
            const r = await client.query(
              `DELETE FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${where} RETURNING *`,
              params
            )
            await client.query('COMMIT')
            return {
              rows: r.rows as Record<string, unknown>[],
              rowCount: r.rowCount ?? r.rows.length,
              fields: r.fields.map((f) => f.name),
            }
          } catch (e) {
            await client.query('ROLLBACK').catch(() => {})
            throw e
          }
        })

        return text({
          ok: true,
          deleted: res.rowCount,
          rows: serializeRows(res.rows).slice(0, 20),
          message: `Eliminadas ${res.rowCount} fila(s) tras doble confirmación.`,
        })
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Error delete')
      }
    }
  )

  server.tool(
    'crm_execute_destructive',
    'Ejecuta SQL destructivo (DELETE/DROP/TRUNCATE/ALTER…). REQUIERE DOBLE CONFIRMACIÓN (confirm_step 1→2). Úsalo solo cuando crm_delete_rows no basta.',
    {
      sql: z.string(),
      params: z.array(z.unknown()).optional(),
      confirm_step: z.union([z.literal(1), z.literal(2)]),
      confirm_token: z.string().optional(),
      confirm: z.boolean().optional(),
      acknowledge_irreversible: z
        .boolean()
        .optional()
        .describe('En paso 2 debe ser true: reconoces que es irreversible'),
    },
    async (args: {
      sql: string
      params?: unknown[]
      confirm_step: 1 | 2
      confirm_token?: string
      confirm?: boolean
      acknowledge_irreversible?: boolean
    }) => {
      try {
        const sql = args.sql.trim()
        if (!DESTRUCTIVE.test(sql) && !/\bdelete\b/i.test(sql)) {
          return err('Esta tool es solo para SQL destructivo. Usa crm_execute_sql o crm_query.')
        }
        const payload = { sql, params: args.params || [] }

        if (args.confirm_step === 1) {
          const pending = issueConfirmToken('crm_execute_destructive', payload, {
            sql,
            params: args.params || [],
            warning: 'Operación IRREVERSIBLE. Revisa el SQL con cuidado.',
          })
          return text(confirmStep1Response(pending))
        }

        const problem = consumeConfirmToken({
          action: 'crm_execute_destructive',
          token: args.confirm_token || '',
          payload,
          confirm: args.confirm === true,
        })
        if (problem) return err(problem)
        if (args.acknowledge_irreversible !== true) {
          return err('En paso 2 debes pasar acknowledge_irreversible=true')
        }

        const res = await query(sql, args.params || [])
        return text({
          ok: true,
          rowCount: res.rowCount,
          rows: serializeRows(res.rows).slice(0, 30),
          message: 'SQL destructivo ejecutado tras doble confirmación.',
        })
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Error destructive')
      }
    }
  )
}
