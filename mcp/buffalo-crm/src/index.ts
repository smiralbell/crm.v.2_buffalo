/**
 * MCP Server — Buffalo CRM (stdio)
 *
 * Capacidades: leer / escribir / borrar cualquier dato del Postgres del CRM.
 * Los borrados y SQL destructivo requieren DOBLE CONFIRMACIÓN (paso 1 + paso 2).
 *
 * Arranque (desde la raíz del repo):
 *   npx tsx mcp/buffalo-crm/src/index.ts
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadEnv } from './db'
import { registerTools } from './tools'

async function main() {
  loadEnv()
  if (!process.env.DATABASE_URL) {
    console.error('[buffalo-crm-mcp] DATABASE_URL ausente. Configura el .env del CRM.')
    process.exit(1)
  }

  const server = new McpServer({
    name: 'buffalo-crm',
    version: '1.0.0',
  })

  registerTools(server)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[buffalo-crm-mcp] listo (stdio) — lectura/escritura/borrado con doble confirmación')
}

main().catch((e) => {
  console.error('[buffalo-crm-mcp] fatal:', e)
  process.exit(1)
})
