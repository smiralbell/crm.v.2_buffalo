-- Personalización de guión y mensajes por comercial
ALTER TABLE crm_users
  ADD COLUMN IF NOT EXISTS coldcall_speaker_name TEXT,
  ADD COLUMN IF NOT EXISTS coldcall_speaker_full_name TEXT,
  ADD COLUMN IF NOT EXISTS coldcall_present_as_ceo BOOLEAN NOT NULL DEFAULT FALSE;
