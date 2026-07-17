-- Marcar ingresos bancarios como mensualidad recurrente (MRR manual)
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS is_recurring_income BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_recurring_income
  ON bank_transactions (account_id, is_recurring_income)
  WHERE is_recurring_income = true;
