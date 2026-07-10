-- Usuarios del CRM (developers con acceso limitado)
CREATE TABLE IF NOT EXISTS crm_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'developer' CHECK (role IN ('admin', 'developer', 'comercial')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_users_email ON crm_users(email);
CREATE INDEX IF NOT EXISTS idx_crm_users_role ON crm_users(role);

-- Asignación de tickets a usuario del CRM
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS assignee_user_id INTEGER REFERENCES crm_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_assignee_user ON tickets(assignee_user_id);

-- Asignación de developers a proyectos (acceso al panel Proyectos + tickets del proyecto)
CREATE TABLE IF NOT EXISTS crm_user_projects (
  user_id INTEGER NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_user_projects_project ON crm_user_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_crm_user_projects_user ON crm_user_projects(user_id);
