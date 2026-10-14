/**
 * Migraciones versionadas: db/migrations/NNNN_nombre.sql se aplican una vez, en orden,
 * y quedan registradas en schema_migrations. Se ejecutan al arrancar el contenedor
 * (scripts/migrate.ts), al arrancar el worker y, como red de seguridad, la primera vez
 * que el CRM atiende /api/auth/me.
 *
 * Reglas para escribir una migración:
 * - No se edita una migración ya aplicada: se crea otra nueva.
 * - Mejor idempotente (IF NOT EXISTS), por si alguna tabla ya se creó a mano.
 * - Cada fichero corre en su propia transacción.
 */
import { createHash } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import path from 'path'
import type { Pool } from 'pg'
import { getPool } from '@/lib/db'

const LOCK_KEY = 4_812_022 // pg_advisory_lock: evita que web y worker migren a la vez

export type MigrationFile = { id: string; file: string; sql: string; checksum: string }
export type AppliedMigration = { id: string; checksum: string; applied_at: Date }
export type MigrationReport = {
  applied: string[]
  pending: string[]
  changedAfterApply: string[]
}

export function migrationsDir(): string {
  return process.env.MIGRATIONS_DIR
    ? path.resolve(process.env.MIGRATIONS_DIR)
    : path.join(process.cwd(), 'db', 'migrations')
}

export async function readMigrationFiles(dir = migrationsDir()): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((n) => /^\d{4}_[\w-]+\.sql$/.test(n)).sort()
  return Promise.all(
    names.map(async (file) => {
      const sql = await readFile(path.join(dir, file), 'utf8')
      return {
        id: file.replace(/\.sql$/, ''),
        file,
        sql,
        checksum: createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16),
      }
    })
  )
}

async function ensureControlTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

export async function listAppliedMigrations(pool: Pool = getPool()): Promise<AppliedMigration[]> {
  await ensureControlTable(pool)
  const { rows } = await pool.query<AppliedMigration>(
    `SELECT id, checksum, applied_at FROM schema_migrations ORDER BY id`
  )
  return rows
}

export async function migrationStatus(pool: Pool = getPool()): Promise<MigrationReport & { files: number }> {
  const files = await readMigrationFiles()
  const applied = await listAppliedMigrations(pool)
  const byId = new Map(applied.map((a) => [a.id, a]))
  return {
    files: files.length,
    applied: applied.map((a) => a.id),
    pending: files.filter((f) => !byId.has(f.id)).map((f) => f.id),
    changedAfterApply: files
      .filter((f) => byId.has(f.id) && byId.get(f.id)!.checksum !== f.checksum)
      .map((f) => f.id),
  }
}

export async function runMigrations(
  opts: { pool?: Pool; log?: (msg: string) => void } = {}
): Promise<MigrationReport> {
  const pool = opts.pool ?? getPool()
  const log = opts.log ?? ((m: string) => console.info(`[migrate] ${m}`))
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
    await ensureControlTable(pool)
    const files = await readMigrationFiles()
    const { rows } = await client.query<{ id: string; checksum: string }>(
      'SELECT id, checksum FROM schema_migrations'
    )
    const done = new Map(rows.map((r) => [r.id, r.checksum]))
    const applied: string[] = []
    const changedAfterApply: string[] = []

    for (const m of files) {
      if (done.has(m.id)) {
        if (done.get(m.id) !== m.checksum) changedAfterApply.push(m.id)
        continue
      }
      log(`aplicando ${m.file}`)
      try {
        await client.query('BEGIN')
        await client.query(m.sql)
        await client.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [m.id, m.checksum])
        await client.query('COMMIT')
        applied.push(m.id)
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined)
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`Migración ${m.file} falló: ${msg}`)
      }
    }
    if (changedAfterApply.length) {
      log(`aviso: ficheros modificados después de aplicarse (no se reaplican): ${changedAfterApply.join(', ')}`)
    }
    log(applied.length ? `${applied.length} migración(es) aplicada(s)` : 'base de datos al día')
    return { applied, pending: [], changedAfterApply }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined)
    client.release()
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __buffaloMigrationsPromise: Promise<boolean> | undefined
  // eslint-disable-next-line no-var
  var __buffaloMigrationsFailedAt: number | undefined
}

const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000

/** Una sola vez por proceso. Devuelve false si no se pudo migrar (el CRM sigue funcionando). */
export function ensureMigrations(): Promise<boolean> {
  const failedAt = globalThis.__buffaloMigrationsFailedAt
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_FAILURE_MS) return Promise.resolve(false)
  if (!globalThis.__buffaloMigrationsPromise) {
    globalThis.__buffaloMigrationsPromise = runMigrations()
      .then(() => true)
      .catch((e) => {
        console.error('[migrate]', e instanceof Error ? e.message : e)
        globalThis.__buffaloMigrationsPromise = undefined
        globalThis.__buffaloMigrationsFailedAt = Date.now()
        return false
      })
  }
  return globalThis.__buffaloMigrationsPromise
}
