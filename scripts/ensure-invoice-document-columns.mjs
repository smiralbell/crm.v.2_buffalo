import pg from 'pg'
import { readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.log('[invoices] DATABASE_URL no está definida; se omite la actualización de columnas.')
  process.exit(0)
}

const sqlPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../prisma/history/ALTER_INVOICES_DOCUMENT.sql'
)
const sql = await readFile(sqlPath, 'utf8')
const pool = new pg.Pool({ connectionString: databaseUrl })

try {
  await pool.query(sql)
  console.log('[invoices] Columnas de documento listas.')
} catch (error) {
  if (error && typeof error === 'object' && error.code === '42P01') {
    console.log('[invoices] La tabla invoices todavía no existe; no se cambia nada.')
    process.exit(0)
  }
  console.error('[invoices] No se pudieron preparar las columnas de facturación.')
  console.error(error)
  process.exit(1)
} finally {
  await pool.end()
}
