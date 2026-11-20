-- Preferencias de cada persona para su agente de WhatsApp / Telegram
-- («sé más breve», «háblame en este formato»). Las edita ella misma desde el chat.
-- owner_key: 'user:<id de crm_users>' (equipo) o 'chat:<chat_id>' (socios).
-- Idempotente: el CRM también lo crea solo al arrancar (ensureTelegramAgentTables).

CREATE TABLE IF NOT EXISTS agent_personal_instructions (
  id          SERIAL PRIMARY KEY,
  owner_key   TEXT NOT NULL,
  texto       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_personal_instructions_owner ON agent_personal_instructions (owner_key, id);
CREATE INDEX IF NOT EXISTS idx_tg_agent_reminders_chat ON telegram_agent_reminders (chat_id, activo);
