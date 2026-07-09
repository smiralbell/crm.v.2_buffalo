-- Métricas de dashboard: horas estimadas por tarea y fecha objetivo de fin de desarrollo

ALTER TABLE project_dev_tasks
  ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(6, 2);

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS dev_target_end_date DATE;
