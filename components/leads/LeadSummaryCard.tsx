import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Sparkles } from 'lucide-react'

type Summary = { summary: string | null; generated_at: string | null; stale: boolean; has_content: boolean }

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'ahora mismo'
  if (mins < 60) return `hace ${mins} min`
  const h = Math.round(mins / 60)
  if (h < 24) return `hace ${h} h`
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

/**
 * Resumen del lead hecho con IA. Se regenera solo cuando hay contenido nuevo de valor
 * (correos, reuniones, mensajes, notas o documentos); no por que el lead entre o cambie de estado.
 */
export default function LeadSummaryCard({ leadId, refreshKey = 0 }: { leadId: number; refreshKey?: number }) {
  const [data, setData] = useState<Summary | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const autoTried = useRef(false)

  const regenerate = useCallback(async () => {
    setWorking(true)
    setError('')
    try {
      const res = await fetch(`/api/leads/${leadId}/resumen`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((d as { error?: string }).error || 'No se pudo generar el resumen')
      setData(d as Summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el resumen')
    } finally {
      setWorking(false)
    }
  }, [leadId])

  useEffect(() => {
    autoTried.current = false
    fetch(`/api/leads/${leadId}/resumen`)
      .then(async (r) => (r.ok ? ((await r.json()) as Summary) : null))
      .then((d) => {
        if (!d) return
        setData(d)
        // Hay contenido nuevo: se actualiza solo, una vez
        if (d.stale && !autoTried.current) {
          autoTried.current = true
          void regenerate()
        }
      })
      .catch(() => setError('No se pudo cargar el resumen'))
  }, [leadId, regenerate, refreshKey])

  return (
    <section className="h-full rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 via-white to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          Resumen del contexto
        </h2>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          {working ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Actualizando con lo último…
            </span>
          ) : (
            data?.generated_at && <span>Actualizado {ago(data.generated_at)}</span>
          )}
          {data?.has_content && (
            <button
              type="button"
              onClick={() => void regenerate()}
              disabled={working}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-gray-600 hover:bg-white hover:text-gray-900 disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" /> Regenerar
            </button>
          )}
        </div>
      </div>

      <div className="mt-3">
        {!data ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : !data.has_content ? (
          <p className="text-sm text-gray-500">
            Todavía no hay correos, reuniones, mensajes ni notas de este lead. El resumen aparecerá en cuanto haya contenido.
          </p>
        ) : data.summary ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{data.summary}</p>
        ) : working ? (
          <p className="text-sm text-gray-400">Preparando el primer resumen…</p>
        ) : (
          <p className="text-sm text-gray-500">Sin resumen todavía.</p>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </section>
  )
}
