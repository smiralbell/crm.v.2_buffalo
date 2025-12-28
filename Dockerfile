# ============================================
# Dockerfile para EasyPanel - CRM Buffalo
# ============================================
# Este Dockerfile está optimizado para desplegar
# Next.js Pages Router en EasyPanel sin errores

# Imagen base: Node.js 20 Alpine (ligera y estable)
FROM node:20-alpine

# Instalar dependencias del sistema necesarias
# openssl: Requerido por Prisma para conexiones SSL/TLS
RUN apk add --no-cache openssl

# Crear directorio de trabajo
WORKDIR /app

# ============================================
# PASO 1: Copiar archivos de dependencias
# ============================================
# Copiamos primero package.json y package-lock.json
# para aprovechar la caché de Docker si no cambian
COPY package.json package-lock.json ./

# ============================================
# PASO 2: Instalar dependencias
# ============================================
# npm ci: Instalación limpia y determinística
# --only=production: NO usamos esto porque necesitamos
# Prisma CLI para generar el cliente y ejecutar migraciones
RUN npm ci

# ============================================
# PASO 3: Copiar código fuente
# ============================================
# Copiamos todo el código (excluyendo .dockerignore)
COPY . .

# ============================================
# PASO 4: Generar Prisma Client
# ============================================
# CRÍTICO: Debe ejecutarse ANTES del build de Next.js
# porque el código usa @prisma/client
RUN npx prisma generate

# ============================================
# PASO 5: Construir Next.js
# ============================================
# Genera los archivos estáticos y optimizados
RUN npm run build

# ============================================
# PASO 6: Exponer puerto
# ============================================
# EasyPanel usará este puerto para enrutar tráfico
# El puerto real se configura en EasyPanel (normalmente 3000)
EXPOSE 3000

# ============================================
# PASO 7: Comando de inicio
# ============================================
# Next.js usa automáticamente PORT de las variables de entorno
# Si PORT no está definido, usa 3000 por defecto
CMD ["npm", "start"]

