import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Loader2, Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Download,
} from 'lucide-react'
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
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

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

  const downloadPdf = async () => {
    if (!reportRef.current || !analysis) return
    setDownloadingPdf(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      })
      const imageData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 10
      const contentWidth = pageWidth - margin * 2
      const contentHeight = (canvas.height * contentWidth) / canvas.width

      if (contentHeight <= pageHeight - margin * 2) {
        pdf.addImage(imageData, 'PNG', margin, margin, contentWidth, contentHeight)
      } else {
        let renderedHeight = 0
        let page = 0
        while (renderedHeight < contentHeight) {
          if (page > 0) pdf.addPage()
          const remaining = contentHeight - renderedHeight
          const sliceHeight = Math.min(pageHeight - margin * 2, remaining)
          const sourceY = (renderedHeight / contentHeight) * canvas.height
          const sourceHeight = (sliceHeight / contentHeight) * canvas.height
          const pageCanvas = document.createElement('canvas')
          pageCanvas.width = canvas.width
          pageCanvas.height = sourceHeight
          const ctx = pageCanvas.getContext('2d')
          if (!ctx) break
          ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight)
          pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, contentWidth, sliceHeight)
          renderedHeight += sliceHeight
          page++
        }
      }

      const dateStr = new Date(analysis.created_at).toISOString().slice(0, 10)
      pdf.save(`informe-financiero-buffalo-${dateStr}.pdf`)
    } catch {
      setError('No se pudo generar el PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
        <Sparkles className="h-8 w-8 text-blue-600" />
        <div>
          <p className="text-sm font-medium text-gray-900">CFO virtual con IA</p>
          <p className="text-xs text-gray-500 mt-1 max-w-xs">
            Analiza MRR, caja, cobros, pipeline y márgenes. Descarga el informe en PDF.
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
  const healthColor =
    health >= 70 ? 'text-green-600' : health >= 40 ? 'text-orange-600' : 'text-red-600'

  return (
    <div className="space-y-4">
      <div ref={reportRef} className="space-y-4 bg-white p-1 rounded-lg">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-gray-900 uppercase tracking-wide">
              Informe CFO · Buffalo AI
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {new Date(analysis.created_at).toLocaleString('es-ES')} · {analysis.model}
            </p>
            <p className="text-sm text-gray-700 mt-2 leading-relaxed">{s.resumen_ejecutivo}</p>
          </div>
          <div className="text-center flex-shrink-0">
            <p className={cn('text-2xl font-bold tabular-nums', healthColor)}>{health}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Salud</p>
          </div>
        </div>

        {s.metricas_clave?.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {s.metricas_clave.slice(0, 4).map((m) => (
              <div key={m.nombre} className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                <p className="text-[10px] text-gray-500 uppercase">{m.nombre}</p>
                <p className="text-sm font-semibold text-gray-900">{m.valor}</p>
                {m.interpretacion && (
                  <p className="text-[10px] text-gray-500 mt-0.5">{m.interpretacion}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-3 text-xs">
          {s.wins?.length > 0 && (
            <div>
              <p className="font-semibold text-green-700 flex items-center gap-1 mb-1">
                <CheckCircle2 className="h-3 w-3" /> Wins
              </p>
              <ul className="space-y-1 text-gray-600">
                {s.wins.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          )}
          {s.riesgos?.length > 0 && (
            <div>
              <p className="font-semibold text-red-600 flex items-center gap-1 mb-1">
                <AlertTriangle className="h-3 w-3" /> Riesgos
              </p>
              <ul className="space-y-1 text-gray-600">
                {s.riesgos.map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
            </div>
          )}
          {s.acciones_esta_semana?.length > 0 && (
            <div>
              <p className="font-semibold text-blue-700 flex items-center gap-1 mb-1">
                <TrendingUp className="h-3 w-3" /> Esta semana
              </p>
              <ul className="space-y-1 text-gray-600">
                {s.acciones_esta_semana.map((a, i) => (
                  <li key={i}>• {a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {s.path_a_objetivo && (
          <p className="text-xs text-gray-700 bg-blue-50 border border-blue-100 rounded-lg p-3">
            <span className="font-semibold text-blue-900">Path al objetivo (250k€): </span>
            {s.path_a_objetivo}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={downloadPdf} disabled={downloadingPdf} className="flex-1 gap-2">
          {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Descargar PDF
        </Button>
        <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading} className="flex-1 gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 text-center">{error}</p>}
    </div>
  )
}
