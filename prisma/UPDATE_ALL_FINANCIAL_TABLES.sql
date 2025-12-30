-- ============================================
-- ACTUALIZAR TODAS LAS TABLAS DE FINANZAS
-- ============================================
-- Ejecuta este script completo para actualizar todas las tablas

-- 1. ACTUALIZAR TABLA EXPENSES (Gastos Variables)
-- Añadir columnas para rango de fechas
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS date_start DATE,
ADD COLUMN IF NOT EXISTS date_end DATE;

-- Migrar datos existentes: si hay fecha, copiarla a date_start y date_end
UPDATE expenses 
SET date_start = date, date_end = date 
WHERE date_start IS NULL AND date IS NOT NULL;

-- Añadir columna para etiquetas (array de texto)
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Crear índices para las nuevas columnas
CREATE INDEX IF NOT EXISTS idx_expenses_date_start ON expenses(date_start);
CREATE INDEX IF NOT EXISTS idx_expenses_date_end ON expenses(date_end);

-- 2. AÑADIR TAGS A FIXED_EXPENSES
ALTER TABLE fixed_expenses 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 3. AÑADIR TAGS A SALARIES
ALTER TABLE salaries 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Verificar que todo esté correcto
SELECT 
    'expenses' as tabla,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'expenses' 
    AND column_name IN ('date_start', 'date_end', 'tags')
UNION ALL
SELECT 
    'fixed_expenses' as tabla,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'fixed_expenses' 
    AND column_name = 'tags'
UNION ALL
SELECT 
    'salaries' as tabla,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'salaries' 
    AND column_name = 'tags';

