# 📄 Sistema de Facturación Simple - Buffalo AI

Sistema ultra-simple de facturación para uso interno.

---

## 🗄️ SQL PARA POSTGRESQL

### Tabla Principal: `invoices`

```sql
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    client_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255),
    client_address TEXT,
    client_tax_id VARCHAR(50),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    services JSONB,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    iva DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    pdf_drive_file_id VARCHAR(255),
    pdf_drive_url TEXT,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_deleted ON invoices(deleted_at) WHERE deleted_at IS NULL;
```

### Tabla Opcional: `invoice_template` (solo si quieres guardar plantilla en BD)

```sql
CREATE TABLE invoice_template (
    id INTEGER PRIMARY KEY DEFAULT 1,
    html_content TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT single_template CHECK (id = 1)
);

INSERT INTO invoice_template (id, html_content)
VALUES (1, '<html><body><h1>Plantilla base</h1></body></html>')
ON CONFLICT (id) DO NOTHING;
```

**Opcional:** Si prefieres, guarda la plantilla como archivo estático en `templates/invoice.html` y omite esta tabla.

---

## 📋 ESTRUCTURA DE DATOS

### Campo `services` (JSONB)

Formato simple en JSON:

```json
[
  {
    "description": "Desarrollo web",
    "quantity": 10,
    "price": 100.00,
    "tax": 21,
    "total": 1210.00
  },
  {
    "description": "Consultoría",
    "quantity": 5,
    "price": 150.00,
    "tax": 21,
    "total": 907.50
  }
]
```

**Ventajas:**
- Todo en una sola tabla
- Fácil de consultar
- Fácil de editar
- No necesita JOINs

---

## 🔄 FLUJO COMPLETO

### 1. Crear Factura (Draft)

```javascript
// POST /api/invoices
{
  client_name: "Cliente SL",
  client_email: "cliente@example.com",
  client_address: "Calle Ejemplo 123",
  issue_date: "2025-01-15",
  services: [
    {
      description: "Desarrollo web",
      quantity: 10,
      price: 100,
      tax: 21,
      total: 1210
    }
  ],
  subtotal: 1000,
  iva: 210,
  total: 1210,
  status: "draft"
}

// Backend:
// 1. Genera número: BUF-2025-0001
// 2. Guarda en invoices (status: 'draft')
```

### 2. Editar Factura (solo si status = 'draft')

```javascript
// PUT /api/invoices/:id
// Solo permite editar si status = 'draft'
// Actualiza campos en la misma fila
```

### 3. Enviar Factura (status → 'sent')

```javascript
// PUT /api/invoices/:id/send
// Backend:
// 1. Valida que status = 'draft'
// 2. Obtiene plantilla HTML (de BD o archivo)
// 3. Renderiza HTML con datos de factura
// 4. Genera PDF (puppeteer/wkhtmltopdf)
// 5. Sube PDF a Google Drive
// 6. Guarda file_id y url en invoices
// 7. Actualiza status = 'sent'
```

### 4. Eliminar Factura

```sql
UPDATE invoices 
SET deleted_at = NOW() 
WHERE id = :id;
```

---

## 🎨 PLANTILLA HTML

La plantilla está en: `templates/invoice.html`

**Variables disponibles:**
- `{{invoice_number}}` - BUF-2025-0001
- `{{client_name}}` - Nombre del cliente
- `{{client_email}}` - Email del cliente
- `{{client_address}}` - Dirección
- `{{client_tax_id}}` - CIF/NIF
- `{{issue_date}}` - Fecha emisión
- `{{due_date}}` - Fecha vencimiento
- `{{services}}` - Array de servicios (iterar con `{{#each}}`)
- `{{subtotal}}` - Subtotal
- `{{iva}}` - IVA
- `{{total}}` - Total
- `{{company_logo}}` - URL del logo
- `{{company_address}}` - Dirección empresa
- `{{company_tax_id}}` - CIF empresa
- `{{company_email}}` - Email empresa

**Renderizado:**
- Usar Handlebars o simple `replace()`
- Iterar sobre `services` para generar tabla
- Formatear precios con `format_price()`

---

## 📦 EJEMPLO DE RENDERIZADO

```javascript
const Handlebars = require('handlebars');
const fs = require('fs');

// Cargar plantilla
const templateHtml = fs.readFileSync('templates/invoice.html', 'utf8');

// Preparar datos
const data = {
  invoice_number: invoice.invoice_number,
  client_name: invoice.client_name,
  client_email: invoice.client_email,
  client_address: invoice.client_address,
  issue_date: formatDate(invoice.issue_date),
  services: JSON.parse(invoice.services), // Si es JSONB
  subtotal: invoice.subtotal,
  iva: invoice.iva,
  total: invoice.total,
  company_logo: 'https://...', // URL del logo
  company_address: '...',
  company_tax_id: '...',
  company_email: '...',
};

// Renderizar
const template = Handlebars.compile(templateHtml);
const html = template(data);

// Generar PDF (puppeteer)
const pdf = await generatePDF(html);

// Subir a Drive
const driveFile = await uploadToDrive(pdf, `${invoice.invoice_number}.pdf`);

// Guardar referencias
await prisma.invoice.update({
  where: { id: invoice.id },
  data: {
    status: 'sent',
    pdf_drive_file_id: driveFile.id,
    pdf_drive_url: driveFile.webViewLink,
  },
});
```

---

## ✅ VENTAJAS DE ESTE ENFOQUE

1. **Simplicidad:** Una sola tabla principal
2. **Rapidez:** Sin JOINs complejos
3. **Mantenibilidad:** Fácil de entender
4. **Flexibilidad:** JSON permite cualquier estructura de servicios
5. **Escalable:** PostgreSQL maneja JSONB muy bien

---

## 🚀 PRÓXIMOS PASOS

1. Ejecutar SQL en PostgreSQL
2. Crear endpoints API básicos
3. Implementar renderizado HTML → PDF
4. Configurar Google Drive
5. Crear UI simple

---

**Sistema diseñado para ser simple, rápido y fácil de mantener.** 🎯

