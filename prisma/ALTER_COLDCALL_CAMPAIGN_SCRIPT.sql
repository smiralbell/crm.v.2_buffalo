-- Guión de llamadas por campaña (markdown ES / CA)

ALTER TABLE coldcall_campaigns
  ADD COLUMN IF NOT EXISTS script_markdown_es TEXT,
  ADD COLUMN IF NOT EXISTS script_markdown_ca TEXT;
