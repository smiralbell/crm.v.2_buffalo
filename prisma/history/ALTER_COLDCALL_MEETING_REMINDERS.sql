-- Recordatorios de confirmación (caller) y preparación de demo (admin)
ALTER TABLE coldcall_calls
  ADD COLUMN IF NOT EXISTS reunion_confirm_status TEXT,
  ADD COLUMN IF NOT EXISTS reunion_confirm_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reunion_confirm_by_user_id INTEGER REFERENCES crm_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reunion_confirm_note TEXT,
  ADD COLUMN IF NOT EXISTS demo_prep_status TEXT,
  ADD COLUMN IF NOT EXISTS demo_prep_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_prep_by_user_id INTEGER REFERENCES crm_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coldcall_calls_reunion_confirm
  ON coldcall_calls (reunion_fecha, reunion_confirm_status)
  WHERE resultado = 'reunion_agendada' AND reunion_fecha IS NOT NULL;

COMMENT ON COLUMN coldcall_calls.reunion_confirm_status IS
  'pending|confirmed|rescheduled|cancelled — seguimiento caller 2 días antes';
COMMENT ON COLUMN coldcall_calls.demo_prep_status IS
  'pending|ready|done — preparación demo para admin/closer';
