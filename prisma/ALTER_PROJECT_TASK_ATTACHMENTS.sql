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
