/**
 * Sistema de logging simple y limpio
 * En producción solo muestra errores críticos
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug'

const isDevelopment = process.env.NODE_ENV === 'development'
const isProduction = process.env.NODE_ENV === 'production'

/**
 * Logger simple que solo muestra logs importantes
 */
class Logger {
  private shouldLog(level: LogLevel): boolean {
    if (isProduction) {
      // En producción solo errores
      return level === 'error'
    }
    // En desarrollo: error, warn, info
    return level !== 'debug'
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...args)
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args)
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, ...args)
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, ...args)
    }
  }
}

export const logger = new Logger()

