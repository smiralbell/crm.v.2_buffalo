-- Ejecutar manualmente en PostgreSQL antes de usar demos de voz

ALTER TABLE demos
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS retell_agent_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS retell_llm_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS retell_kb_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS voz_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS direccion VARCHAR(20) DEFAULT 'inbound';

ALTER TABLE demos DROP CONSTRAINT IF EXISTS demos_tipo_check;
ALTER TABLE demos ADD CONSTRAINT demos_tipo_check
  CHECK (tipo IN ('whatsapp', 'voz'));

ALTER TABLE demos DROP CONSTRAINT IF EXISTS demos_direccion_check;
ALTER TABLE demos ADD CONSTRAINT demos_direccion_check
  CHECK (direccion IS NULL OR direccion IN ('inbound', 'outbound', 'ambos'));

CREATE INDEX IF NOT EXISTS idx_demos_tipo ON demos (tipo);
CREATE INDEX IF NOT EXISTS idx_demos_retell_agent ON demos (retell_agent_id) WHERE retell_agent_id IS NOT NULL;
