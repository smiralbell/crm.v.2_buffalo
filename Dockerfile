# syntax=docker/dockerfile:1
# Build rápido: las dependencias, Prisma y la caché de Next se reutilizan entre deploys.
# Los tipos, el lint y los tests se comprueban en GitHub Actions (.github/workflows/ci.yml),
# no dentro del deploy.
FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 1. Dependencias: solo se reinstalan si cambia package-lock.json (caché de npm entre builds)
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline --no-audit --no-fund

# 2. Prisma Client: solo se regenera si cambia el esquema
COPY prisma ./prisma
RUN npx prisma generate

# 3. Código y build de Next, con su caché de compilación guardada entre deploys
COPY . .
RUN --mount=type=cache,target=/app/.next/cache npm run build

EXPOSE 3000

CMD ["sh", "-c", "node scripts/ensure-invoice-document-columns.mjs && npm start"]
