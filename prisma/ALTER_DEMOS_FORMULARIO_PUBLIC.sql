-- Token público y contraseña para el formulario outbound de demos de voz

ALTER TABLE demos
  ADD COLUMN IF NOT EXISTS formulario_public_token VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS formulario_password_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_demos_formulario_token
  ON demos (formulario_public_token)
  WHERE formulario_public_token IS NOT NULL;

COMMENT ON COLUMN demos.formulario_public_token IS
  'Token del enlace público /formulario/{token}';

COMMENT ON COLUMN demos.formulario_password_hash IS
  'Hash scrypt de la contraseña de acceso al formulario público';
