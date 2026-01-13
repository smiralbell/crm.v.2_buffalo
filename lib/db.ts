import { Pool } from 'pg'

let pool: Pool | null = null

/**
 * Obtiene o crea un pool de conexiones PostgreSQL
 * Usa SQL directo en lugar de Prisma
 */
export function getPool(): Pool {
  if (pool) {
    return pool
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está configurado en las variables de entorno')
  }

  // Parsear DATABASE_URL
  const url = new URL(process.env.DATABASE_URL)
  
  // Decodificar la contraseña en caso de que tenga caracteres especiales codificados
  const password = decodeURIComponent(url.password)
  
  pool = new Pool({
    host: url.hostname,
    port: parseInt(url.port || '5432'),
    database: url.pathname.slice(1), // Remover el '/' inicial
    user: url.username || 'postgres',
    password: password,
    max: 10, // Máximo de conexiones en el pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
  })

  // Manejar errores del pool
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err)
  })

  return pool
}

/**
 * Ejecuta una query SQL y retorna los resultados
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const pool = getPool()
  const result = await pool.query(text, params)
  return {
    rows: result.rows,
    rowCount: result.rowCount || 0,
  }
}

/**
 * Cierra el pool de conexiones (útil para tests o shutdown)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

