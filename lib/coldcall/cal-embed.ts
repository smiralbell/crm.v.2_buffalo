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

interface CalQueueTarget {
  q: unknown[]
}

declare global {
  interface Window {
    Cal?: CalGlobal
  }
}

/** Bootstrap idéntico al snippet oficial de Cal.com */
export function bootstrapCalQueue() {
  if (window.Cal) return

  const w = window
  const doc = document
  const initKeyword = 'init'

  const push = (target: CalQueueTarget, args: unknown[]) => {
    target.q.push(args)
  }

  const cal = function (...args: unknown[]) {
    if (!cal.loaded) {
      cal.ns = {}
      cal.q = cal.q || []
      const script = doc.createElement('script')
      script.src = CAL_SCRIPT_URL
      doc.head.appendChild(script)
      cal.loaded = true
    }

    if (args[0] === initKeyword) {
      const api = function (...inner: unknown[]) {
        push({ q: (api as CalNamespaceApi).q || ((api as CalNamespaceApi).q = []) }, inner)
      }
      const namespace = args[1]
      ;(api as CalNamespaceApi).q = (api as CalNamespaceApi).q || []
      if (typeof namespace === 'string') {
        cal.ns[namespace] = cal.ns[namespace] || (api as CalNamespaceApi)
        push(cal.ns[namespace] as CalQueueTarget, args)
        push(cal, ['initNamespace', namespace])
      } else {
        push(cal, args)
      }
      return
    }

    push(cal, args)
  } as CalGlobal

  cal.ns = {}
  cal.q = []
  w.Cal = cal
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
