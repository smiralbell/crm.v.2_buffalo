-- Rol "project_manager": acceso a Leads, Pipelines y Marketing, y a
-- Onboarding / Proyectos / Retención solo de los proyectos que admin le asigne
-- (tabla crm_user_projects, la misma que usan los developers).
ALTER TABLE crm_users DROP CONSTRAINT IF EXISTS crm_users_role_check;
ALTER TABLE crm_users
  ADD CONSTRAINT crm_users_role_check
  CHECK (role IN ('admin', 'developer', 'comercial', 'project_manager'));
