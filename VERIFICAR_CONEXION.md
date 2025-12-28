# 🔍 Verificar Conexión a PostgreSQL

## 📋 Pasos para Verificar

### 1. Verificar que el servidor esté ejecutándose

```bash
npm run dev
```

### 2. Probar el endpoint de test

Abre en tu navegador:
```
http://localhost:3000/api/test-db
```

**Qué deberías ver si funciona:**
```json
{
  "success": true,
  "connection": "OK",
  "stats": {
    "contacts": 10,
    "leads": 5
  },
  "sampleContacts": [...],
  "sampleLeads": [...]
}
```

**Si hay error:**
```json
{
  "success": false,
  "error": "mensaje de error",
  "connection": "FAILED"
}
```

### 3. Verificar el archivo .env

Asegúrate de que `DATABASE_URL` esté en una sola línea:

```env
DATABASE_URL=postgresql://postgres:Money%26Dream1@panel.agenciabuffalo.es:5434/crm_buffalo
```

**IMPORTANTE**: 
- No debe tener saltos de línea
- El `&` en la contraseña debe estar codificado como `%26`
- Debe terminar con el nombre de la base de datos

### 4. Probar con Prisma Studio (Opcional)

```bash
npm run prisma:studio
```

Esto abrirá una interfaz visual donde podrás ver todas tus tablas y datos.

## 🔧 Solución de Problemas

### Error: "Can't reach database server"
- Verifica que el servidor PostgreSQL esté accesible desde tu máquina
- Verifica que el puerto 5434 esté abierto
- Verifica que la IP/hostname sea correcta

### Error: "password authentication failed"
- Verifica que la contraseña en `.env` sea correcta
- Recuerda que `&` debe ser `%26` en la URL

### Error: "database does not exist"
- Verifica que la base de datos `crm_buffalo` exista
- Verifica que el nombre en `DATABASE_URL` sea correcto

### No veo datos reales
- Verifica que las tablas tengan datos: `SELECT COUNT(*) FROM contacts;`
- Verifica que el endpoint `/api/test-db` muestre los datos
- Revisa la consola del navegador para errores

## ✅ Checklist

- [ ] Servidor de desarrollo ejecutándose (`npm run dev`)
- [ ] Endpoint `/api/test-db` responde correctamente
- [ ] `DATABASE_URL` está en una sola línea sin saltos
- [ ] La contraseña tiene `%26` en lugar de `&`
- [ ] Las tablas tienen datos (verificar con Prisma Studio o SQL)

