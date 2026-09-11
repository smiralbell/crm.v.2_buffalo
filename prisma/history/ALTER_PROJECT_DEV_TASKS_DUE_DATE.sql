-- Fecha de finalización de tareas de gestión de proyecto
ALTER TABLE project_dev_tasks
  ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE INDEX IF NOT EXISTS idx_project_dev_tasks_due_date
  ON project_dev_tasks (due_date)
  WHERE due_date IS NOT NULL;
