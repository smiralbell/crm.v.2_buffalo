import { dueFlujos } from '@/lib/retencion/flujos/store'
import { runFlujo } from '@/lib/retencion/flujos/runner'

const running = new Set<string>()

/** Ejecuta los flujos con disparador de tiempo que toca. Un flujo no se solapa consigo mismo. */
export async function runDueFlujos(): Promise<number> {
  const due = await dueFlujos(5)
  let started = 0
  for (const flujo of due) {
    if (running.has(flujo.id)) continue
    running.add(flujo.id)
    started++
    try {
      await runFlujo(flujo, 'cron')
    } catch (e) {
      console.warn('[retencion-flujos]', flujo.id, e instanceof Error ? e.message : e)
    } finally {
      running.delete(flujo.id)
    }
  }
  return started
}
