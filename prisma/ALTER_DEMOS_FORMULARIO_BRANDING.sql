-- Personalización visual del formulario público outbound

ALTER TABLE demos
  ADD COLUMN IF NOT EXISTS formulario_branding JSONB;

COMMENT ON COLUMN demos.formulario_branding IS
  'Logo y colores del formulario público: logo_url, color_primary (fondo), color_text, color_secondary (botón)';
