'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles } from 'lucide-react'
import type { ProjectAiSummary } from '@/lib/gestion-proyecto/types'
import { cn } from '@/lib/utils'

interface AnalysisResult {
  summary: ProjectAiSummary
  model: string
  created_at: string
}

interface ProjectAiPanelProps {
  projectId: string
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-900 mb-1.5">{title}</p>
      <ul className="space-y-1 text-xs text-gray-600 leading-relaxed">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-gray-300 shrink-0">·</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ProjectAiPanel({ projectId }: ProjectAiPanelProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runAnalysis = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/gestion-proyecto/proyectos/${projectId}/ai-analysis`, {
        method: 'POST',
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
      <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
        <Sparkles className="h-7 w-7 text-gray-400" />
        <div>
          <p className="text-sm font-medium text-gray-900">Análisis IA del proyecto</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            La IA revisa onboarding, tareas pendientes, en curso y completadas, métricas y carga
            del equipo para darte diagnóstico, riesgos, mejoras y predicciones.
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
  const health = s.salud_proyecto_0_100 ?? 0

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
            Análisis IA · {new Date(analysis.created_at).toLocaleString('es-ES')}
          </p>
          <p className="text-sm text-gray-700 mt-2 leading-relaxed">{s.resumen_ejecutivo}</p>
          {s.estado_actual && (
            <p className="text-xs text-gray-500 mt-2 border-l-2 border-gray-200 pl-3">
              {s.estado_actual}
            </p>
          )}
        </div>
        <div className="text-center shrink-0">
          <p className={cn('text-2xl font-bold tabular-nums text-gray-900')}>{health}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Salud</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <BulletList title="Fortalezas" items={s.fortalezas} />
        <BulletList title="Riesgos" items={s.riesgos} />
        <BulletList title="Cuellos de botella" items={s.cuellos_de_botella} />
        <BulletList title="Mejoras sugeridas" items={s.mejoras_sugeridas} />
        <BulletList title="Acciones prioritarias" items={s.acciones_prioritarias} />
        <BulletList title="Predicciones y escenarios" items={s.predicciones} />
      </div>

      {s.por_persona?.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-900 mb-2">Por persona</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {s.por_persona.map((p, i) => (
              <div key={i} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                <p className="text-xs font-medium text-gray-900">{p.persona}</p>
                <p className="text-xs text-gray-600 mt-0.5">{p.situacion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Regenerar análisis
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 text-center">{error}</p>}
    </div>
  )
}
