import { runDueWatches } from '@/lib/retencion/watch-agent'

declare global {
  // eslint-disable-next-line no-var
  var __buffaloRetencionWatch: boolean | undefined
}

export function startRetencionWatchScheduler(): void {
  if (globalThis.__buffaloRetencionWatch) return
  if (process.env.RETENCION_WATCH === '0') return
  globalThis.__buffaloRetencionWatch = true

  const tick = () => {
    void runDueWatches().catch((e) => {
      console.warn('[retencion-watch]', e instanceof Error ? e.message : e)
    })
  }

  setTimeout(tick, 60_000)
  setInterval(tick, 15 * 60_000)
}
