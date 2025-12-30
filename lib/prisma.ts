import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Crear Prisma Client de forma lazy para evitar errores durante el build
function createPrismaClient(): PrismaClient {
  // Verificar que DATABASE_URL esté configurado solo cuando se usa
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está configurado en las variables de entorno')
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

// Obtener o crear el cliente Prisma
function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }

  const client = createPrismaClient()

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }

  return client
}

// Exportar prisma - inicializar directamente para evitar problemas con el proxy
export const prisma = getPrismaClient()

