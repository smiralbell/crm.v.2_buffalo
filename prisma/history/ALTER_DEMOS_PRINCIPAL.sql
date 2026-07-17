-- Demo principal Buffalo: captura números no asociados a ninguna demo de cliente.
-- Solo puede existir UNA demo principal de WhatsApp y UNA de voz.
ALTER TABLE demos
  ADD COLUMN IF NOT EXISTS es_principal BOOLEAN NOT NULL DEFAULT FALSE;

DROP INDEX IF EXISTS idx_demos_principal_whatsapp;
DROP INDEX IF EXISTS idx_demos_principal_voz;

CREATE UNIQUE INDEX idx_demos_principal_whatsapp
  ON demos ((1))
  WHERE es_principal AND COALESCE(tipo, 'whatsapp') = 'whatsapp';

CREATE UNIQUE INDEX idx_demos_principal_voz
  ON demos ((1))
  WHERE es_principal AND tipo = 'voz';