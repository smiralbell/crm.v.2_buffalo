-- ============================================================
-- BUFFALO AI — ENGRANAJE 5 · RETENCIÓN (schema completo)
-- PostgreSQL 13+
--
-- Uso:
--   • Instalación nueva: ejecutar todo el fichero.
--   • BD ya existente: también es seguro — usa IF NOT EXISTS /
--     ADD COLUMN IF NOT EXISTS para rellenar lo que falte.
-- ============================================================

-- ============================================================
-- TABLA 1: proyectos
-- ============================================================

CREATE TABLE IF NOT EXISTS proyectos (

  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                 UUID NOT NULL,
  name                      TEXT NOT NULL,
  service_type              TEXT NOT NULL CHECK (service_type IN (
                              'voice_agent','text_agent','dashboard_app',
                              'automation','lead_gen','geo_seo'
                            )),
  status                    TEXT NOT NULL DEFAULT 'development' CHECK (status IN (
                              'development','active','paused','churned'
                            )),
  launched_at               DATE,

  -- Add-ons contratados
  addon_outbound            BOOLEAN NOT NULL DEFAULT FALSE,
  addon_crm_integration     BOOLEAN NOT NULL DEFAULT FALSE,
  addon_human_transfer      BOOLEAN NOT NULL DEFAULT FALSE,
  addon_email_summary       BOOLEAN NOT NULL DEFAULT FALSE,
  addon_transcription       BOOLEAN NOT NULL DEFAULT FALSE,
  addon_cloned_voice        BOOLEAN NOT NULL DEFAULT FALSE,
  addon_whatsapp            BOOLEAN NOT NULL DEFAULT FALSE,
  addon_web_widget          BOOLEAN NOT NULL DEFAULT FALSE,
  addon_form_trigger        BOOLEAN NOT NULL DEFAULT FALSE,
  addon_multimodal          BOOLEAN NOT NULL DEFAULT FALSE,
  addon_voice_in_chat       BOOLEAN NOT NULL DEFAULT FALSE,
  dashboard_tier            TEXT CHECK (dashboard_tier IN ('basico','avanzado','completo')),
  languages_count           INTEGER NOT NULL DEFAULT 1,

  -- Datos económicos
  cost_operator_hour_eur    NUMERIC(8,2),
  operators_dedicated       NUMERIC(4,1),
  hours_per_week_before     NUMERIC(6,1),
  setup_fee_eur             NUMERIC(10,2),
  monthly_fee_eur           NUMERIC(8,2),

  -- Retención / mensualidad (Engranaje 3)
  has_mensualidad           BOOLEAN NOT NULL DEFAULT FALSE,
  maint_plan                TEXT,  -- 'connect' | 'cloud' | NULL

  -- Servicios activos (configurador)
  has_voz                   BOOLEAN NOT NULL DEFAULT FALSE,
  has_chat                  BOOLEAN NOT NULL DEFAULT FALSE,
  has_dash                  BOOLEAN NOT NULL DEFAULT FALSE,
  has_pack                  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Configuración técnica
  retell_agent_id           TEXT,
  twilio_number             TEXT,
  whatsapp_number           TEXT,
  webhook_secret            TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

  -- Puente CRM Buffalo
  lead_id                   INTEGER UNIQUE,
  contact_id                INTEGER,
  config_ref                TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columnas añadidas después (seguro si la tabla ya existía sin ellas)
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS has_mensualidad BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS maint_plan          TEXT;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS has_voz             BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS has_chat            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS has_dash            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS has_pack            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS lead_id             INTEGER;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS contact_id          INTEGER;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS config_ref          TEXT;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS addon_crm_integration BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS addon_voice_in_chat   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS languages_count       INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_proyectos_client_id    ON proyectos(client_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_service_type ON proyectos(service_type);
CREATE INDEX IF NOT EXISTS idx_proyectos_status       ON proyectos(status);
CREATE INDEX IF NOT EXISTS idx_proyectos_lead_id      ON proyectos(lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_proyectos_lead_id  ON proyectos(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proyectos_contact_id   ON proyectos(contact_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_mensualidad  ON proyectos(has_mensualidad) WHERE has_mensualidad = true;
CREATE INDEX IF NOT EXISTS idx_proyectos_servicios    ON proyectos(has_voz, has_chat, has_dash);

COMMENT ON COLUMN proyectos.has_mensualidad IS
  'TRUE = cliente con mantenimiento mensual (Engranaje 3 · Retención)';
COMMENT ON COLUMN proyectos.maint_plan IS
  'Plan: connect (Buffalo Connect 10%) | cloud (Buffalo Cloud 15%) | NULL';

-- ============================================================
-- TABLA 2: engranaje5_data  (métricas mensuales crudas)
-- ============================================================

CREATE TABLE IF NOT EXISTS engranaje5_data (

  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                    UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  year                          INTEGER NOT NULL,
  month                         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),

  -- Volumen (todos los servicios)
  total_interactions            INTEGER,
  interactions_resolved         INTEGER,
  interactions_escalated        INTEGER,
  interactions_abandoned        INTEGER,
  interactions_error            INTEGER,

  -- Agente de voz
  calls_inbound                 INTEGER,
  calls_outbound                INTEGER,
  avg_call_duration_s           NUMERIC(8,2),
  total_call_minutes            NUMERIC(10,2),
  avg_confidence_score          NUMERIC(4,3) CHECK (avg_confidence_score IS NULL OR avg_confidence_score BETWEEN 0 AND 1),
  peak_calls_day                INTEGER,
  peak_calls_hour               INTEGER,
  transcriptions_stored         INTEGER,
  cloned_voice_used_pct         NUMERIC(5,4),
  human_transfers               INTEGER,
  email_summaries_sent          INTEGER,
  top_intents_json              JSONB,
  escalation_reasons_json       JSONB,

  -- Agente de chat / texto
  conversations_whatsapp        INTEGER,
  conversations_web             INTEGER,
  conversations_form            INTEGER,
  avg_messages_per_conv         NUMERIC(6,2),
  avg_response_time_ms          NUMERIC(10,2),
  avg_conv_duration_s           NUMERIC(8,2),
  tokens_input_total            BIGINT,
  tokens_output_total           BIGINT,
  llm_cost_usd                  NUMERIC(10,4),
  conversations_outside_hours   INTEGER,
  top_topics_json               JSONB,
  multimodal_inputs             INTEGER,

  -- Dashboard / app
  sessions_total                INTEGER,
  users_unique                  INTEGER,
  avg_session_duration_s        NUMERIC(8,2),
  avg_page_views                NUMERIC(6,2),
  conversions_total             INTEGER,
  reports_exported              INTEGER,
  sessions_mobile               INTEGER,
  features_used_json            JSONB,
  days_inactive_streak          INTEGER,

  -- Infraestructura (todos los servicios)
  infra_cost_usd                NUMERIC(10,4),
  uptime_minutes                INTEGER,
  downtime_minutes              INTEGER,
  incidents_count               INTEGER DEFAULT 0,
  improvements_applied          INTEGER DEFAULT 0,

  -- NPS
  nps_score_avg                 NUMERIC(4,2) CHECK (nps_score_avg IS NULL OR nps_score_avg BETWEEN 0 AND 10),
  nps_responses_count           INTEGER DEFAULT 0,

  recorded_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(project_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_e5data_project_id ON engranaje5_data(project_id);
CREATE INDEX IF NOT EXISTS idx_e5data_period     ON engranaje5_data(project_id, year, month);
CREATE INDEX IF NOT EXISTS idx_e5data_yearmonth  ON engranaje5_data(year, month);

-- ============================================================
-- TABLA 3: engranaje5_kpis  (KPIs calculados para dashboard)
-- ============================================================

CREATE TABLE IF NOT EXISTS engranaje5_kpis (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  year                INTEGER NOT NULL,
  month               INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),

  kpi_key             TEXT NOT NULL,
  kpi_label           TEXT NOT NULL,
  kpi_category        TEXT NOT NULL CHECK (kpi_category IN (
                        'roi','uso','calidad','coste','disponibilidad',
                        'satisfaccion','riesgo'
                      )),

  kpi_value           NUMERIC(15,4),
  kpi_unit            TEXT,
  kpi_value_label     TEXT,

  chart_type          TEXT NOT NULL CHECK (chart_type IN (
                        'numero','barras','linea','donut','gauge','area'
                      )),
  is_star_kpi         BOOLEAN NOT NULL DEFAULT FALSE,
  visible_dashboard   BOOLEAN NOT NULL DEFAULT TRUE,
  visible_report      BOOLEAN NOT NULL DEFAULT FALSE,

  trend_vs_prev_month NUMERIC(8,4),
  trend_direction     TEXT CHECK (trend_direction IS NULL OR trend_direction IN ('up','down','flat')),

  service_types       TEXT[],
  formula_notes       TEXT,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(project_id, year, month, kpi_key)
);

CREATE INDEX IF NOT EXISTS idx_e5kpis_project_id  ON engranaje5_kpis(project_id);
CREATE INDEX IF NOT EXISTS idx_e5kpis_period      ON engranaje5_kpis(project_id, year, month);
CREATE INDEX IF NOT EXISTS idx_e5kpis_key         ON engranaje5_kpis(kpi_key);
CREATE INDEX IF NOT EXISTS idx_e5kpis_star        ON engranaje5_kpis(project_id, year, month, is_star_kpi);
CREATE INDEX IF NOT EXISTS idx_e5kpis_dashboard   ON engranaje5_kpis(project_id, visible_dashboard);
CREATE INDEX IF NOT EXISTS idx_e5kpis_report      ON engranaje5_kpis(project_id, visible_report);

-- ============================================================
-- TRIGGER: updated_at automático en proyectos
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proyectos_updated_at ON proyectos;
CREATE TRIGGER trg_proyectos_updated_at
  BEFORE UPDATE ON proyectos
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ============================================================
-- BACKFILL opcional (proyectos con cuota pero sin flag)
-- ============================================================

UPDATE proyectos
SET has_mensualidad = true
WHERE monthly_fee_eur IS NOT NULL
  AND monthly_fee_eur > 0
  AND has_mensualidad = false;
