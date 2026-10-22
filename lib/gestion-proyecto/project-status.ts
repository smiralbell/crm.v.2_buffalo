/** Estados de proyecto Buffalo en Gestión. */
export const PROJECT_OPEN_STATUSES = [
  'development',
  'active',
  'paused',
  'done',
] as const

export type ProjectLifecycleStatus =
  | 'development'
  | 'active'
  | 'paused'
  | 'churned'
  | 'done'

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  development: 'En desarrollo',
  active: 'En producción',
  paused: 'Pausado',
  churned: 'Baja',
  done: 'Finalizado',
}

/** Finalizado (cerrado) pero aún no live. */
export function isProjectFinalized(status: string): boolean {
  return status === 'done'
}

/** Live / en producción. */
export function isProjectInProduction(status: string): boolean {
  return status === 'active'
}

/**
 * Asegura que el CHECK de proyectos.status admite 'done'.
 * Seguro llamar varias veces.
 */
export async function ensureProjectStatusDoneAllowed(
  exec: (sql: string) => Promise<unknown>
): Promise<void> {
  await exec(`
    DO $$
    DECLARE
      cname text;
    BEGIN
      SELECT con.conname INTO cname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = 'proyectos'
        AND nsp.nspname = 'public'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%status%'
      LIMIT 1;

      IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE proyectos DROP CONSTRAINT %I', cname);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'proyectos_status_check'
      ) THEN
        ALTER TABLE proyectos
          ADD CONSTRAINT proyectos_status_check
          CHECK (status IN ('development', 'active', 'paused', 'churned', 'done'));
      END IF;
    END $$;
  `)
}
