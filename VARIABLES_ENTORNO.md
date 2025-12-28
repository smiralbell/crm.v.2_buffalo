# Variables de Entorno Requeridas

## 🔐 Variables Obligatorias

### `DATABASE_URL`
URL completa de conexión a PostgreSQL.
```
DATABASE_URL=postgresql://user:password@host:5432/database
```

### `CRM_ADMIN_EMAIL`
Email del administrador para login.
```
CRM_ADMIN_EMAIL=admin@buffalo.ai
```

### `CRM_ADMIN_PASSWORD`
Contraseña del administrador.
```
CRM_ADMIN_PASSWORD=tu-contraseña-segura
```

### `SESSION_SECRET`
Secret para firmar cookies de sesión. Genera uno seguro:
```bash
openssl rand -base64 32
```
```
SESSION_SECRET=tu-secret-generado
```

## ⚙️ Variables Opcionales

### `NODE_ENV`
Entorno de ejecución.
```
NODE_ENV=production
```

### `PORT`
Puerto donde escucha la aplicación (por defecto 3000).
```
PORT=3000
```

## 📝 Configuración en EasyPanel

1. Ve a **Variables de Entorno** en tu aplicación
2. Agrega cada variable con su valor
3. **NO** incluyas comillas en los valores
4. Guarda y reinicia la aplicación

## ✅ Verificación

Después de configurar, verifica que todo funcione:
- Health check: `https://tu-dominio/api/health` debe devolver 200
- Login con `CRM_ADMIN_EMAIL` y `CRM_ADMIN_PASSWORD`

