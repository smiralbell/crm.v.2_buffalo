'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, AlertTriangle, CheckCircle2, Search } from 'lucide-react'
import type { ExpenseAiSummary } from '@/lib/finance/types'
import { cn } from '@/lib/utils'

interface AnalysisResult {
  summary: ExpenseAiSummary
  model: string
  created_at: string
}

export default function ExpenseAiPanel({
  periodStart,
  periodEnd,
}: {
  periodStart: string
  periodEnd: string
}) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runAnalysis = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/expenses-ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: periodStart, end: periodEnd }),
      })
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
      <div className="flex flex-col items-center justify-center py-10 gap-4 text-center min-h-[280px]">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">Análisis inteligente de gastos</p>
          <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed">
            Detecta brechas de clasificación, gastos sin factura, fugas SaaS y oportunidades de ahorro
            en el período seleccionado.
          </p>
        </div>
        <Button onClick={runAnalysis} disabled={loading} size="sm" className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Analizar gastos con IA
        </Button>
        {error && <p className="text-xs text-rose-600 max-w-sm">{error}</p>}
      </div>
    )
  }

  const s = analysis.summary
  const score = s.control_gastos_0_100 ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
            Análisis IA · Gastos
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {new Date(analysis.created_at).toLocaleString('es-ES')} · {analysis.model}
          </p>
          <p className="text-sm text-slate-700 mt-2 leading-relaxed">{s.resumen}</p>
        </div>
        <div className="text-center shrink-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <p className={cn('text-xl font-bold tabular-nums text-slate-900')}>{score}</p>
          <p className="text-[9px] text-slate-400 uppercase tracking-wide">Control</p>
        </div>
      </div>

      {s.brechas?.length > 0 && (
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-3">
          <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5 mb-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Brechas detectadas
          </p>
          <ul className="space-y-1 text-xs text-amber-950/80">
            {s.brechas.map((b, i) => (
              <li key={i}>• {b}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        {s.ahorros_detectados?.length > 0 && (
          <div>
            <p className="font-semibold text-slate-900 flex items-center gap-1 mb-1.5">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Ahorro potencial
            </p>
            <ul className="space-y-1 text-slate-600">
              {s.ahorros_detectados.map((a, i) => (
                <li key={i}>• {a}</li>
              ))}
            </ul>
          </div>
        )}
        {s.riesgos?.length > 0 && (
          <div>
            <p className="font-semibold text-slate-900 flex items-center gap-1 mb-1.5">
              <AlertTriangle className="h-3 w-3" />
              Riesgos
            </p>
            <ul className="space-y-1 text-slate-600">
              {s.riesgos.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {s.por_categoria?.length > 0 && (
        <div className="space-y-1.5 border-t border-slate-100 pt-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Por categoría</p>
          {s.por_categoria.map((c) => (
            <div key={c.categoria} className="text-xs">
              <span className="font-medium text-slate-800">{c.categoria}: </span>
              <span className="text-slate-600">{c.situacion}</span>
            </div>
          ))}
        </div>
      )}

      {s.acciones_prioritarias?.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <p className="text-xs font-semibold text-slate-900 mb-1.5">Acciones prioritarias</p>
          <ol className="space-y-1 text-xs text-slate-700 list-decimal list-inside">
            {s.acciones_prioritarias.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading} className="w-full gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Actualizar análisis
      </Button>
      {error && <p className="text-xs text-rose-600 text-center">{error}</p>}
    </div>
  )
}
