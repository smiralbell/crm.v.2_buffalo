import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { FinanceAiSummary } from '@/lib/finance/types'
import { cn } from '@/lib/utils'

interface Props {
  initialAnalysis: {
    summary: FinanceAiSummary
    model: string
    created_at: string
  } | null
}

export default function FinanceAiPanel({ initialAnalysis }: Props) {
  const [analysis, setAnalysis] = useState(initialAnalysis)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runAnalysis = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/ai-analysis', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al generar análisis')
        return
      }
      setAnalysis(data.analysis)
    } catch {
      setError('Error de conexión al generar análisis')
    } finally {
      setLoading(false)
    }
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
        <Sparkles className="h-8 w-8 text-gray-400" />
        <div>
          <p className="text-sm font-medium text-gray-900">CFO virtual con IA</p>
          <p className="text-xs text-gray-500 mt-1 max-w-xs">
            Analiza MRR, caja, cobros, pipeline y márgenes. Genera consejos accionables con OpenRouter.
          </p>
        </div>
        <Button onClick={runAnalysis} disabled={loading} size="sm" className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generar análisis
        </Button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    )
  }

  const s = analysis.summary
  const health = s.salud_financiera_0_100 ?? 0
  const healthColor = 'text-gray-900'

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500">
              {new Date(analysis.created_at).toLocaleString('es-ES')} · {analysis.model}
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-2 leading-relaxed">{s.resumen_ejecutivo}</p>
        </div>
        <div className="text-center flex-shrink-0">
          <p className={cn('text-2xl font-bold', healthColor)}>{health}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Salud</p>
        </div>
      </div>

      {s.metricas_clave?.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {s.metricas_clave.slice(0, 4).map((m) => (
            <div key={m.nombre} className="bg-gray-50 rounded-lg p-2">
              <p className="text-[10px] text-gray-500 uppercase">{m.nombre}</p>
              <p className="text-sm font-semibold text-gray-900">{m.valor}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3 text-xs">
        {s.wins?.length > 0 && (
          <div>
            <p className="font-semibold text-gray-900 flex items-center gap-1 mb-1">
              <CheckCircle2 className="h-3 w-3" /> Wins
            </p>
            <ul className="space-y-1 text-gray-600">
              {s.wins.slice(0, 3).map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          </div>
        )}
        {s.riesgos?.length > 0 && (
          <div>
            <p className="font-semibold text-gray-900 flex items-center gap-1 mb-1">
              <AlertTriangle className="h-3 w-3" /> Riesgos
            </p>
            <ul className="space-y-1 text-gray-600">
              {s.riesgos.slice(0, 3).map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          </div>
        )}
        {s.acciones_esta_semana?.length > 0 && (
          <div>
            <p className="font-semibold text-gray-900 flex items-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3" /> Esta semana
            </p>
            <ul className="space-y-1 text-gray-600">
              {s.acciones_esta_semana.slice(0, 3).map((a, i) => (
                <li key={i}>• {a}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {s.path_a_objetivo && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <span className="font-semibold text-gray-900">Path al objetivo (250k€): </span>
          {s.path_a_objetivo}
        </p>
      )}

      <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading} className="w-full gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Actualizar análisis IA
      </Button>
      {error && <p className="text-xs text-red-600 text-center">{error}</p>}
    </div>
  )
}
