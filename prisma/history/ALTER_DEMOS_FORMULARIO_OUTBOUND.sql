-- Configuración del formulario outbound por demo de voz

ALTER TABLE demos
  ADD COLUMN IF NOT EXISTS formulario_outbound JSONB;

COMMENT ON COLUMN demos.formulario_outbound IS
  'Campos habilitados/requeridos del formulario outbound (variables Retell)';
