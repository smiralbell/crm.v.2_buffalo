import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'

/**
 * Health Check Endpoint
 * 
 * Este endpoint verifica que la aplicación esté funcionando correctamente:
 * - Responde 200 si todo está OK
 * - Responde 500 si hay problemas (BD desconectada, etc.)
 * 
 * Configuración en EasyPanel:
 * - Path: /api/health
 * - Expected Status: 200
 * - Interval: 30 segundos (recomendado)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Solo acepta GET
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      status: 'error',
      error: 'Method not allowed',
      timestamp: new Date().toISOString(),
    })
  }

  try {
    // Verificar que DATABASE_URL esté configurado
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({
        status: 'error',
        database: 'not_configured',
        message: 'DATABASE_URL no está configurado',
        timestamp: new Date().toISOString(),
      })
    }

    // Verificar conexión a la base de datos
    // Usamos una query simple y rápida
    await prisma.$queryRaw`SELECT 1`

    // Si llegamos aquí, todo está OK
    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      environment: process.env.NODE_ENV || 'unknown',
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    // Error al conectar con la base de datos
    console.error('Health check failed:', error)
    
    return res.status(500).json({
      status: 'error',
      database: 'disconnected',
      message: error?.message || 'Error desconocido',
      timestamp: new Date().toISOString(),
    })
  }
}

