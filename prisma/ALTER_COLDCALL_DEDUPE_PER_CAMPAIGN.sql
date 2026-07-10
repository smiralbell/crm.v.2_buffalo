-- Deduplicar leads por campaña (no global entre campañas)

DROP INDEX IF EXISTS idx_coldcall_prospects_dedupe;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coldcall_prospects_dedupe_campaign
  ON coldcall_prospects(campaign_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND deleted_at IS NULL AND campaign_id IS NOT NULL;
