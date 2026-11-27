/**
 * Parar ejecuciones largas de Retención (informe del sistema, flujos propios e
 * informes de calidad). El CRM corre en un solo proceso: basta con una marca en memoria.
 *
 * Una ejecución comprueba la marca entre pasos (`checkStop`) y envuelve las llamadas
 * largas a la IA o al MCP con `raceStop`, que corta la espera en cuanto se pide parar.
 */

const stops = new Map<string, number>()

/** Ejecuciones que se están haciendo ahora mismo (para saber si hay algo que parar). */
const running = new Set<string>()

export class RunStopped extends Error {
  constructor() {
    super('Parado a mano')
    this.name = 'RunStopped'
  }
}

export function requestStop(key: string): boolean {
  if (!running.has(key)) return false
  stops.set(key, Date.now())
  return true
}

export function isStopRequested(key: string): boolean {
  return stops.has(key)
}

export function checkStop(key: string): void {
  if (stops.has(key)) throw new RunStopped()
}

export function markRunning(key: string): void {
  stops.delete(key)
  running.add(key)
}

export function markFinished(key: string): void {
  running.delete(key)
  stops.delete(key)
}

export function isRunning(key: string): boolean {
  return running.has(key)
}

/** Espera `p`, pero se corta con `RunStopped` en cuanto se pide parar (lo de dentro sigue y se ignora). */
export function raceStop<T>(key: string, p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false
    const t = setInterval(() => {
      if (!done && stops.has(key)) {
        done = true
        clearInterval(t)
        reject(new RunStopped())
      }
    }, 400)
    p.then(
      (v) => {
        if (done) return
        done = true
        clearInterval(t)
        resolve(v)
      },
      (e) => {
        if (done) return
        done = true
        clearInterval(t)
        reject(e)
      }
    )
  })
}
