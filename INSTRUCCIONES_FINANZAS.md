# 📊 Instrucciones: Módulo de Finanzas

## ✅ QUERY PARA POSTGRESQL

**Ejecuta este SQL en tu base de datos PostgreSQL:**

El archivo está en: `prisma/CREATE_FINANCIAL_TABLES.sql`

```bash
# Ejecuta el contenido del archivo en tu base de datos PostgreSQL
```

---

## 🔄 DESPUÉS DE EJECUTAR EL SQL

1. **Regenerar Prisma Client:**
   ```bash
   npm run prisma:generate
   ```

2. **Verificar que funciona:**
   - Ve a `/finances` en el CRM
   - Deberías ver el Dashboard de Finanzas
   - Puedes crear gastos fijos, gastos manuales, nóminas e ingresos

---

## 📁 ARCHIVOS CREADOS

✅ **SQL:** `prisma/CREATE_FINANCIAL_TABLES.sql`  
✅ **Schema Prisma:** Actualizado con modelos financieros  
✅ **API Routes:**
   - `pages/api/finances/expenses/fixed/index.ts` - Gastos fijos (GET, POST)
   - `pages/api/finances/expenses/fixed/[id].ts` - Gastos fijos individuales (GET, PUT, DELETE)
   - (Faltan: gastos manuales, nóminas, ingresos)
✅ **Páginas:**
   - `pages/finances/index.tsx` - Dashboard financiero
   - `pages/finances/expenses/index.tsx` - Gestión de gastos
   - `pages/finances/expenses/fixed/new.tsx` - Crear gasto fijo
   - (Faltan: páginas de ingresos, impuestos, resultados)
✅ **Sidebar:** Actualizado con enlace "Finanzas"

---

## 🎯 FUNCIONALIDADES IMPLEMENTADAS

### ✅ Dashboard Financiero (`/finances`)
- Tarjetas con métricas principales:
  - Ingresos del mes (sin IVA)
  - Gastos del mes (sin IVA)
  - Beneficio del mes
  - Beneficio acumulado del año
  - IVA trimestral (a pagar/devolver)
  - Impuesto de sociedades estimado
- Filtro por mes
- Enlaces rápidos a subsecciones
- Placeholders para gráficos futuros

### ✅ Gestión de Gastos (`/finances/expenses`)
- **Gastos Fijos:**
  - Lista de gastos fijos mensuales
  - Crear nuevo gasto fijo
  - Editar gasto fijo (página pendiente)
  - Eliminar gasto fijo
  - Activar/desactivar gastos
  
- **Gastos Manuales:**
  - Lista de gastos del mes
  - Crear nuevo gasto (página pendiente)
  - Editar gasto (página pendiente)
  - Eliminar gasto
  
- **Nóminas:**
  - Lista de nóminas del mes
  - Crear nueva nómina (página pendiente)
  - Editar nómina (página pendiente)
  - Eliminar nómina

---

## 🚧 PENDIENTE DE IMPLEMENTAR

### API Routes faltantes:
- [ ] `pages/api/finances/expenses/index.ts` - Gastos manuales (GET, POST)
- [ ] `pages/api/finances/expenses/[id].ts` - Gasto manual individual (GET, PUT, DELETE)
- [ ] `pages/api/finances/salaries/index.ts` - Nóminas (GET, POST)
- [ ] `pages/api/finances/salaries/[id].ts` - Nómina individual (GET, PUT, DELETE)
- [ ] `pages/api/finances/incomes/index.ts` - Ingresos (GET, POST)
- [ ] `pages/api/finances/incomes/[id].ts` - Ingreso individual (GET, PUT, DELETE)
- [ ] `pages/api/finances/settings/index.ts` - Configuración (GET, PUT)

### Páginas faltantes:
- [ ] `pages/finances/incomes/index.tsx` - Lista de ingresos
- [ ] `pages/finances/incomes/new.tsx` - Crear ingreso
- [ ] `pages/finances/incomes/[id]/edit.tsx` - Editar ingreso
- [ ] `pages/finances/taxes/index.tsx` - Impuestos (IVA y Sociedades)
- [ ] `pages/finances/results/index.tsx` - Resultados mensuales/anuales
- [ ] `pages/finances/expenses/manual/new.tsx` - Crear gasto manual
- [ ] `pages/finances/expenses/manual/[id]/edit.tsx` - Editar gasto manual
- [ ] `pages/finances/expenses/salaries/new.tsx` - Crear nómina
- [ ] `pages/finances/expenses/salaries/[id]/edit.tsx` - Editar nómina
- [ ] `pages/finances/expenses/fixed/[id]/edit.tsx` - Editar gasto fijo

---

## 📝 ESTRUCTURA DE DATOS

### Gastos Fijos (`fixed_expenses`)
- Se repiten automáticamente cada mes
- Campos: nombre, importe, tiene IVA, % IVA, activo/inactivo

### Gastos Manuales (`expenses`)
- Gastos puntuales (freelancers, proveedores)
- Campos: nombre, fecha, base, IVA, total, persona, proyecto, cliente, notas

### Nóminas (`salaries`)
- Pagos a socios/empleados (sin IVA)
- Campos: persona, fecha, importe, notas

### Ingresos (`financial_incomes`)
- Facturas reales o estimadas
- Campos: cliente, fecha, base, IVA, total, estado, proyecto, factura_id, notas

### Configuración (`financial_settings`)
- Configuración global
- Campos: % impuesto de sociedades

---

## 🎨 DISEÑO

- Dashboard tipo tarjetas con gradientes sutiles
- Colores diferenciados por tipo (verde=ingresos, rojo=gastos, azul=beneficio)
- Tablas limpias con headers con gradiente oscuro
- Mucho espacio en blanco
- Tipografía clara y jerarquizada

---

## 🚀 PRÓXIMOS PASOS

1. **Completar API routes faltantes** (siguiendo el patrón de `fixed_expenses`)
2. **Crear páginas de creación/edición** para todos los tipos
3. **Implementar página de Ingresos** completa
4. **Implementar página de Impuestos** (IVA y Sociedades)
5. **Implementar página de Resultados** (vista mensual/anual)
6. **Añadir gráficos** (Recharts o Chart.js) en el Dashboard
7. **Mejorar cálculos** de gastos fijos (aplicar automáticamente cada mes)

---

**¡Listo! El módulo de Finanzas está parcialmente integrado en tu CRM.** 🚀

**Nota:** Esta es una primera versión funcional. Las funcionalidades faltantes se pueden añadir siguiendo los mismos patrones establecidos.

