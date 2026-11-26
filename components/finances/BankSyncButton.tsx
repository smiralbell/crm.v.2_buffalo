import { useCallback, useEffect, useRef, useState } from 'react'
import { Landmark, Loader2, RefreshCw } from 'lucide-react'

function ago(iso: string | null): string {
  if (!iso) return 'nunca'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'ahora mismo'
  if (mins < 60) return `hace ${mins} min`
  const h = Math.round(mins / 60)
  if (h < 24) return `hace ${h} h`
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

/**
 * Trae del banco los movimientos nuevos al abrir la página (con usuario presente, así que
 * no cuenta para el límite diario de PSD2) y deja un botón para hacerlo a mano.
 * Si entra algo nuevo, avisa con `onNew` para recargar los datos.
 */
export default function BankSyncButton({ onNew }: { onNew: (inserted: number) => void }) {
  const [syncing, setSyncing] = useState(false)
  const [last, setLast] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const started = useRef(false)

  const sync = useCallback(
    async (auto: boolean) => {
      setSyncing(true)
      setMsg('')
      try {
        const res = await fetch(`/api/bank/sync${auto ? '?auto=1' : ''}`, { method: 'POST' })
        const d = (await res.json().catch(() => ({}))) as {
          inserted?: number
          last_synced_at?: string
          last_synced_at_after?: string
          error?: string
          message?: string
        }
        if (!res.ok) {
          if (res.status === 404) setMsg('Sin conexión bancaria')
          else if (!auto) setMsg(d.message || d.error || 'El banco no ha respondido')
          return
        }
        setLast(d.last_synced_at_after || d.last_synced_at || new Date().toISOString())
        const n = d.inserted ?? 0
        if (n > 0) {
          setMsg(`${n} movimiento${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'}`)
          onNew(n)
        } else if (!auto) {
          setMsg('Ya estaba al día')
        }
      } catch {
        if (!auto) setMsg('No se pudo conectar con el banco')
      } finally {
        setSyncing(false)
      }
    },
    [onNew]
  )

  useEffect(() => {
    if (started.current) return
    started.current = true
    fetch('/api/bank/connection-status')
      .then(async (r) => (r.ok ? ((await r.json()) as { connected?: boolean; last_synced_at?: string | null }) : null))
      .then((s) => {
        if (!s?.connected) return
        setLast(s.last_synced_at ?? null)
        void sync(true)
      })
      .catch(() => undefined)
  }, [sync])

  return (
    <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white pl-3 pr-1 text-xs text-slate-500">
      <Landmark className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="whitespace-nowrap">
        {syncing ? 'Actualizando con el banco…' : msg || `Banco: ${ago(last)}`}
      </span>
      <button
        type="button"
        onClick={() => void sync(false)}
        disabled={syncing}
        title="Traer ahora los movimientos nuevos del banco"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
      >
        {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
