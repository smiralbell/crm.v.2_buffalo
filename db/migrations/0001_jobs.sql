-- Tareas programadas (sync bancaria, Gmail, blog…) con bloqueo entre procesos e historial,
-- y una cola de trabajos con reintentos.

CREATE TABLE IF NOT EXISTS system_jobs (
  name              TEXT PRIMARY KEY,
  last_started_at   TIMESTAMPTZ,
  last_finished_at  TIMESTAMPTZ,
  last_status       TEXT,            -- ok | error | skipped
  last_message      TEXT,
  last_duration_ms  INTEGER,
  runs              INTEGER NOT NULL DEFAULT 0,
  failures          INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  locked_by         TEXT,
  locked_until      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_queue (
  id            BIGSERIAL PRIMARY KEY,
  kind          TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 5,
  run_after     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until  TIMESTAMPTZ,
  dedupe_key    TEXT,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_queue_dedupe ON job_queue (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_queue_due ON job_queue (run_after) WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_job_queue_created ON job_queue (created_at);
