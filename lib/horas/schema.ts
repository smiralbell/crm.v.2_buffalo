/**
 * Registro automático de horas.
 *
 * Un trigger en las dos tablas de tareas (sueltas y de proyecto) apunta cada tramo que una
 * tarea pasa en «En curso» y para quién: se abre al entrar y se cierra al salir (a validación,
 * a hecha o de vuelta a pendiente), o si cambia la persona. Así da igual desde dónde se mueva
 * la tarea (tablero, agente de WhatsApp, API…): todo queda registrado.
 *
 * Solo SQL en texto: lo aplica lib/schema/core-schema.ts al arrancar.
 */
export const HOURS_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS task_time_segments (
     id          BIGSERIAL PRIMARY KEY,
     source      TEXT NOT NULL,
     task_id     UUID NOT NULL,
     project_id  UUID,
     user_id     INTEGER,
     person_name TEXT,
     started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     ended_at    TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS idx_task_time_segments_open ON task_time_segments (task_id) WHERE ended_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_task_time_segments_time ON task_time_segments (started_at, ended_at)`,
  `CREATE TABLE IF NOT EXISTS task_hours_confirmed (
     task_id        UUID NOT NULL,
     user_id        INTEGER NOT NULL,
     source         TEXT NOT NULL,
     hours          NUMERIC(6,2) NOT NULL,
     computed_hours NUMERIC(6,2),
     confirmed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     confirmed_by   TEXT,
     PRIMARY KEY (task_id, user_id)
   )`,
  `ALTER TABLE IF EXISTS project_dev_tasks ADD COLUMN IF NOT EXISTS assignee_user_ids INTEGER[] NOT NULL DEFAULT '{}'`,

  // Abre los tramos de una tarea que entra en curso: uno por persona
  `CREATE OR REPLACE FUNCTION buffalo_task_time_open(p_source TEXT, p_task JSONB) RETURNS VOID AS $$
   DECLARE
     ids INTEGER[];
   BEGIN
     IF p_source = 'personal' THEN
       INSERT INTO task_time_segments (source, task_id, user_id)
       VALUES ('personal', (p_task->>'id')::uuid, (p_task->>'user_id')::int);
       RETURN;
     END IF;
     SELECT COALESCE(array_agg(x::int), '{}') INTO ids
       FROM jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(p_task->'assignee_user_ids') = 'array' THEN p_task->'assignee_user_ids' ELSE '[]'::jsonb END
       ) x;
     IF array_length(ids, 1) IS NULL THEN
       INSERT INTO task_time_segments (source, task_id, project_id, person_name)
       VALUES ('project', (p_task->>'id')::uuid, (p_task->>'project_id')::uuid, NULLIF(p_task->>'assignee', ''));
     ELSE
       INSERT INTO task_time_segments (source, task_id, project_id, user_id)
       SELECT 'project', (p_task->>'id')::uuid, (p_task->>'project_id')::uuid, u FROM unnest(ids) u;
     END IF;
   END $$ LANGUAGE plpgsql`,

  `CREATE OR REPLACE FUNCTION buffalo_task_time_log() RETURNS trigger AS $$
   DECLARE
     src TEXT := CASE WHEN TG_TABLE_NAME = 'crm_user_tasks' THEN 'personal' ELSE 'project' END;
     n JSONB;
     o JSONB;
     was_running BOOLEAN := FALSE;
     is_running BOOLEAN;
     people_changed BOOLEAN := FALSE;
   BEGIN
     IF TG_OP = 'DELETE' THEN
       BEGIN
         UPDATE task_time_segments SET ended_at = NOW() WHERE task_id = OLD.id AND ended_at IS NULL;
       EXCEPTION WHEN others THEN
         RAISE WARNING 'registro de horas: %', SQLERRM;
       END;
       RETURN OLD;
     END IF;
     BEGIN
     n := to_jsonb(NEW);
     is_running := n->>'status' = 'in_progress';
     IF TG_OP = 'UPDATE' THEN
       o := to_jsonb(OLD);
       was_running := o->>'status' = 'in_progress';
       people_changed := (o->'user_id') IS DISTINCT FROM (n->'user_id')
         OR (o->'assignee_user_ids') IS DISTINCT FROM (n->'assignee_user_ids')
         OR (o->'assignee') IS DISTINCT FROM (n->'assignee');
     END IF;
     IF was_running AND (NOT is_running OR people_changed) THEN
       UPDATE task_time_segments SET ended_at = NOW() WHERE task_id = NEW.id AND ended_at IS NULL;
     END IF;
     IF is_running AND (NOT was_running OR people_changed) THEN
       PERFORM buffalo_task_time_open(src, n);
     END IF;
     EXCEPTION WHEN others THEN
       RAISE WARNING 'registro de horas: %', SQLERRM;
     END;
     RETURN NEW;
   END $$ LANGUAGE plpgsql`,

  // Triggers (si las tablas existen) y tramos para lo que ya estaba en curso al instalarlo:
  // cuentan desde que entró en curso, pero como mucho desde el lunes de esta semana.
  `DO $$
   DECLARE
     tbl TEXT;
   BEGIN
     FOREACH tbl IN ARRAY ARRAY['crm_user_tasks', 'project_dev_tasks'] LOOP
       IF to_regclass(tbl) IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM pg_trigger WHERE tgname = 'trg_task_time_log' AND tgrelid = to_regclass(tbl)
       ) THEN
         EXECUTE format(
           'CREATE TRIGGER trg_task_time_log AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION buffalo_task_time_log()',
           tbl
         );
       END IF;
     END LOOP;
   EXCEPTION WHEN others THEN
     RAISE WARNING 'registro de horas (trigger): %', SQLERRM;
   END $$`,

  `DO $$
   BEGIN
     IF to_regclass('crm_user_tasks') IS NOT NULL THEN
       INSERT INTO task_time_segments (source, task_id, user_id, started_at)
       SELECT 'personal', t.id, t.user_id, GREATEST(t.status_changed_at, date_trunc('week', NOW()))
         FROM crm_user_tasks t
        WHERE t.status = 'in_progress'
          AND NOT EXISTS (SELECT 1 FROM task_time_segments s WHERE s.task_id = t.id);
     END IF;
     IF to_regclass('project_dev_tasks') IS NOT NULL THEN
       INSERT INTO task_time_segments (source, task_id, project_id, user_id, person_name, started_at)
       SELECT 'project', t.id, t.project_id, u.uid,
              CASE WHEN u.uid IS NULL THEN NULLIF(t.assignee, '') END,
              GREATEST(t.status_changed_at, date_trunc('week', NOW()))
         FROM project_dev_tasks t
         LEFT JOIN LATERAL (
           SELECT unnest(CASE WHEN cardinality(t.assignee_user_ids) > 0 THEN t.assignee_user_ids ELSE ARRAY[NULL]::int[] END) AS uid
         ) u ON TRUE
        WHERE t.status = 'in_progress'
          AND NOT EXISTS (SELECT 1 FROM task_time_segments s WHERE s.task_id = t.id);
     END IF;
   EXCEPTION WHEN others THEN
     RAISE WARNING 'registro de horas (instalación): %', SQLERRM;
   END $$`,
]
