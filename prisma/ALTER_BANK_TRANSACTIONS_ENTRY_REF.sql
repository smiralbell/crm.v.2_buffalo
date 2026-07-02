-- Referencia única del movimiento en Enable Banking / PSD2 (entry_reference)
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS entry_reference TEXT;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_entry_reference
  ON bank_transactions (account_id, entry_reference)
  WHERE entry_reference IS NOT NULL;
