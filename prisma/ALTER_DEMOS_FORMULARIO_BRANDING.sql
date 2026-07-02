-- Personalización visual del formulario público outbound

ALTER TABLE demos
  ADD COLUMN IF NOT EXISTS formulario_branding JSONB;

COMMENT ON COLUMN demos.formulario_branding IS
  'Branding formulario público: logo_url, color_screen, color_form, color_button, color_input, color_text, font_id';
