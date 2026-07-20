import { useCallback, useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import type { CrmCompanyAiAnalysisRow, CrmCompanyAiSummary } from '@/lib/analisis/types'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function healthTone(score: number) {
  if (score >= 75) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (score >= 50) return 'text-amber-800 bg-amber-50 border-amber-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

function severityTone(s: string) {
  if (s === 'critica') return 'border-red-300 bg-red-50 text-red-900'
  if (s === 'alta') return 'border-orange-300 bg-orange-50 text-orange-900'
  if (s === 'media') return 'border-amber-300 bg-amber-50 text-amber-900'
  return 'border-gray-200 bg-gray-50 text-gray-700'
}

export default function AnalisisIaPage() {
  const [analysis, setAnalysis] = useState<CrmCompanyAiAnalysisRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const loadLatest = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/analisis/ai-analysis')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setAnalysis(data.analysis || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLatest()
  }, [loadLatest])

  const run = async () => {
    setRunning(true)
    setError('')
    try {
      const res = await fetch('/api/analisis/ai-analysis', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al generar')
      setAnalysis(data.analysis)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar')
    } finally {
      setRunning(false)
    }
  }

  const s: CrmCompanyAiSummary | null = analysis?.summary ?? null

  return (
    <Layout>
      <div className="w-full max-w-6xl mx-auto space-y-6 pb-16 -mt-1">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              Inteligencia Buffalo
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              Análisis de IA
            </h1>
            <p className="mt-1 text-sm text-gray-500 max-w-xl">
              Lee la guía del CRM y los datos reales de PostgreSQL para darte un informe
              ejecutivo de comercial, proyectos, retención, finanzas, marketing y operaciones.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadLatest()}
              disabled={loading || running}
              className="gap-2"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Actualizar
            </Button>
            <Button
              type="button"
              onClick={() => void run()}
              disabled={running}
              className="gap-2 bg-gray-900 hover:bg-gray-800"
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {running ? 'Analizando…' : analysis ? 'Regenerar análisis' : 'Generar análisis'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {running && (
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900">La IA está midiendo toda la empresa…</p>
            <p className="text-xs text-gray-500 mt-1">
              Embudo, cartera Buffalo, MRR, facturas, banco, cold call, tickets y tareas.
            </p>
          </div>
        )}

        {loading && !running ? (
          <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>
        ) : !s && !running ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16 px-6 text-center">
            <Sparkles className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900">Aún no hay informe</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Genera el primero. Usa la guía interna + snapshot vivo de tus tablas.
            </p>
            <Button type="button" onClick={() => void run()} className="mt-5 gap-2">
              <Sparkles className="h-4 w-4" />
              Generar análisis
            </Button>
          </div>
        ) : s ? (
          <div className="space-y-5">
            {/* Hero */}
            <div className="rounded-2xl border border-gray-900 bg-gradient-to-br from-gray-900 via-gray-850 to-gray-900 text-white p-6 shadow-lg">
              <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/50 uppercase tracking-wide">Resumen ejecutivo</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/90 whitespace-pre-wrap">
                    {s.resumen_ejecutivo}
                  </p>
                  {analysis && (
                    <p className="mt-4 text-[11px] text-white/40">
                      {new Date(analysis.created_at).toLocaleString('es-ES')} · {analysis.model}
                    </p>
                  )}
                </div>
                <div
                  className={cn(
                    'shrink-0 rounded-2xl border px-5 py-4 text-center min-w-[140px]',
                    healthTone(s.salud_empresa_0_100)
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    Salud empresa
                  </p>
                  <p className="text-4xl font-bold tabular-nums mt-1">{s.salud_empresa_0_100}</p>
                  <p className="text-[11px] mt-0.5 opacity-70">/ 100</p>
                </div>
              </div>
            </div>

            {/* Wins / risks */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  <h2 className="text-sm font-semibold text-emerald-900">Wins</h2>
                </div>
                <ul className="space-y-2">
                  {s.wins.map((w) => (
                    <li key={w} className="text-sm text-emerald-950/80 flex gap-2">
                      <TrendingUp className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  <h2 className="text-sm font-semibold text-amber-900">Riesgos</h2>
                </div>
                <ul className="space-y-2">
                  {s.riesgos.map((r) => (
                    <li key={r} className="text-sm text-amber-950/80 flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Alerts */}
            {s.alertas.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-900">Alertas prioritarias</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {s.alertas.map((a) => (
                    <div
                      key={a.titulo + a.detalle}
                      className={cn('rounded-xl border p-4', severityTone(a.severidad))}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                        {a.severidad}
                      </p>
                      <p className="text-sm font-semibold mt-1">{a.titulo}</p>
                      <p className="text-xs mt-1 opacity-90">{a.detalle}</p>
                      <p className="text-xs font-medium mt-2 flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" />
                        {a.accion}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions + opportunities */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="h-4 w-4 text-gray-700" />
                  <h2 className="text-sm font-semibold text-gray-900">Acciones esta semana</h2>
                </div>
                <ol className="space-y-2.5 list-decimal list-inside">
                  {s.acciones_esta_semana.map((a) => (
                    <li key={a} className="text-sm text-gray-700">
                      {a}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="h-4 w-4 text-gray-700" />
                  <h2 className="text-sm font-semibold text-gray-900">Oportunidades</h2>
                </div>
                <ul className="space-y-2">
                  {s.oportunidades.map((o) => (
                    <li key={o} className="text-sm text-gray-700 flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-400 shrink-0" />
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Key metrics */}
            {s.metricas_clave.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Métricas clave</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {s.metricas_clave.map((m) => (
                    <div
                      key={m.nombre + m.valor}
                      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                    >
                      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        {m.nombre}
                      </p>
                      <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{m.valor}</p>
                      <p className="text-xs text-gray-500 mt-1">{m.interpretacion}</p>
                      {m.fuente && (
                        <p className="text-[10px] font-mono text-gray-400 mt-2 truncate">
                          {m.fuente}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sections */}
            <div className="space-y-4">
              {s.secciones.map((sec) => (
                <div
                  key={sec.titulo}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <h2 className="text-sm font-semibold text-gray-900 mb-3">{sec.titulo}</h2>
                  <ul className="space-y-2 mb-4">
                    {sec.hallazgos.map((h) => (
                      <li key={h} className="text-sm text-gray-700 flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-900 shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                  {sec.metricas && sec.metricas.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-2 pt-3 border-t border-gray-100">
                      {sec.metricas.map((m) => (
                        <div key={m.nombre + m.valor} className="rounded-xl bg-gray-50 px-3 py-2">
                          <p className="text-[10px] uppercase text-gray-400 font-medium">
                            {m.nombre}
                          </p>
                          <p className="text-sm font-semibold text-gray-900">{m.valor}</p>
                          <p className="text-[11px] text-gray-500">{m.interpretacion}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Path + gaps */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Path de crecimiento</h2>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {s.path_crecimiento}
              </p>
            </div>

            {s.huecos_dato.length > 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-2">Huecos de dato</h2>
                <ul className="space-y-1.5">
                  {s.huecos_dato.map((h) => (
                    <li key={h} className="text-sm text-gray-600">
                      · {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Layout>
  )
}
