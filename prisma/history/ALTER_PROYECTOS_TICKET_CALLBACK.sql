-- Callback por proyecto para enviar respuestas de tickets al dashboard del cliente

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS ticket_callback_url   TEXT,
  ADD COLUMN IF NOT EXISTS ticket_callback_token TEXT;

COMMENT ON COLUMN proyectos.ticket_callback_url IS
  'URL del webhook del cliente donde Buffalo envía actualizaciones de tickets';

COMMENT ON COLUMN proyectos.ticket_callback_token IS
  'Bearer token que Buffalo usa al llamar al callback del cliente';
