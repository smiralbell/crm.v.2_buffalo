/**
 * Aplica las migraciones pendientes de db/migrations.
 *   npm run db:migrate          → aplica
 *   npm run db:migrate:status   → solo muestra el estado
 */
import 'dotenv/config'
import { closePool, getPool } from '@/lib/db'
import { migrationStatus, runMigrations } from '@/lib/migrations/runner'

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[migrate] DATABASE_URL no configurado')
    process.exitCode = 1
    return
  }
  if (process.argv.includes('--status')) {
    const s = await migrationStatus(getPool())
    console.info(`Ficheros: ${s.files} · aplicadas: ${s.applied.length} · pendientes: ${s.pending.length}`)
    for (const id of s.pending) console.info(`  pendiente  ${id}`)
    for (const id of s.changedAfterApply) console.info(`  modificada ${id} (se aplicó con otro contenido)`)
    return
  }
  await runMigrations()
}

main()
  .catch((e) => {
    console.error('[migrate]', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => closePool())
