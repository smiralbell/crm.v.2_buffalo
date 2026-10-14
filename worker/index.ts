/**
 * Worker del CRM: ejecuta las tareas automáticas fuera del proceso web.
 *
 *   npm run worker
 *
 * En EasyPanel: un segundo servicio con la misma imagen y el comando `npm run worker`
 * (mismas variables de entorno que la web). Tareas y bloqueo: lib/jobs/registry.ts.
 */
import 'dotenv/config'
import { startJobsRunner } from '@/lib/jobs/registry'
import { closePool } from '@/lib/db'

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[worker] DATABASE_URL no configurado')
    process.exit(1)
  }
  await startJobsRunner('worker')
  console.info('[worker] en marcha')
}

function shutdown(signal: string) {
  console.info(`[worker] ${signal} recibido, cerrando…`)
  void closePool().finally(() => process.exit(0))
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', (e) => console.error('[worker] promesa sin capturar:', e))

main().catch((e) => {
  console.error('[worker] no arrancó:', e instanceof Error ? e.message : e)
  process.exit(1)
})
