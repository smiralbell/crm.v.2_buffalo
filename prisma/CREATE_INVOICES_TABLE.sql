-- ============================================
-- TABLA PRINCIPAL DE FACTURAS
-- ============================================
-- Una sola tabla con TODO lo necesario
-- Ejecuta esto en PostgreSQL

CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    
    -- Número de factura (BUF-2025-0001)
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    
    -- Cliente
    client_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255),
    client_address TEXT,
    client_tax_id VARCHAR(50),
    
    -- Fechas
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    
    -- Servicios (JSON simple o texto)
    -- Formato JSON: [{"description": "...", "quantity": 1, "price": 100, "tax": 21}]
    services JSONB,
    
    -- Totales
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    iva DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL DEFAULT 0,
    
    -- Estado
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, sent, cancelled
    
    -- Google Drive (cuando se genera el PDF)
    pdf_drive_file_id VARCHAR(255),
    pdf_drive_url TEXT,
    
    -- Soft delete
    deleted_at TIMESTAMP,
    
    -- Auditoría
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices básicos
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_deleted ON invoices(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_issue_date ON invoices(issue_date);

