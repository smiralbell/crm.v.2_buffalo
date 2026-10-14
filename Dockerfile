# ---- Dependencias (todas, para compilar) ----
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Compilación ----
FROM deps AS build
COPY . .
# Prisma Client (requerido antes del build)
RUN npx prisma generate
# El chequeo de tipos de next build supera el límite de memoria por defecto de Node
RUN NODE_OPTIONS=--max-old-space-size=4096 NEXT_TELEMETRY_DISABLED=1 npm run build
# La imagen final no necesita herramientas de desarrollo ni la caché de compilación
RUN npm prune --omit=dev && rm -rf .next/cache

# ---- Imagen final ----
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./

EXPOSE 3000

# Web: aplica migraciones pendientes (db/migrations) y arranca. Si una migración falla,
# el CRM arranca igualmente y el error se ve en los logs y en /sistema.
# Worker (segundo servicio en EasyPanel, misma imagen): comando `npm run worker`.
CMD ["sh", "-c", "npm run db:migrate || echo '[migrate] fallo: el CRM arranca igualmente'; exec npm start"]
