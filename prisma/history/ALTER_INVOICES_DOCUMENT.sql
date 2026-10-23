-- Documento de facturación: tipo, rectificativa, observaciones y pago.
-- No reescribe importes ni números ya emitidos.
-- Las filas existentes quedan como factura normal (document_type = 'invoice').

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'invoice';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS document_title TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS observations TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS rectifies_invoice_id INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS rectification_reason TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS show_payment_info BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_instructions TEXT;

CREATE INDEX IF NOT EXISTS invoices_rectifies_invoice_id_idx ON invoices (rectifies_invoice_id);
CREATE INDEX IF NOT EXISTS invoices_document_type_idx ON invoices (document_type);

DO $$
BEGIN
  ALTER TABLE invoices
    ADD CONSTRAINT invoices_document_type_check
    CHECK (document_type IN ('invoice', 'credit_note', 'proforma', 'quote'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE invoices
    ADD CONSTRAINT invoices_rectifies_invoice_id_fkey
    FOREIGN KEY (rectifies_invoice_id) REFERENCES invoices (id) ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
