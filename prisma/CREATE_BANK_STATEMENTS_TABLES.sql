-- Tablas para importación de extractos bancarios
-- Ejecutar este script en PostgreSQL para crear las tablas necesarias

-- Tabla de cuentas bancarias
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  iban TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT now()
);

-- Tabla de extractos bancarios
CREATE TABLE IF NOT EXISTS bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES bank_accounts(id),
  period_start DATE,
  period_end DATE,
  uploaded_at TIMESTAMP DEFAULT now(),
  file_hash TEXT,
  original_filename TEXT
);

-- Tabla de transacciones bancarias
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES bank_accounts(id),
  statement_id UUID REFERENCES bank_statements(id),
  date DATE,
  amount NUMERIC(12,2),
  description TEXT,
  hash TEXT,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(account_id, hash)
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_bank_statements_account_id ON bank_statements(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_period ON bank_statements(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_id ON bank_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_statement_id ON bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_hash ON bank_transactions(hash);

