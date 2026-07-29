-- Categoría manual de gastos bancarios (SaaS, impuestos, servicios, etc.)
-- Valores: platform | payroll | marketing | developer | professional | tax | other
-- NULL = usar detección automática por concepto/descripción

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS expense_bucket TEXT NULL;

COMMENT ON COLUMN bank_transactions.expense_bucket IS
  'Override manual de categoría de gasto (PaymentBucket). NULL = auto por descripción.';

CREATE INDEX IF NOT EXISTS idx_bank_transactions_expense_bucket
  ON bank_transactions (expense_bucket)
  WHERE expense_bucket IS NOT NULL;
