-- Varias personas por tarea de proyecto.
-- La app crea la columna sola la primera vez que se guarda una tarea
-- (lib/gestion-proyecto/task-assignees-db.ts); este archivo es por si se quiere
-- hacer a mano. Es idempotente y no toca los datos que ya hay:
-- `assignee` (texto) se queda como está y las tareas antiguas se casan por nombre.

ALTER TABLE project_dev_tasks
  ADD COLUMN IF NOT EXISTS assignee_user_ids INTEGER[] NOT NULL DEFAULT '{}';

-- Informe (solo lectura): tareas SIN asignar en proyectos con varios developers.
-- Desde el cambio, ningún developer las ve (solo admin y project manager); hay
-- que decidir de quién son y marcarlo en la tarea con «Para quién».
--
-- WITH devs AS (
--   SELECT up.project_id, COUNT(*) AS n, string_agg(u.name, ', ' ORDER BY u.name) AS nombres
--   FROM crm_user_projects up
--   JOIN crm_users u ON u.id = up.user_id
--   WHERE u.active AND u.role NOT IN ('admin', 'project_manager')
--   GROUP BY up.project_id
-- )
-- SELECT p.name AS proyecto, d.nombres AS developers, COUNT(*) AS sin_asignar,
--        COUNT(*) FILTER (WHERE t.status <> 'done') AS sin_asignar_abiertas
-- FROM project_dev_tasks t
-- JOIN proyectos p ON p.id = t.project_id
-- JOIN devs d ON d.project_id = t.project_id
-- WHERE d.n > 1
--   AND COALESCE(TRIM(t.assignee), '') = ''
--   AND COALESCE(cardinality(t.assignee_user_ids), 0) = 0
-- GROUP BY p.name, d.nombres
-- ORDER BY sin_asignar DESC;
