-- ============================================
-- SISTEMA DE PIPELINES KANBAN (MVP)
-- ============================================
-- Tablas simples para pipelines tipo GoHighLevel/Holded
-- Solo 2 tablas, sin overengineering

-- Tabla 1: pipelines_kanban
CREATE TABLE IF NOT EXISTS pipelines_kanban (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'contact')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla 2: pipeline_cards
CREATE TABLE IF NOT EXISTS pipeline_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES pipelines_kanban(id) ON DELETE CASCADE,
    entity_id TEXT NOT NULL, -- ID del contacto o cliente (referencia externa) - almacenado como TEXT para compatibilidad
    entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'contact')),
    stage TEXT NOT NULL, -- Nombre de la columna (ej: "Nuevo", "En Proceso", "Cerrado")
    stage_color TEXT DEFAULT '#3B82F6', -- Color de la columna (hex)
    position INTEGER DEFAULT 0, -- Orden dentro de la columna
    tags TEXT[] DEFAULT '{}', -- Array de etiquetas
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pipeline_cards_pipeline_id ON pipeline_cards(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_cards_stage ON pipeline_cards(stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_cards_entity ON pipeline_cards(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_pipeline_cards_deleted_at ON pipeline_cards(deleted_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_cards_position ON pipeline_cards(pipeline_id, stage, position);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_pipeline_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pipeline_cards_updated_at
    BEFORE UPDATE ON pipeline_cards
    FOR EACH ROW
    EXECUTE FUNCTION update_pipeline_cards_updated_at();

