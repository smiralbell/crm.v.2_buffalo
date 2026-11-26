import { AsyncLocalStorage } from 'async_hooks'

/**
 * Datos de la persona conectada (PSU) en una sincronización que lanza alguien desde el CRM.
 *
 * Por PSD2, si el banco no sabe que hay una persona delante, solo deja unas 4 consultas
 * al día por cuenta (y luego las rechaza). Mandando la IP y el navegador de quien está
 * usando el CRM, la consulta cuenta como «con usuario presente» y no tiene ese límite.
 */
export type PsuContext = { ip: string; userAgent: string }

const storage = new AsyncLocalStorage<PsuContext>()

export function withPsu<T>(psu: PsuContext | null, fn: () => Promise<T>): Promise<T> {
  return psu ? storage.run(psu, fn) : fn()
}

/** Cabeceras PSU para Enable Banking (vacías si la consulta es en segundo plano). */
export function psuHeaders(): Record<string, string> {
  const psu = storage.getStore()
  if (!psu) return {}
  return {
    'Psu-Ip-Address': psu.ip,
    'Psu-User-Agent': psu.userAgent.slice(0, 500),
  }
}

/** La IP y el navegador de una petición del CRM. */
export function psuFromRequest(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): PsuContext | null {
  const fwd = req.headers['x-forwarded-for']
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
  const real = req.headers['x-real-ip']
  const ip = first || (Array.isArray(real) ? real[0] : real) || req.socket?.remoteAddress || ''
  const ua = req.headers['user-agent']
  const userAgent = Array.isArray(ua) ? ua[0] : ua || ''
  if (!ip || !userAgent) return null
  return { ip: ip.replace(/^::ffff:/, ''), userAgent }
}
