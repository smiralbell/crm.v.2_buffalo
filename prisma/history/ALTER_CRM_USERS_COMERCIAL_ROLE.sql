-- Rol comercial: acceso a cold calling + facturas propias (mismo flujo que developers)
ALTER TABLE crm_users DROP CONSTRAINT IF EXISTS crm_users_role_check;
ALTER TABLE crm_users ADD CONSTRAINT crm_users_role_check
  CHECK (role IN ('admin', 'developer', 'comercial'));
