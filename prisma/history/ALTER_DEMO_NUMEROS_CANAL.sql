-- Permite el mismo teléfono en una demo WhatsApp Y una demo de voz (no dos del mismo canal)
-- Ejecutar manualmente en PostgreSQL

ALTER TABLE demo_numeros
  ADD COLUMN IF NOT EXISTS canal VARCHAR(20);

UPDATE demo_numeros n
SET canal = COALESCE(d.tipo, 'whatsapp')
FROM demos d
WHERE n.demo_id = d.id AND (n.canal IS NULL OR n.canal = '');

ALTER TABLE demo_numeros
  ALTER COLUMN canal SET DEFAULT 'whatsapp';

UPDATE demo_numeros SET canal = 'whatsapp' WHERE canal IS NULL;

ALTER TABLE demo_numeros
  ALTER COLUMN canal SET NOT NULL;

ALTER TABLE demo_numeros DROP CONSTRAINT IF EXISTS demo_numeros_canal_check;
ALTER TABLE demo_numeros ADD CONSTRAINT demo_numeros_canal_check
  CHECK (canal IN ('whatsapp', 'voz'));

DROP INDEX IF EXISTS idx_demo_numeros_phone_global;

CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_numeros_phone_canal
  ON demo_numeros (numero_telefono, canal);
