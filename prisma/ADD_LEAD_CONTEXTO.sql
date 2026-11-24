-- Contexto libre por persona (lead), editable a mano y pasable a la IA.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contexto TEXT;
