/**
 * Rate Limiting simple en memoria
 * Para producción, usar Redis o servicio externo
 */

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

/**
 * Limpia entradas expiradas del store
 */
function cleanExpired() {
  const now = Date.now()
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key]
    }
  }
}

/**
 * Rate limit simple
 * @param identifier Identificador único (IP, user ID, etc.)
 * @param maxRequests Máximo de requests
 * @param windowMs Ventana de tiempo en milisegundos
 * @returns true si está dentro del límite, false si excedió
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetTime: number } {
  // Limpiar entradas expiradas cada 100 requests (aproximadamente)
  if (Math.random() < 0.01) {
    cleanExpired()
  }

  const now = Date.now()
  const entry = store[identifier]

  if (!entry || entry.resetTime < now) {
    // Nueva ventana
    store[identifier] = {
      count: 1,
      resetTime: now + windowMs,
    }
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs,
    }
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    }
  }

  entry.count++
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetTime: entry.resetTime,
  }
}

/**
 * Obtiene IP del request
 */
export function getClientIP(req: any): string {
  const forwarded = req.headers['x-forwarded-for']
  const realIP = req.headers['x-real-ip']
  
  if (forwarded) {
    return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim()
  }
  
  if (realIP) {
    return realIP
  }
  
  return req.socket?.remoteAddress || 'unknown'
}

/**
 * Middleware de rate limiting para API routes
 */
export function rateLimitMiddleware(
  maxRequests: number = 100,
  windowMs: number = 60000 // 1 minuto por defecto
) {
  return (req: any, res: any, next?: () => void) => {
    const ip = getClientIP(req)
    const result = checkRateLimit(ip, maxRequests, windowMs)

    if (!result.allowed) {
      res.setHeader('X-RateLimit-Limit', maxRequests)
      res.setHeader('X-RateLimit-Remaining', result.remaining)
      res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString())
      return res.status(429).json({
        error: 'Demasiadas solicitudes. Por favor, intenta más tarde.',
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      })
    }

    res.setHeader('X-RateLimit-Limit', maxRequests)
    res.setHeader('X-RateLimit-Remaining', result.remaining)
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString())

    if (next) next()
  }
}


