-- Solicitudes de comerciales: "ME FALTAN PROSPECTOS SOLICITO UNA NUEVA BBDD"

CREATE TABLE IF NOT EXISTS coldcall_prospect_requests (
  id SERIAL PRIMARY KEY,
  requested_by_user_id INTEGER NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES coldcall_campaigns(id) ON DELETE SET NULL,
  message TEXT NOT NULL DEFAULT 'ME FALTAN PROSPECTOS SOLICITO UNA NUEVA BBDD',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved')),
  resolved_by_user_id INTEGER REFERENCES crm_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coldcall_prospect_requests_pending
  ON coldcall_prospect_requests(status, created_at DESC)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_coldcall_prospect_requests_open
  ON coldcall_prospect_requests(requested_by_user_id, COALESCE(campaign_id, 0))
  WHERE status = 'pending';
