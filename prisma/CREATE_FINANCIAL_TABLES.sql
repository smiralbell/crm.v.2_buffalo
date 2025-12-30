-- ============================================
-- TABLAS DEL MÓDULO DE FINANZAS
-- ============================================
-- Gestión financiera visual y manual
-- NO contabilidad oficial - solo para decisiones

-- Gastos fijos mensuales (se repiten automáticamente)
CREATE TABLE fixed_expenses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    has_iva BOOLEAN NOT NULL DEFAULT false,
    iva_percent DECIMAL(5, 2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_fixed_expenses_active ON fixed_expenses(is_active, deleted_at) WHERE deleted_at IS NULL;

-- Gastos manuales (freelancers, proveedores)
CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    base_amount DECIMAL(10, 2) NOT NULL,
    iva_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL,
    person_name VARCHAR(255),
    project VARCHAR(255),
    client_name VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_deleted ON expenses(deleted_at) WHERE deleted_at IS NULL;

-- Nóminas / Pagos a socios (sin IVA)
CREATE TABLE salaries (
    id SERIAL PRIMARY KEY,
    person_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_salaries_date ON salaries(date);
CREATE INDEX idx_salaries_deleted ON salaries(deleted_at) WHERE deleted_at IS NULL;

-- Ingresos (facturas reales o estimadas)
CREATE TABLE financial_incomes (
    id SERIAL PRIMARY KEY,
    client_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    base_amount DECIMAL(10, 2) NOT NULL,
    iva_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, paid, estimated
    project VARCHAR(255),
    invoice_id INTEGER, -- ID de factura si está vinculada (opcional)
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_financial_incomes_date ON financial_incomes(date);
CREATE INDEX idx_financial_incomes_status ON financial_incomes(status);
CREATE INDEX idx_financial_incomes_deleted ON financial_incomes(deleted_at) WHERE deleted_at IS NULL;

-- Configuración financiera (IVA, impuesto sociedades)
CREATE TABLE financial_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    corporate_tax_percent DECIMAL(5, 2) NOT NULL DEFAULT 25.00,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT single_settings CHECK (id = 1)
);

-- Insertar configuración inicial
INSERT INTO financial_settings (id, corporate_tax_percent)
VALUES (1, 25.00)
ON CONFLICT (id) DO NOTHING;

