# 📊 Actualización del Schema de Prisma

## ✅ Cambios Realizados

He actualizado el schema de Prisma para que coincida **exactamente** con las tablas existentes en tu base de datos PostgreSQL:

### Tablas Existentes (ya en tu BD):
- ✅ `contacts` - Estructura completa adaptada
- ✅ `leads` - Adaptado con todos los campos (origen_principal, prioridad, score, etc.)
- ✅ `messages` - Modelo completo
- ✅ `pipelines` - Modelo completo
- ✅ `pipeline_stages` - Modelo completo
- ✅ `tasks` - Modelo completo

### Tablas Nuevas (necesarias para autenticación):
- ⚠️ `users` - **DEBES CREARLA** (ver `SETUP_TABLAS_AUTH.md`)
- ⚠️ `sessions` - **DEBES CREARLA** (ver `SETUP_TABLAS_AUTH.md`)

## 🔧 Cambios Específicos en el Schema

### Modelo Lead
Ahora incluye todos los campos de tu estructura:
- `origen_principal`
- `prioridad` (default: "media")
- `score`
- `ultima_interaccion`
- `pipeline_id` y `pipeline_stage_id`
- `position`
- `estado` (default: "frio" en lugar de "nuevo")

### Relaciones
- ✅ Contact → Leads (uno a muchos)
- ✅ Contact → Messages (uno a muchos)
- ✅ Contact → Tasks (uno a muchos)
- ✅ Lead → Messages (uno a muchos)
- ✅ Lead → Tasks (uno a muchos)
- ✅ Pipeline → PipelineStages (uno a muchos)
- ✅ Pipeline → Leads (uno a muchos)
- ✅ PipelineStage → Leads (uno a muchos)

## 📝 Próximos Pasos

1. **Crear tablas de autenticación**: Ejecuta el script SQL en `prisma/create_auth_tables.sql`
2. **Generar Prisma Client**: `npm run prisma:generate`
3. **Crear usuario inicial**: `npm run prisma:seed`
4. **Reiniciar servidor**: `npm run dev`

## ⚠️ Nota Importante

El schema ahora usa `@@map()` para mapear los nombres de los modelos a los nombres reales de las tablas en PostgreSQL. Esto asegura que Prisma funcione correctamente con tu estructura existente.

