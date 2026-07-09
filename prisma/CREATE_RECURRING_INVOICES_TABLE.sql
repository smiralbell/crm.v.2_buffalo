CREATE TABLE IF NOT EXISTS recurring_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  issue_day INTEGER NOT NULL DEFAULT 1 CHECK (issue_day BETWEEN 1 AND 31),
  due_day INTEGER CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_generated_at TIMESTAMPTZ,
  last_generated_period TEXT,
  last_generated_invoice_id INTEGER REFERENCES invoices(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recurring_invoices_deleted_at
  ON recurring_invoices(deleted_at);

CREATE INDEX IF NOT EXISTS idx_recurring_invoices_active
  ON recurring_invoices(is_active, deleted_at);

CREATE INDEX IF NOT EXISTS idx_recurring_invoices_source_invoice
  ON recurring_invoices(source_invoice_id);
