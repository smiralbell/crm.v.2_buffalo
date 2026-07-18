-- Timeline del proyecto (Onboarding / Gestión)
-- tiempo_previsto: duración estimada (ej. "4 semanas", "2 meses")
-- fecha_inicio_real: cuándo empezó de verdad
-- fecha_fin_real: cuándo acabó; NULL = aún no ha terminado

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS tiempo_previsto TEXT,
  ADD COLUMN IF NOT EXISTS fecha_inicio_real DATE,
  ADD COLUMN IF NOT EXISTS fecha_fin_real DATE;

-- Si ya había launched_at y no hay inicio real, copiar
UPDATE proyectos
SET fecha_inicio_real = launched_at
WHERE fecha_inicio_real IS NULL
  AND launched_at IS NOT NULL;
