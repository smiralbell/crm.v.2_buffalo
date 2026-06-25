-- Historial de mensajes / respuestas en tickets (chat Buffalo ↔ cliente)

CREATE TABLE IF NOT EXISTS ticket_updates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_name    TEXT,
  message        TEXT NOT NULL,
  status         TEXT,
  is_from_client BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_updates_ticket_id ON ticket_updates(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_updates_created_at ON ticket_updates(created_at);
