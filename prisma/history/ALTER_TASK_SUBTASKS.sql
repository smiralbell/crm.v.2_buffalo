-- Subtareas dentro de una tarea (checklist y tareas de proyecto).
-- Se guardan como lista JSON en la propia tarea: [{ "id": "...", "title": "...", "done": false }]
-- El CRM la crea solo al usarla (ADD COLUMN IF NOT EXISTS); este archivo es de referencia.

ALTER TABLE crm_checklist_items
  ADD COLUMN IF NOT EXISTS subtasks JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE project_dev_tasks
  ADD COLUMN IF NOT EXISTS subtasks JSONB NOT NULL DEFAULT '[]'::jsonb;
