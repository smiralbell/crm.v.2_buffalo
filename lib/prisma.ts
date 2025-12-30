import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Crear Prisma Client de forma lazy para evitar errores durante el build
function createPrismaClient(): PrismaClient {
  // Verificar que DATABASE_URL esté configurado solo cuando se usa
  // Durante el build, permitir que continúe sin lanzar error
  if (!process.env.DATABASE_URL) {
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      // Durante el build, retornar un cliente mock que no se conectará realmente
      // Esto permitirá que el build continúe
      return {} as PrismaClient
    }
    throw new Error('DATABASE_URL no está configurado en las variables de entorno')
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

// Obtener o crear el cliente Prisma
function getPrismaClient(): PrismaClient {
  // Durante el build, si DATABASE_URL no está disponible, retornar un objeto mock
  if (!process.env.DATABASE_URL && process.env.NEXT_PHASE === 'phase-production-build') {
    return {} as PrismaClient
  }

  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }

  const client = createPrismaClient()

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }

  return client
}

// Proxy para inicialización lazy - solo se inicializa cuando se accede a una propiedad
// Esto evita errores durante el build cuando DATABASE_URL no está disponible
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient()
    
    // Si el cliente es un objeto vacío (durante build sin DATABASE_URL), retornar métodos mock
    if (Object.keys(client).length === 0 && !process.env.DATABASE_URL && process.env.NEXT_PHASE === 'phase-production-build') {
      // Retornar un proxy para modelos que tenga métodos mock
      return new Proxy({}, {
        get(_modelTarget, modelProp) {
          if (modelProp === 'findMany') {
            return () => Promise.resolve([])
          }
          if (modelProp === 'findUnique' || modelProp === 'findFirst') {
            return () => Promise.resolve(null)
          }
          if (modelProp === 'create' || modelProp === 'update' || modelProp === 'delete' || modelProp === 'upsert') {
            return () => Promise.resolve({} as any)
          }
          return () => Promise.resolve([])
        }
      })
    }
    
    const value = (client as any)[prop]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

