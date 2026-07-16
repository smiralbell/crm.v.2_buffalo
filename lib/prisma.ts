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

  // Configurar connection pool en DATABASE_URL si no está presente
  let databaseUrl = process.env.DATABASE_URL || ''
  
  // Si no tiene parámetros de pool, agregarlos
  if (databaseUrl && !databaseUrl.includes('connection_limit')) {
    const separator = databaseUrl.includes('?') ? '&' : '?'
    databaseUrl = `${databaseUrl}${separator}connection_limit=10&pool_timeout=20`
  }

  return new PrismaClient({
    // Solo logs de errores, sin queries ni warnings verbosos
    log: ['error'],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  })
}

// Obtener o crear el cliente Prisma
export function getPrismaClient(): PrismaClient {
  // Durante el build, si DATABASE_URL no está disponible, retornar un objeto mock
  if (!process.env.DATABASE_URL && process.env.NEXT_PHASE === 'phase-production-build') {
    return {} as PrismaClient
  }

  // Reutilizar el cliente existente si ya existe (tanto en desarrollo como en producción)
  if (globalForPrisma.prisma) {
    const existing = globalForPrisma.prisma
    // Tras `prisma generate` con modelos nuevos, el proceso puede seguir con una instancia antigua
    // sin delegados (p. ej. evaluationProject / pipelineStage). Forzar recreación.
    const stale =
      process.env.NODE_ENV === 'development' &&
      (typeof (existing as unknown as { evaluationProject?: unknown }).evaluationProject ===
        'undefined' ||
        typeof (existing as unknown as { pipelineStage?: unknown }).pipelineStage ===
          'undefined' ||
        typeof (existing as unknown as { pipelineKanban?: unknown }).pipelineKanban ===
          'undefined')
    if (stale) {
      void existing.$disconnect().catch(() => {})
      globalForPrisma.prisma = undefined
    } else {
      return existing
    }
  }

  const client = createPrismaClient()

  // Guardar el cliente en global para reutilizarlo (importante para evitar múltiples conexiones)
  globalForPrisma.prisma = client

  // Cerrar conexiones cuando la aplicación se cierra
  if (typeof process !== 'undefined') {
    process.on('beforeExit', async () => {
      await client.$disconnect()
    })
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

