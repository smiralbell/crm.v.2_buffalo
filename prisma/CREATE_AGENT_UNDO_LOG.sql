-- Deshacer lo que hace el agente de WhatsApp / Telegram (borrados confirmados,
-- tareas, avisos, preferencias…). steps: cómo volver atrás, con las filas en to_jsonb.
-- Idempotente: el CRM también lo crea solo (ensureUndoTable en lib/telegram-agent/undo.ts).

CREATE TABLE IF NOT EXISTS agent_undo_log (
  id          SERIAL PRIMARY KEY,
  chat_id     BIGINT NOT NULL,
  label       TEXT NOT NULL,
  steps       JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at   TIMESTAMPTZ,
  result      JSONB
);
CREATE INDEX IF NOT EXISTS idx_agent_undo_log_chat ON agent_undo_log (chat_id, id DESC);
