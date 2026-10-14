-- Capa IA común: registro de cada llamada a OpenRouter (módulo, modelo, tokens, coste, duración).

CREATE TABLE IF NOT EXISTS ai_calls (
  id                 BIGSERIAL PRIMARY KEY,
  module             TEXT NOT NULL,
  title              TEXT,
  endpoint           TEXT NOT NULL,      -- chat | embeddings | audio | otros
  model              TEXT,
  prompt_tokens      INTEGER,
  completion_tokens  INTEGER,
  cost_usd           NUMERIC(12, 6),
  duration_ms        INTEGER,
  ok                 BOOLEAN NOT NULL,
  status_code        INTEGER,
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_calls_created ON ai_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_calls_module ON ai_calls (module, created_at DESC);
