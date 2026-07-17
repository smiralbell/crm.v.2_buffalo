ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS developer_pdf_path TEXT;
