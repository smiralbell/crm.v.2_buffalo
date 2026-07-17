-- Contraseña visible solo para administradores (se actualiza al crear o restablecer)

ALTER TABLE crm_users
  ADD COLUMN IF NOT EXISTS admin_password TEXT;
