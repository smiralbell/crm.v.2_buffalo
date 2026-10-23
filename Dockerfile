FROM node:20-alpine

# Instalar dependencias del sistema
RUN apk add --no-cache openssl

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY . .

# Generar Prisma Client (requerido antes del build)
RUN npx prisma generate

# Construir aplicación Next.js
RUN npm run build

# Exponer puerto
EXPOSE 3000

# Comando de inicio
CMD ["sh", "-c", "node scripts/ensure-invoice-document-columns.mjs && npm start"]

