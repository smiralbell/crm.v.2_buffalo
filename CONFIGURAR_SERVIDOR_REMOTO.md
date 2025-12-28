# 🌐 Configuración para Base de Datos Remota

## 📝 Formato de DATABASE_URL para Servidor Remoto

El formato correcto para conectarte a un servidor PostgreSQL remoto es:

```
postgresql://USUARIO:CONTRASEÑA@IP_O_HOSTNAME:PUERTO/NOMBRE_BD
```

## 🔧 Ejemplos de Configuración

### Ejemplo 1: Servidor con IP Pública
```env
DATABASE_URL=postgresql://postgres:tu_password@192.168.1.100:5432/crm_buffalo
```

### Ejemplo 2: Servidor con Dominio
```env
DATABASE_URL=postgresql://postgres:tu_password@servidor.midominio.com:5432/crm_buffalo
```

### Ejemplo 3: Servidor con Puerto Personalizado
```env
DATABASE_URL=postgresql://postgres:tu_password@192.168.1.100:5433/crm_buffalo
```

### Ejemplo 4: Con Usuario Personalizado
```env
DATABASE_URL=postgresql://mi_usuario:mi_password@192.168.1.100:5432/crm_buffalo
```

## ⚙️ Pasos para Configurar

1. **Edita el archivo `.env`** en la raíz del proyecto
2. **Reemplaza** la línea `DATABASE_URL` con la URL de tu servidor
3. **Guarda** el archivo
4. **Reinicia** el servidor de desarrollo (`npm run dev`)

## 🔒 Consideraciones de Seguridad

- ✅ Asegúrate de que el puerto de PostgreSQL esté abierto en el firewall
- ✅ Usa contraseñas seguras
- ✅ Considera usar SSL/TLS para conexiones remotas (ver abajo)

## 🔐 Conexión con SSL (Recomendado para Producción)

Si tu servidor requiere SSL, puedes agregar parámetros:

```env
DATABASE_URL=postgresql://usuario:password@servidor:5432/crm_buffalo?sslmode=require
```

O si tienes certificados:
```env
DATABASE_URL=postgresql://usuario:password@servidor:5432/crm_buffalo?sslmode=verify-full&sslcert=/ruta/cert.pem&sslkey=/ruta/key.pem
```

## ✅ Verificar la Conexión

Después de configurar, puedes verificar la conexión ejecutando:

```bash
npx prisma db pull
```

O intentando generar el cliente:
```bash
npm run prisma:generate
```

## 🐛 Solución de Problemas

### Error: "Can't reach database server"
- Verifica que la IP/hostname sea correcta
- Verifica que el puerto esté abierto y accesible
- Verifica que PostgreSQL esté escuchando en todas las interfaces (no solo localhost)

### Error: "password authentication failed"
- Verifica usuario y contraseña
- Verifica que el usuario tenga permisos para conectarse remotamente

### Error: "connection timeout"
- Verifica el firewall del servidor
- Verifica que el puerto esté expuesto correctamente
- Verifica la conectividad de red

