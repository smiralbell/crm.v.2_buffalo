// Usa el cliente de Prisma sin envolver (getPrismaClient) para no meter pg en el bundle del navegador.
import { getPrismaClient } from '@/lib/prisma'

/**
 * Cambios de esquema que la aplicación necesita en la base de datos.
 * Son idempotentes (IF NOT EXISTS): se ejecutan una vez por proceso, antes de la
 * primera consulta de Prisma, así no hace falta lanzar SQL a mano en cada despliegue.
 *
 * Cuando añadas un campo a prisma/schema.prisma que no exista aún en producción,
 * añade aquí su ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
 */
export const CORE_SCHEMA_STATEMENTS: string[] = [
  // Leads: carpeta de cliente en Drive y documentos subidos.
  `CREATE TABLE IF NOT EXISTS persona_drive_folders (
     lead_id      INTEGER PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
     folder_id    TEXT NOT NULL,
     folder_name  TEXT NOT NULL,
     matched_by   TEXT NOT NULL,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS persona_documents (
     id             SERIAL PRIMARY KEY,
     lead_id        INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
     tipo           TEXT NOT NULL,
     file_name      TEXT NOT NULL,
     drive_file_id  TEXT NOT NULL,
     web_link       TEXT,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_persona_documents_lead ON persona_documents (lead_id, created_at DESC)`,
]

let pending: Promise<void> | null = null

/**
 * Aplica el esquema una vez. Si falla, se reintenta en la siguiente llamada.
 * Un fallo no bloquea la app: las consultas siguen y muestran su propio error.
 */
export function ensureCoreSchema(): Promise<void> {
  if (!pending) {
    pending = (async () => {
      const client = getPrismaClient()
      for (const sql of CORE_SCHEMA_STATEMENTS) {
        await client.$executeRawUnsafe(sql)
      }
    })().catch((e) => {
      pending = null
      console.error('[schema] no se pudo aplicar el esquema automático:', e instanceof Error ? e.message : e)
    })
  }
  return pending
}
