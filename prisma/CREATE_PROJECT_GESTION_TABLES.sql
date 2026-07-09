-- Gestión del proyecto (Engranaje entre Onboarding y Retención)
-- Onboarding para developers + tareas tipo Jira

CREATE TABLE IF NOT EXISTS project_dev_onboarding (
  project_id UUID PRIMARY KEY REFERENCES proyectos(id) ON DELETE CASCADE,
  summary TEXT,
  client_context TEXT,
  scope_text TEXT,
  stack_text TEXT,
  deliverables TEXT,
  contacts TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_dev_onboarding_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('link', 'file')),
  url TEXT,
  file_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_dev_onboarding_docs_project
  ON project_dev_onboarding_docs(project_id);

CREATE TABLE IF NOT EXISTS project_dev_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  assignee TEXT,
  estimated_hours DECIMAL(6, 2),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_dev_tasks_project_status
  ON project_dev_tasks(project_id, status, position);

CREATE TABLE IF NOT EXISTS project_dev_task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES project_dev_tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_dev_task_attachments_task
  ON project_dev_task_attachments(task_id);
