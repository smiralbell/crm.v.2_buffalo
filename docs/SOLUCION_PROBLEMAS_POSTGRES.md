# Solución a Problemas de PostgreSQL

## Problemas Identificados

### 1. **Advertencias de Collation Version Mismatch**

**Síntoma:**
```
WARNING: database "postgres" has a collation version mismatch
DETAIL: The database was created using collation version 2.36, but the operating system provides version 2.41.
```

**Explicación:**
- Estas advertencias aparecen cuando la versión de collation del sistema operativo es diferente a la que se usó para crear la base de datos
- **NO es un error crítico**, solo una advertencia
- Se repite en los logs porque PostgreSQL la emite cada vez que se abre una nueva conexión
- Si hay muchas peticiones → muchas conexiones → muchas advertencias en los logs

**Solución (Opcional):**
Si quieres eliminar las advertencias, ejecuta en PostgreSQL:
```sql
ALTER DATABASE postgres REFRESH COLLATION VERSION;
ALTER DATABASE n8n REFRESH COLLATION VERSION;
```

**Nota:** Esto solo actualiza la versión de collation, no afecta los datos. Es seguro ejecutarlo.

---

### 2. **Múltiples Peticiones a PostgreSQL**

**Causas Identificadas:**

1. **Falta de configuración del Connection Pool**
   - Sin límite explícito, Prisma puede abrir demasiadas conexiones
   - Cada conexión nueva emite la advertencia de collation

2. **Carga de todos los contactos en creación de leads**
   - La página de creación de leads carga TODOS los contactos
   - Si hay muchos contactos, esto puede ser lento y consumir recursos

**Soluciones Aplicadas:**

#### ✅ Configuración del Connection Pool
Se agregó configuración automática del pool en `lib/prisma.ts`:
- `connection_limit=10`: Máximo 10 conexiones simultáneas
- `pool_timeout=20`: Timeout de 20 segundos para obtener conexión

#### ✅ Límite en carga de contactos
Se agregó límite de 1000 contactos en `pages/leads/new.tsx` para evitar sobrecargar.

---

### 3. **Optimizaciones Adicionales**

#### Verificaciones en Paralelo
En `pages/api/contacts/[id].ts`, las verificaciones de duplicados se ejecutan en paralelo usando `Promise.all`, reduciendo el tiempo de ejecución.

#### Solo Actualizar Campos que Cambiaron
El endpoint de actualización de contactos solo actualiza los campos que realmente cambiaron, evitando validaciones innecesarias de Prisma.

---

## Recomendaciones Adicionales

### Para Easypanel/Producción:

1. **Configurar DATABASE_URL con parámetros de pool:**
   ```
   postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20
   ```

2. **Monitorear conexiones activas:**
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE datname = 'tu_database';
   ```

3. **Si persisten problemas de conexión:**
   - Aumentar `connection_limit` según los recursos del servidor
   - Revisar si hay consultas N+1 en otros endpoints
   - Considerar usar un connection pooler como PgBouncer

---

## Resumen

- ✅ Connection pool configurado automáticamente
- ✅ Límite en carga de contactos
- ✅ Verificaciones optimizadas en paralelo
- ⚠️ Advertencias de collation son normales (no críticas)
- 💡 Opcional: Ejecutar `ALTER DATABASE ... REFRESH COLLATION VERSION` para eliminar advertencias





