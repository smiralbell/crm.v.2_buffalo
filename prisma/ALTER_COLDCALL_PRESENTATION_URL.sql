-- Enlace público a la presentación comercial (Claude design, Gamma, etc.)
ALTER TABLE coldcall_campaigns
  ADD COLUMN IF NOT EXISTS presentation_url TEXT;
