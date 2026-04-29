import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { requireAuth } from '@/lib/auth'
import { getEvaluationProjectDetail } from '@/lib/evaluation-projects'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react'

type Entry = { id: number; body: string; rating: number | null; created_at: string }
type Analysis = {
  id: number
  summary_json: Record<string, unknown>
  model: string | null
  created_at: string
} | null

interface Props {
  initial: {
    project: {
      id: number
      name: string
      client_name: string | null
      is_active: boolean
      tags: string[]
      opened_at: string
      closed_at: string | null
      days_open: number
      avg_rating: number | null
    }
    entries: Entry[]
    latest_analysis: Analysis
    last_entry_for_context: { body: string; created_at: string } | null
  }
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }

  const id = parseInt(String(context.params?.id), 10)
  if (Number.isNaN(id)) {
    return { notFound: true }
  }

  try {
    const data = await getEvaluationProjectDetail(id)
    if (!data) {
      return { notFound: true }
    }
    return {
      props: {
        initial: {
          project: data.project,
          entries: data.entries,
          latest_analysis: data.latest_analysis,
          last_entry_for_context: data.last_entry_for_context,
        },
      },
    }
  } catch (e) {
    console.error('[proyecto id GSSP]', e)
    return { notFound: true }
  }
}

function formatDatetimeLocalValue(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function formatShort(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium text-gray-500">{children}</p>
}

function AnalysisView({ data, dark = false }: { data: Record<string, unknown>; dark?: boolean }) {
  const str = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x)) : [])
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const textStrong = dark ? 'text-slate-100' : 'text-gray-900'
  const textSoft = dark ? 'text-slate-300' : 'text-gray-700'
  const labelSoft = dark ? 'text-slate-400' : 'text-gray-500'
  const borderSoft = dark ? 'border-slate-800' : 'border-gray-100'
  const panelSoft = dark ? 'border-slate-800 bg-slate-900/60' : 'border-gray-200 bg-gray-50'

  const resumen = str(data.resumen_ejecutivo ?? '')
  const timeline = Array.isArray(data.timeline) ? data.timeline : []
  const kpis = Array.isArray(data.kpis_o_señales) ? data.kpis_o_señales : []
  const contratos = arr(data.contratos_y_compromisos)
  const bien = arr(data.hecho_bien)
  const mal = arr(data.hecho_mal_o_riesgos)
  const mejoras = arr(data.mejoras_sugeridas)
  const plan30 = Array.isArray(data.plan_30_dias) ? data.plan_30_dias : []
  const alertas = arr(data.alertas_tempranas)
  const preguntas = arr(data.preguntas_abiertas)
  const diagnostico =
    data.diagnostico_rapido && typeof data.diagnostico_rapido === 'object'
      ? (data.diagnostico_rapido as Record<string, unknown>)
      : null

  const saludGeneral = diagnostico ? num(diagnostico.salud_general_0_100) : null
  const riesgoEntrega = diagnostico ? num(diagnostico.riesgo_entrega_0_100) : null
  const riesgoCliente = diagnostico ? num(diagnostico.riesgo_cliente_0_100) : null
  const momentoActual = diagnostico ? str(diagnostico.momento_actual ?? '') : ''

  const block = (title: string, child: ReactNode) => (
    <div className={`border-b py-4 last:border-0 last:pb-0 first:pt-0 ${borderSoft}`}>
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-2">{child}</div>
    </div>
  )

  return (
    <div className={`text-sm ${dark ? 'text-slate-200' : ''}`}>
      {(saludGeneral != null || riesgoEntrega != null || riesgoCliente != null || momentoActual) && (
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          {saludGeneral != null && (
            <div className={`rounded-xl border p-3 ${panelSoft}`}>
              <p className={`text-xs ${labelSoft}`}>Salud general</p>
              <p className={`mt-1 text-xl font-semibold ${textStrong}`}>{saludGeneral}/100</p>
            </div>
          )}
          {riesgoEntrega != null && (
            <div className={`rounded-xl border p-3 ${panelSoft}`}>
              <p className={`text-xs ${labelSoft}`}>Riesgo entrega</p>
              <p className={`mt-1 text-xl font-semibold ${textStrong}`}>{riesgoEntrega}/100</p>
            </div>
          )}
          {riesgoCliente != null && (
            <div className={`rounded-xl border p-3 ${panelSoft}`}>
              <p className={`text-xs ${labelSoft}`}>Riesgo cliente</p>
              <p className={`mt-1 text-xl font-semibold ${textStrong}`}>{riesgoCliente}/100</p>
            </div>
          )}
          {momentoActual && (
            <div className={`rounded-xl border p-3 md:col-span-1 ${panelSoft}`}>
              <p className={`text-xs ${labelSoft}`}>Momento actual</p>
              <p className={`mt-1 text-sm font-medium ${textStrong}`}>{momentoActual}</p>
            </div>
          )}
        </div>
      )}
      {resumen && block('Resumen', <p className={`whitespace-pre-wrap leading-relaxed ${textStrong}`}>{resumen}</p>)}
      {timeline.length > 0 &&
        block(
          'Línea de tiempo',
          <ul className="space-y-3">
            {timeline.map((item, i) => {
              const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
              const periodo = str(obj.periodo ?? `Periodo ${i + 1}`)
              const hechos = Array.isArray(obj.hechos_clave) ? obj.hechos_clave.map((x) => str(x)) : []
              return (
                <li key={i} className={textStrong}>
                  <p className={`font-medium ${textStrong}`}>{periodo}</p>
                  {hechos.length > 0 && (
                    <ul className={`mt-1.5 list-inside list-disc space-y-0.5 ${textSoft}`}>
                      {hechos.map((h, j) => (
                        <li key={j}>{h}</li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      {kpis.length > 0 &&
        block(
          'Indicadores y señales',
          <ul className="space-y-2">
            {kpis.map((k, i) => {
              const obj = k && typeof k === 'object' ? (k as Record<string, unknown>) : {}
              return (
                <li key={i} className={textStrong}>
                  <span className="font-medium">{str(obj.nombre ?? '')}</span>
                  {obj.detalle != null && <span className={textSoft}> — {str(obj.detalle)}</span>}
                </li>
              )
            })}
          </ul>
        )}
      {contratos.length > 0 &&
        block(
          'Contratos y compromisos',
          <ul className={`list-inside list-disc space-y-1 ${textSoft}`}>
            {contratos.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
      {(bien.length > 0 || mal.length > 0 || mejoras.length > 0) && (
        <div className={`grid gap-6 border-t pt-4 md:grid-cols-3 ${borderSoft}`}>
          {bien.length > 0 && (
            <div>
              <SectionLabel>Lo que va bien</SectionLabel>
              <ul className={`mt-2 list-inside list-disc space-y-1 ${textSoft}`}>
                {bien.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {mal.length > 0 && (
            <div>
              <SectionLabel>Riesgos y puntos débiles</SectionLabel>
              <ul className={`mt-2 list-inside list-disc space-y-1 ${textSoft}`}>
                {mal.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {mejoras.length > 0 && (
            <div>
              <SectionLabel>Mejoras sugeridas</SectionLabel>
              <ul className={`mt-2 list-inside list-disc space-y-1 ${textSoft}`}>
                {mejoras.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {plan30.length > 0 &&
        block(
          'Plan de 30 días',
          <div className="space-y-3">
            {plan30.map((item, i) => {
              const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
              const acciones = Array.isArray(obj.acciones) ? obj.acciones.map((x) => str(x)) : []
              return (
                <div key={i} className={`rounded-xl border p-3 ${panelSoft}`}>
                  <p className={`text-xs ${labelSoft}`}>{str(obj.semana ?? `Semana ${i + 1}`)}</p>
                  <p className={`mt-1 font-medium ${textStrong}`}>{str(obj.objetivo ?? 'Objetivo no definido')}</p>
                  {acciones.length > 0 && (
                    <ul className={`mt-1.5 list-inside list-disc space-y-0.5 ${textSoft}`}>
                      {acciones.map((a, j) => (
                        <li key={j}>{a}</li>
                      ))}
                    </ul>
                  )}
                  <p className={`mt-2 text-xs ${labelSoft}`}>Owner recomendado: {str(obj.owner_recomendado ?? 'No definido')}</p>
                </div>
              )
            })}
          </div>
        )}
      {(alertas.length > 0 || preguntas.length > 0) && (
        <div className={`grid gap-6 border-t pt-4 md:grid-cols-2 ${borderSoft}`}>
          {alertas.length > 0 && (
            <div>
              <SectionLabel>Alertas tempranas</SectionLabel>
              <ul className={`mt-2 list-inside list-disc space-y-1 ${textSoft}`}>
                {alertas.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {preguntas.length > 0 && (
            <div>
              <SectionLabel>Preguntas abiertas</SectionLabel>
              <ul className={`mt-2 list-inside list-disc space-y-1 ${textSoft}`}>
                {preguntas.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ProyectoDetailPage({ initial }: Props) {
  const router = useRouter()
  const [project, setProject] = useState(initial.project)
  const [entries, setEntries] = useState(initial.entries)
  const [latestAnalysis, setLatestAnalysis] = useState(initial.latest_analysis)
  const [lastCtx, setLastCtx] = useState(initial.last_entry_for_context)
  const [body, setBody] = useState('')
  const [entryAt, setEntryAt] = useState(() => formatDatetimeLocalValue(new Date()))
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)
  const [expandedEntries, setExpandedEntries] = useState<Record<number, boolean>>({})
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null)
  const [lastNoteExpanded, setLastNoteExpanded] = useState(false)

  useEffect(() => {
    setLastNoteExpanded(false)
  }, [entries[0]?.id])

  const reload = useCallback(async () => {
    const r = await fetch(`/api/projects/${project.id}`)
    if (!r.ok) return
    const d = await r.json()
    setProject(d.project)
    setEntries(d.entries)
    setLatestAnalysis(d.latest_analysis)
    setLastCtx(d.last_entry_for_context)
  }, [project.id])

  const toggleEntryExpanded = (entryId: number) => {
    setExpandedEntries((prev) => ({ ...prev, [entryId]: !prev[entryId] }))
  }

  const deleteEntry = async (entryId: number) => {
    if (!window.confirm('¿Borrar esta nota? Desaparecerá del historial y no se tendrá en cuenta en informes nuevos de IA.')) {
      return
    }
    setDeletingEntryId(entryId)
    try {
      const r = await fetch(`/api/projects/${project.id}/entries/${entryId}`, { method: 'DELETE' })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        alert(err.error || 'No se pudo borrar')
        return
      }
      setExpandedEntries((prev) => {
        const next = { ...prev }
        delete next[entryId]
        return next
      })
      await reload()
      router.replace(router.asPath, undefined, { shallow: true })
    } finally {
      setDeletingEntryId(null)
    }
  }

  const saveEntry = async () => {
    if (!body.trim()) return
    setSaving(true)
    try {
      const r = await fetch(`/api/projects/${project.id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: body.trim(),
          created_at: new Date(entryAt).toISOString(),
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        alert(err.error || 'No se pudo guardar')
        return
      }
      setBody('')
      setEntryAt(formatDatetimeLocalValue(new Date()))
      await reload()
      router.replace(router.asPath, undefined, { shallow: true })
    } finally {
      setSaving(false)
    }
  }

  const runAnalysis = async () => {
    setAnalyzing(true)
    try {
      const r = await fetch(`/api/projects/${project.id}/analyze`, { method: 'POST' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        alert(data.error || data.raw_preview || 'Error en el análisis')
        return
      }
      setLatestAnalysis(data.analysis)
    } finally {
      setAnalyzing(false)
    }
  }

  const downloadReportPdf = async () => {
    if (!reportRef.current || !latestAnalysis) return
    setDownloadingPdf(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#020617',
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
          const pageData = pageCanvas.toDataURL('image/png')
          pdf.addImage(pageData, 'PNG', margin, margin, contentWidth, sliceHeight)
          renderedHeight += sliceHeight
          page += 1
        }
      }

      const safeName = project.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
      pdf.save(`informe-${safeName || 'proyecto'}.pdf`)
    } catch {
      alert('No se pudo generar el PDF. Inténtalo de nuevo.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const toggleActive = async () => {
    const r = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !project.is_active }),
    })
    if (r.ok) await reload()
  }

  return (
    <Layout>
      <div className="mx-auto max-w-5xl space-y-8 px-2 py-2 sm:px-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
            <Link href="/proyectos">
              <Button variant="ghost" size="icon" className="mt-0.5 shrink-0 rounded-xl">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{project.name}</h1>
              <div className="mt-2 text-sm text-gray-600">
                {project.client_name ? (
                  <>
                    <span className="text-gray-500">Cliente</span>{' '}
                    <span className="font-medium text-gray-900">{project.client_name}</span>
                    <span className="mx-2 text-gray-300">·</span>
                  </>
                ) : null}
                <Badge className={project.is_active ? 'bg-gray-100 font-normal text-gray-800' : 'font-normal'} variant="secondary">
                  {project.is_active ? 'Activo' : 'Cerrado'}
                </Badge>
                <span className="ml-2 text-gray-500">
                  {project.days_open} días
                </span>
              </div>
            </div>
          </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleActive}
              className="shrink-0 self-start rounded-xl sm:self-auto"
            >
              Marcar como {project.is_active ? 'cerrado' : 'activo'}
            </Button>
          </div>
        </div>

        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Última nota</CardTitle>
            <CardDescription className="text-gray-500">
              Vista previa: pulsa para leer el texto completo si la nota es larga.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lastCtx ? (
              (() => {
                const lineCount = lastCtx.body.split(/\r?\n/).filter((l) => l.trim().length > 0).length
                const needsExpand = lastCtx.body.length > 200 || lineCount > 3
                const open = lastNoteExpanded
                return (
                  <div
                    role={needsExpand ? 'button' : undefined}
                    tabIndex={needsExpand ? 0 : undefined}
                    onClick={() => needsExpand && setLastNoteExpanded((v) => !v)}
                    onKeyDown={(ev) => {
                      if (!needsExpand) return
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault()
                        setLastNoteExpanded((v) => !v)
                      }
                    }}
                    className={
                      needsExpand
                        ? 'cursor-pointer space-y-2 rounded-xl border border-gray-100 bg-gray-50/50 p-4 outline-none ring-offset-2 transition hover:border-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300'
                        : 'space-y-2'
                    }
                  >
                    <p className="text-sm text-gray-500">{formatShort(lastCtx.created_at)}</p>
                    <p
                      className={`whitespace-pre-wrap text-sm leading-relaxed text-gray-900 ${
                        open || !needsExpand ? '' : 'line-clamp-4'
                      }`}
                    >
                      {lastCtx.body}
                    </p>
                    {needsExpand && (
                      <div className="mt-2 flex items-center gap-1 text-xs font-medium text-gray-600">
                        {open ? (
                          <>
                            <ChevronUp className="h-3.5 w-3.5" />
                            Ver menos
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3.5 w-3.5" />
                            Ver todo
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()
            ) : (
              <p className="text-sm text-gray-500">Sin bitácoras todavía. Añade la primera abajo.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Nueva entrada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-md">
              <Label htmlFor="entry-at" className="text-gray-600">
                Fecha y hora de esta nota
              </Label>
              <Input
                id="entry-at"
                type="datetime-local"
                value={entryAt}
                onChange={(e) => setEntryAt(e.target.value)}
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-gray-500">
                Útil si escribes atrasado: deja constancia de cuándo ocurrió lo que cuentas.
              </p>
            </div>
            <div>
              <Label htmlFor="entry-body" className="text-gray-600">
                Qué ha pasado desde la última vez
              </Label>
              <Textarea
                id="entry-body"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Llamadas, entregas, bloqueos…"
                className="mt-1.5 resize-y"
              />
            </div>
            <Button onClick={saveEntry} disabled={saving || !body.trim()} className="rounded-xl">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Historial</CardTitle>
            <CardDescription className="text-gray-500">
              Vista compacta: pulsa una tarjeta para leer la nota completa. Puedes borrar notas que no quieras usar en informes nuevos de IA.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="text-sm text-gray-500">Sin entradas.</p>
            ) : (
              <div className="space-y-3">
                {entries.map((e) => {
                  const open = Boolean(expandedEntries[e.id])
                  const lineCount = e.body.split(/\r?\n/).filter((l) => l.trim().length > 0).length
                  const needsExpand = e.body.length > 200 || lineCount > 3
                  return (
                    <div
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleEntryExpanded(e.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault()
                          toggleEntryExpanded(e.id)
                        }
                      }}
                      className="cursor-pointer rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50/80 p-4 shadow-sm outline-none ring-offset-2 transition hover:border-gray-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-gray-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                              {formatShort(e.created_at)}
                            </span>
                            <span className="text-xs text-gray-400">
                              {open ? 'Texto completo' : 'Vista previa'}
                            </span>
                          </div>
                          <p
                            className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-900 ${
                              open || !needsExpand ? '' : 'line-clamp-4'
                            }`}
                          >
                            {e.body}
                          </p>
                          {needsExpand && (
                            <div className="mt-2 flex items-center gap-1 text-xs font-medium text-gray-600">
                              {open ? (
                                <>
                                  <ChevronUp className="h-3.5 w-3.5" />
                                  Cerrar
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-3.5 w-3.5" />
                                  Ver completo
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"
                          title="Borrar nota"
                          disabled={deletingEntryId === e.id}
                          onClick={(ev) => {
                            ev.stopPropagation()
                            void deleteEntry(e.id)
                          }}
                        >
                          {deletingEntryId === e.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
            <CardTitle>Informe IA</CardTitle>
            <div className="flex items-center gap-2">
              {latestAnalysis && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadReportPdf}
                  disabled={downloadingPdf}
                  className="rounded-xl border-slate-300 text-slate-700"
                >
                  {downloadingPdf ? 'Descargando...' : 'Descargar PDF'}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={runAnalysis}
                disabled={analyzing || entries.length === 0}
                className="rounded-xl"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando
                  </>
                ) : (
                  'Generar informe'
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="border-t border-gray-100 pt-4">
            {latestAnalysis ? (
              <div ref={reportRef} className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
                <p className="mb-4 text-xs text-slate-400">
                  {formatShort(latestAnalysis.created_at)}
                  {latestAnalysis.model ? ` · ${latestAnalysis.model}` : ''}
                </p>
                <AnalysisView data={latestAnalysis.summary_json} dark />
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {entries.length === 0
                  ? 'Añade al menos una entrada para poder generar el informe.'
                  : 'Aún no hay informe. Pulsa «Generar informe» cuando quieras.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
