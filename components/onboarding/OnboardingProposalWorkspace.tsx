'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import {
  Loader2,
  Sparkles,
  Save,
  Printer,
  FileCode2,
  ArrowUp,
  RotateCcw,
  Send,
  Undo2,
  Redo2,
} from 'lucide-react'
import BuffaloReport from '@/components/retencion/report/BuffaloReport'
import type { BuffaloThemeName } from '@/components/retencion/report/buffaloTheme'
import {
  formatProposalDate,
  parseProposalDraft,
  softPolishProposalDraft,
} from '@/lib/onboarding/proposal-brm'
import { useDraftHistory } from '@/lib/onboarding/use-draft-history'
import { cn } from '@/lib/utils'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  statsLine?: string
  intentSatisfied?: boolean | null
}
type ProposalStatus = 'draft' | 'sent'

const QUICK_CHIPS: Array<{ label: string; instruction: string }> = [
  {
    label: 'Ampliar todo',
    instruction: 'Extiende mucho más cada punto: más párrafos, más desglose y más contenido en todas las secciones.',
  },
  {
    label: 'Más tablas y desgloses',
    instruction:
      'Cada punto es demasiado corto. Añade más tablas, más desgloses, más subapartados y más contenido en todo el documento.',
  },
  {
    label: 'Gráfico de proyección',
    instruction:
      'Añade un gráfico de proyección ilustrativa sin Buffalo vs con Buffalo (evolución temporal) en la sección de ROI o retorno, con hipótesis claras.',
  },
  {
    label: 'Traducir a catalán',
    instruction: 'Cambia todo el documento a catalán manteniendo la sintaxis BRM y la estructura.',
  },
  {
    label: 'Regenerar',
    instruction: 'Regenera toda la propuesta completa a partir del contexto del cliente, con todas las secciones ACCIÓ bien desarrolladas.',
  },
]

/**
 * Texto de espera honesto. La IA tarda de verdad (una sección ~20 s, el documento
 * entero bastante más) y un «Actualizando…» mudo parece un cuelgue. Mostramos el
 * tiempo real y qué está pasando, sin barras de progreso falsas.
 */
function waitingHint(seconds: number, isFullGeneration: boolean): string {
  if (isFullGeneration) {
    if (seconds < 15) return 'Redactando el documento completo con el contexto del cliente.'
    if (seconds < 45) return 'Son 13 secciones: esto suele tardar entre 40 y 90 segundos.'
    return 'Sigue trabajando. No recargues la página o perderás el resultado.'
  }
  if (seconds < 10) return 'Leyendo el documento y el contexto del cliente.'
  if (seconds < 30) return 'Escribiendo el cambio. Lo normal son 15-40 segundos.'
  if (seconds < 75) return 'Es un cambio grande y toca varias secciones. Sigue en marcha.'
  return 'Tarda más de lo habitual, pero no se ha colgado. No recargues la página.'
}

function formatStatsLine(stats: {
  wordsDelta?: number
  tablesAfter?: number
  tablesBefore?: number
  chartsAfter?: number
  chartsBefore?: number
  sectionsTouched?: string[]
} | null | undefined): string | undefined {
  if (!stats) return undefined
  const parts: string[] = []
  if (typeof stats.wordsDelta === 'number' && stats.wordsDelta !== 0) {
    const w = stats.wordsDelta > 0 ? `+${stats.wordsDelta}` : String(stats.wordsDelta)
    parts.push(`${w} palabras`)
  }
  const tablesDelta = (stats.tablesAfter ?? 0) - (stats.tablesBefore ?? 0)
  if (tablesDelta !== 0) {
    parts.push(`${tablesDelta > 0 ? '+' : ''}${tablesDelta} tabla${Math.abs(tablesDelta) === 1 ? '' : 's'}`)
  }
  const chartsDelta = (stats.chartsAfter ?? 0) - (stats.chartsBefore ?? 0)
  if (chartsDelta !== 0) {
    parts.push(`${chartsDelta > 0 ? '+' : ''}${chartsDelta} gráfico${Math.abs(chartsDelta) === 1 ? '' : 's'}`)
  }
  const nSec = stats.sectionsTouched?.length ?? 0
  if (nSec > 0) parts.push(`${nSec} sección${nSec === 1 ? '' : 'es'}`)
  return parts.length ? parts.join(' · ') : undefined
}

export default function OnboardingProposalWorkspace() {
  const router = useRouter()
  const leadId = Number(router.query.lead)
  const previewRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [markingSent, setMarkingSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [theme, setTheme] = useState<BuffaloThemeName>('green')
  const [status, setStatus] = useState<ProposalStatus>('draft')
  const [meta, setMeta] = useState({
    name: '',
    clientName: '',
    clientCompany: '',
    hasContext: false,
    hasDefinition: false,
  })
  const { draft, canUndo, canRedo, resetDraft, commitDraft, undo, redo } = useDraftHistory()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')

  // Preview: polish blando (firmas rotas / subtítulo absurdo), sin pisar ediciones.
  const displayDraft = useMemo(
    () =>
      softPolishProposalDraft(draft, {
        clientName: meta.clientName,
        clientCompany: meta.clientCompany,
      }),
    [draft, meta.clientName, meta.clientCompany]
  )
  const parsed = useMemo(() => parseProposalDraft(displayDraft), [displayDraft])
  const now = useMemo(() => new Date(), [])
  const clientLabel = meta.clientCompany || meta.clientName || 'Cliente'

  useEffect(() => {
    if (!router.isReady) return
    if (!Number.isFinite(leadId) || leadId <= 0) {
      setLoading(false)
      setError('Lead inválido')
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/onboarding/projects/${leadId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.error) throw new Error(data.error)
        const name =
          data.proyecto?.name ||
          data.lead?.contact?.empresa ||
          data.lead?.contact?.nombre ||
          `Lead #${leadId}`
        setMeta({
          name,
          clientName: data.lead?.contact?.nombre || '',
          clientCompany: data.lead?.contact?.empresa || '',
          hasContext: Boolean(data.project_context),
          hasDefinition: Boolean(data.project_definition),
        })
        resetDraft(data.proposal_draft || '')
        setStatus(data.proposal_status === 'sent' ? 'sent' : 'draft')
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [router.isReady, leadId, resetDraft])

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, sending])

  // Cronómetro real mientras la IA trabaja (evita la sensación de cuelgue).
  useEffect(() => {
    if (!sending && !generating) {
      setElapsed(0)
      return
    }
    setElapsed(0)
    const startedAt = Date.now()
    const id = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [sending, generating])

  const flashOk = (msg: string) => {
    setOkMsg(msg)
    window.setTimeout(() => setOkMsg(''), 2500)
  }

  const persistSilent = async (nextDraft: string) => {
    if (!Number.isFinite(leadId) || leadId <= 0) return
    try {
      await fetch(`/api/onboarding/projects/${leadId}/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'proposal',
          save_only: true,
          draft: nextDraft,
          proposal_status: 'draft',
        }),
      })
    } catch {
      /* best-effort */
    }
  }

  const onUndo = () => {
    const prev = undo()
    if (prev == null) return
    setStatus('draft')
    void persistSilent(prev)
    flashOk('Deshecho')
  }

  const onRedo = () => {
    const next = redo()
    if (next == null) return
    setStatus('draft')
    void persistSilent(next)
    flashOk('Rehecho')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const prev = undo()
        if (prev == null) return
        setStatus('draft')
        void persistSilent(prev)
        flashOk('Deshecho')
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        const next = redo()
        if (next == null) return
        setStatus('draft')
        void persistSilent(next)
        flashOk('Rehecho')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, leadId])

  const generate = async (instructions?: string) => {
    if (!Number.isFinite(leadId) || leadId <= 0) return
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'proposal',
          instructions: instructions?.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error generando propuesta')
      commitDraft(data.draft || '')
      setStatus('draft')
      flashOk('Propuesta generada · guardada como borrador')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error generando propuesta'
      setError(msg)
      throw e instanceof Error ? e : new Error(msg)
    } finally {
      setGenerating(false)
    }
  }

  const saveAs = async (nextStatus: ProposalStatus) => {
    if (!Number.isFinite(leadId) || leadId <= 0) return
    if (nextStatus === 'sent') setMarkingSent(true)
    else setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'proposal',
          save_only: true,
          draft,
          proposal_status: nextStatus,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setStatus(nextStatus)
      flashOk(nextStatus === 'sent' ? 'Marcada como enviada' : 'Guardada como borrador')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
      setMarkingSent(false)
    }
  }

  const sendChat = async (instruction: string) => {
    const text = instruction.trim()
    if (!text || sending || !Number.isFinite(leadId) || leadId <= 0) return
    setSending(true)
    setError('')
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    try {
      if (!draft.trim()) {
        await generate(text)
        setMessages([
          ...nextMessages,
          {
            role: 'assistant',
            content: 'He generado la primera versión y la he guardado como borrador.',
          },
        ])
        return
      }
      const res = await fetch(`/api/onboarding/projects/${leadId}/proposal-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: text,
          draft,
          messages: messages.slice(-8),
          save: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error editando la propuesta')
      const nextDraft = typeof data.content === 'string' ? data.content : draft
      const changed = commitDraft(nextDraft)
      setStatus('draft')
      if (data.theme === 'green' || data.theme === 'light' || data.theme === 'dark') {
        setTheme(data.theme)
      }
      const serverNote = String(data.note || '').trim()
      const themeOnly =
        !changed &&
        (data.theme === 'green' || data.theme === 'light' || data.theme === 'dark')
      const statsLine = formatStatsLine(data.stats)
      const intentSatisfied =
        typeof data.intentSatisfied === 'boolean' ? data.intentSatisfied : null
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: themeOnly
            ? `${serverNote || `Tema ${data.theme}`} · Guardado`
            : changed
              ? `${serverNote || 'Documento actualizado'} · Guardado como borrador`
              : serverNote ||
                'Sin cambios en la previsualización. Sé más concreto o pega el fragmento a editar.',
          statsLine,
          intentSatisfied,
        },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en el chat')
      setMessages(nextMessages)
    } finally {
      setSending(false)
    }
  }

  const printPdf = async () => {
    try {
      const { exportBuffaloReportPdf } = await import(
        '@/components/retencion/report/exportReportPdf'
      )
      await exportBuffaloReportPdf({
        rootId: 'buffalo-proposal',
        fileName: `propuesta-${leadId}`,
        docTitle: parsed.title || meta.name || 'Propuesta',
        audience: 'client',
      })
      flashOk('PDF descargado')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF')
    }
  }

  const downloadHtml = async () => {
    try {
      const { downloadBuffaloReportHtml } = await import(
        '@/components/retencion/report/exportReportPdf'
      )
      await downloadBuffaloReportHtml({
        rootId: 'buffalo-proposal',
        fileName: `propuesta-${leadId}`,
        docTitle: parsed.title || meta.name || 'Propuesta',
        audience: 'client',
      })
      flashOk('HTML descargado')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el HTML')
    }
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-100/90 text-zinc-900">
      <header className="shrink-0 px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="flex items-center gap-4 rounded-3xl border border-zinc-200/80 bg-white px-4 py-3.5 shadow-sm sm:px-5">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-zinc-900 sm:text-base">
              Propuesta comercial:{' '}
              <span className="font-medium text-zinc-700">{clientLabel}</span>
            </h1>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              {status === 'sent' ? 'Estado: enviada' : 'Estado: borrador'}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-full border border-zinc-200 p-0.5">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                title="Deshacer (Ctrl+Z)"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-50 disabled:opacity-30"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                title="Rehacer (Ctrl+Y)"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-50 disabled:opacity-30"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex rounded-full border border-zinc-200 p-0.5 text-[11px]">
              {(['green', 'light', 'dark'] as BuffaloThemeName[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={cn(
                    'rounded-full px-2.5 py-1.5 capitalize',
                    theme === t ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'
                  )}
                >
                  {t === 'green' ? 'Verde' : t === 'light' ? 'Claro' : 'Oscuro'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void printPdf()}
              disabled={!draft}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            >
              <Printer className="h-3.5 w-3.5" />
              Descargar PDF
            </button>
            <button
              type="button"
              onClick={() => void downloadHtml()}
              disabled={!draft}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              HTML
            </button>
            <button
              type="button"
              onClick={() => void saveAs('draft')}
              disabled={saving || markingSent || !draft}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Guardar como borrador
            </button>
            <button
              type="button"
              onClick={() => void saveAs('sent')}
              disabled={markingSent || saving || !draft}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium disabled:opacity-40',
                status === 'sent'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
              )}
            >
              {markingSent ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {status === 'sent' ? 'Enviada' : 'Enviado'}
            </button>
            <button
              type="button"
              onClick={() => void generate().catch(() => {})}
              disabled={generating || loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-zinc-900 px-4 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : draft ? (
                <RotateCcw className="h-3.5 w-3.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {draft ? 'Regenerar' : 'Generar con IA'}
            </button>
          </div>
        </div>
        {(error || okMsg) && (
          <div
            className={cn(
              'mt-2 rounded-2xl px-4 py-2.5 text-sm',
              error
                ? 'border border-red-100 bg-red-50 text-red-800'
                : 'border border-emerald-100 bg-emerald-50 text-emerald-800'
            )}
          >
            {error || okMsg}
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
          <div className="hide-scrollbar min-h-0 overflow-y-auto rounded-3xl border border-zinc-200/70 bg-zinc-200/50 p-4 sm:p-6">
            {!meta.hasContext && !meta.hasDefinition && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Este proyecto aún no tiene contexto ni definición. Actualízalos en Editar y vuelve
                aquí, o descríbelo en el chat.
              </div>
            )}
            {!draft.trim() ? (
              <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-zinc-300 bg-white/80 px-6 py-16 text-center">
                <Sparkles className="h-8 w-8 text-zinc-400" />
                <p className="text-sm font-medium text-zinc-800">Sin propuesta todavía</p>
                <p className="text-xs leading-relaxed text-zinc-500">
                  Pulsa «Generar con IA» o escribe en el chat qué quieres en la propuesta. La
                  previsualización usará la plantilla Buffalo (portada, secciones 01, 02…).
                </p>
              </div>
            ) : (
              <div ref={previewRef} className="mx-auto w-fit max-w-full">
                <BuffaloReport
                  id="buffalo-proposal"
                  kind="proposal"
                  theme={theme}
                  className="proposal-preview-soft"
                  report={{
                    title: parsed.title || meta.name || 'Propuesta',
                    // Cuerpo completo (incluye <!-- bf:page-mode:… --> para el paginado)
                    content: parsed.content || displayDraft,
                    audience: 'client',
                    year: now.getFullYear(),
                    month: now.getMonth() + 1,
                  }}
                  client={{ name: meta.clientName, company: meta.clientCompany }}
                  cover={{
                    eyebrow: 'Propuesta de proyecto',
                    subtitle: parsed.subtitle || undefined,
                    meta: [
                      { label: 'Cliente', value: clientLabel },
                      { label: 'Proveedor', value: 'Buffalo AI' },
                      { label: 'Fecha', value: formatProposalDate(now) },
                      { label: 'Validez', value: '30 días naturales' },
                    ],
                  }}
                />
              </div>
            )}
          </div>

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-sm">
            <div
              ref={chatScrollRef}
              className="hide-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[90%] whitespace-pre-wrap rounded-3xl px-3.5 py-2.5 text-[13px] leading-6',
                      m.role === 'user'
                        ? 'bg-zinc-900 text-white'
                        : m.intentSatisfied === false
                          ? 'border border-amber-300 bg-amber-50 text-zinc-800'
                          : 'bg-zinc-100 text-zinc-800'
                    )}
                  >
                    {m.content}
                    {m.role === 'assistant' && m.statsLine ? (
                      <div
                        className={cn(
                          'mt-1.5 text-[11px] leading-4',
                          m.intentSatisfied === false ? 'text-amber-700/80' : 'text-zinc-500'
                        )}
                      >
                        {m.statsLine}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

              {(sending || generating) && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] rounded-3xl bg-zinc-100 px-3.5 py-2.5 text-[13px] text-zinc-500">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {generating && !draft ? 'Generando la propuesta' : 'Aplicando el cambio'}
                      <span className="tabular-nums text-zinc-400">{elapsed}s</span>
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-zinc-400">
                      {waitingHint(elapsed, generating && !draft)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form
              className="shrink-0 p-3 pt-0"
              onSubmit={(e) => {
                e.preventDefault()
                void sendChat(input)
              }}
            >
              <div className="mb-2 flex flex-wrap gap-1.5 px-0.5">
                {QUICK_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    disabled={sending || generating}
                    onClick={() => setInput(chip.instruction)}
                    className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2 rounded-3xl border border-zinc-200 bg-zinc-50 p-2.5 focus-within:border-zinc-300 focus-within:bg-white">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={3}
                  placeholder="Escribe un cambio…"
                  className="min-h-[72px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed focus:outline-none"
                  disabled={sending || generating}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void sendChat(input)
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={sending || generating || !input.trim()}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40"
                  aria-label="Enviar"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  )
}
