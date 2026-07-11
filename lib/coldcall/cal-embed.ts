const CAL_SCRIPT_URL = 'https://app.cal.com/embed/embed.js'

export interface CalGlobal {
  loaded?: boolean
  ns: Record<string, CalNamespaceApi>
  q: unknown[]
  config?: { forwardQueryParams?: boolean }
  (instruction: string, ...args: unknown[]): void
}

interface CalNamespaceApi {
  (...args: unknown[]): void
  q?: unknown[]
}

declare global {
  interface Window {
    Cal?: CalGlobal
  }
}

/** Bootstrap idéntico al snippet oficial de Cal.com */
export function bootstrapCalQueue() {
  if (window.Cal) return

  ;(function (C: Window, A: string, L: string) {
    const p = function (a: { q: unknown[] }, ar: unknown[]) {
      a.q.push(ar)
    }
    const d = C.document
    C.Cal =
      C.Cal ||
      function (...args: unknown[]) {
        const cal = C.Cal!
        const ar = args
        if (!cal.loaded) {
          cal.ns = {}
          cal.q = cal.q || []
          d.head.appendChild(d.createElement('script')).src = A
          cal.loaded = true
        }
        if (ar[0] === L) {
          const api = function (...inner: unknown[]) {
            p(api as { q: unknown[] }, inner)
          }
          const namespace = ar[1]
          ;(api as CalNamespaceApi).q = (api as CalNamespaceApi).q || []
          if (typeof namespace === 'string') {
            cal.ns[namespace] = cal.ns[namespace] || (api as CalNamespaceApi)
            p(cal.ns[namespace] as { q: unknown[] }, ar)
            p(cal, ['initNamespace', namespace])
          } else {
            p(cal, ar)
          }
          return
        }
        p(cal, ar)
      }
  })(window, CAL_SCRIPT_URL, 'init')
}

export function loadCalEmbed(): Promise<CalGlobal> {
  bootstrapCalQueue()
  if (!window.Cal) {
    return Promise.reject(new Error('No se pudo inicializar Cal.com'))
  }
  return Promise.resolve(window.Cal)
}

export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
