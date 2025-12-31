import { NextApiResponse } from 'next'
import { z } from 'zod'

/**
 * Maneja errores de API de forma consistente
 */
export function handleApiError(error: unknown, res: NextApiResponse) {
  // Errores de autenticación ya fueron manejados
  if (error instanceof Error && 
      (error.message === 'No session' || 
       error.message === 'Invalid token' || 
       error.message === 'Invalid session data' ||
       error.message === 'Session expired')) {
    return // Ya se envió la respuesta
  }

  // Errores de validación Zod
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    })
  }

  // Errores de Prisma
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as { code: string; meta?: any }
    
    switch (prismaError.code) {
      case 'P2002':
        return res.status(409).json({
          error: 'Ya existe un registro con estos datos',
        })
      case 'P2025':
        return res.status(404).json({
          error: 'Registro no encontrado',
        })
      case 'P2003':
        return res.status(400).json({
          error: 'Referencia inválida',
        })
      case 'P2014':
        return res.status(400).json({
          error: 'Violación de restricción de relación',
        })
    }
  }

  // Error genérico
  console.error('API Error:', error)
  return res.status(500).json({
    error: 'Error interno del servidor',
  })
}

/**
 * Parámetros de paginación
 */
export interface PaginationParams {
  page: number
  pageSize: number
  skip: number
}

/**
 * Obtiene parámetros de paginación desde query params
 */
export function getPaginationParams(query: any, defaultPageSize = 10): PaginationParams {
  const page = Math.max(1, parseInt(query.page as string) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize as string) || defaultPageSize))
  const skip = (page - 1) * pageSize

  return { page, pageSize, skip }
}

/**
 * Respuesta de paginación
 */
export interface PaginationResponse {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/**
 * Crea respuesta de paginación
 */
export function createPaginationResponse(
  page: number,
  pageSize: number,
  total: number
): PaginationResponse {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Valida formato UUID
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

/**
 * Serializa fechas a ISO string
 */
export function serializeDate(date: Date | null | undefined): string | null {
  if (!date) return null
  return date.toISOString()
}

/**
 * Serializa objeto con fechas
 */
export function serializeDates<T extends Record<string, any>>(obj: T): T {
  const serialized = { ...obj } as any
  
  for (const key in serialized) {
    const value = serialized[key]
    if (value instanceof Date) {
      serialized[key] = value.toISOString()
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      serialized[key] = serializeDates(value)
    }
  }
  
  return serialized as T
}

