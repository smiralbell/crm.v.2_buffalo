-- Registra qué usuario realizó cada llamada (para analytics de equipo)
ALTER TABLE coldcall_calls
  ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES crm_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coldcall_calls_created_by
  ON coldcall_calls(created_by_user_id, fecha DESC);
