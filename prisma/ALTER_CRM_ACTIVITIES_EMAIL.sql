-- Correos (Gmail) en el historial CRM: kind = 'email', meta.email_message_id = cabecera Message-ID.
-- El mismo correo visto en varios buzones del equipo se guarda una sola vez por contacto.
-- (La app también crea este índice sola al sincronizar; este script es para aplicarlo a mano.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_activities_email_message
  ON crm_activities (contact_id, (meta->>'email_message_id'))
  WHERE kind = 'email';

-- Cursor de sincronización Gmail por conexión Google
ALTER TABLE google_calendar_connections
  ADD COLUMN IF NOT EXISTS gmail_synced_at TIMESTAMPTZ;
