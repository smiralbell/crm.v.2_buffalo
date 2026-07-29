-- Permite service_type = audit (auditorías Buffalo en onboarding)
ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS proyectos_service_type_check;

ALTER TABLE proyectos
  ADD CONSTRAINT proyectos_service_type_check
  CHECK (
    service_type = ANY (
      ARRAY[
        'voice_agent'::text,
        'text_agent'::text,
        'dashboard_app'::text,
        'automation'::text,
        'lead_gen'::text,
        'geo_seo'::text,
        'audit'::text
      ]
    )
  );
