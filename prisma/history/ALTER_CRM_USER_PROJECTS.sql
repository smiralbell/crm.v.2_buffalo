-- Asignación de developers a proyectos (acceso al panel ENG 3 + tickets del proyecto)

CREATE TABLE IF NOT EXISTS crm_user_projects (
  user_id INTEGER NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_user_projects_project ON crm_user_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_crm_user_projects_user ON crm_user_projects(user_id);
