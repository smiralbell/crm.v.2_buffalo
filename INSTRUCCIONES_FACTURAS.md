# 📋 Instrucciones: Sistema de Facturas Simple

## ✅ QUERY PARA POSTGRESQL

**Ejecuta este SQL en tu base de datos PostgreSQL:**

```sql
-- ============================================
-- TABLA PRINCIPAL DE FACTURAS
-- ============================================
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

-- Índices básicos
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_deleted ON invoices(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_issue_date ON invoices(issue_date);

-- ============================================
-- TABLA OPCIONAL: PLANTILLA HTML
-- ============================================
-- Solo si quieres guardar la plantilla en BD
-- Si prefieres archivo estático, omite esta tabla

CREATE TABLE invoice_template (
    id INTEGER PRIMARY KEY DEFAULT 1,
    html_content TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT single_template CHECK (id = 1)
);

INSERT INTO invoice_template (id, html_content)
VALUES (
    1,
    '<html><body><h1>Plantilla base - Se actualizará con HTML real</h1></body></html>'
)
ON CONFLICT (id) DO NOTHING;
```

---

## 🔄 DESPUÉS DE EJECUTAR EL SQL

1. **Regenerar Prisma Client:**
   ```bash
   npm run prisma:generate
   ```

2. **Verificar que funciona:**
   - Ve a `/invoices` en el CRM
   - Deberías ver la página de facturas con estadísticas
   - Puedes crear una nueva factura

---

## 📁 ARCHIVOS CREADOS

✅ **SQL:** `prisma/CREATE_INVOICES_TABLE.sql`  
✅ **Schema Prisma:** Actualizado con modelo `Invoice` simple  
✅ **API:** 
   - `pages/api/invoices/index.ts` - Listar y crear
   - `pages/api/invoices/[id].ts` - Ver, editar y eliminar
✅ **Páginas:**
   - `pages/invoices/index.tsx` - Listado con estadísticas
   - `pages/invoices/new.tsx` - Nueva factura
   - `pages/invoices/[id].tsx` - Detalle
   - `pages/invoices/[id]/edit.tsx` - Editar (solo borradores)
✅ **Sidebar:** Actualizado con enlace "Facturas"  
✅ **Plantilla HTML:** `templates/invoice.html`

---

## 🎯 FUNCIONALIDADES

- ✅ Listar facturas con estadísticas (total, borradores, enviadas, total facturado)
- ✅ Crear nueva factura
- ✅ Seleccionar contacto para autocompletar datos
- ✅ Agregar múltiples servicios/productos
- ✅ Cálculo automático de totales (subtotal, IVA, total)
- ✅ Ver detalle de factura
- ✅ Editar factura (solo borradores)
- ✅ Eliminar factura (soft delete con confirmación)
- ✅ Estados: Borrador, Enviada, Cancelada
- ✅ Numeración automática: BUF-2025-0001, BUF-2025-0002, etc.

---

## 📝 ESTRUCTURA DE DATOS

### Campo `services` (JSONB)

Se guarda como JSON en PostgreSQL:

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
- Sin JOINs complejos
- Fácil de consultar y editar
- PostgreSQL maneja JSONB muy bien

---

## 🚀 PRÓXIMOS PASOS (Opcional)

1. **Editar plantilla HTML** - Actualizar `templates/invoice.html` con diseño real
2. **Generar PDF** - Implementar renderizado HTML → PDF (puppeteer)
3. **Google Drive** - Configurar subida de PDFs
4. **Enviar factura** - Botón para marcar como "enviada" y generar PDF

---

**¡Listo! El sistema de facturas está integrado en tu CRM.** 🚀

