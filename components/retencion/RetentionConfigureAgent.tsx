'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Database,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Save,
  ArrowUp,
  RotateCcw,
  Circle,
  Download,
  FileText,
  Building2,
  UserRound,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { RetencionAgentConfigPublic } from '@/lib/retencion/types'
import {
  DEFAULT_RETENCION_REPORT_PROMPT,
  DEFAULT_RETENCION_REPORT_PROMPT_BUFFALO,
  type RetencionReportAudience,
} from '@/lib/retencion/report-prompt'
import {
  CHECKLIST_META,
  checklistAllGreen,
  type AuditChecklist,
  type ChecklistItemId,
} from '@/lib/retencion/knowledge/checklist'
import PhaseCarousel from '@/components/retencion/PhaseCarousel'
import BuffaloReport from '@/components/retencion/report/BuffaloReport'
import ReportEditChat from '@/components/retencion/report/ReportEditChat'
import type { BuffaloThemeName } from '@/components/retencion/report/buffaloTheme'

type UiMsg = {
  id: string
  role: 'user' | 'assistant' | 'db_card' | 'system'
  content: string
  pending?: boolean
}

const statusLabel: Record<string, string> = {
  pending: 'Sin empezar',
  discovery: 'Construyendo contexto',
  db_needed: 'Esperando Postgres',
  schema_audit: 'Explorando Postgres',
  ready: 'Contexto listo',
}

/** Mejora texto plano del modelo a markdown legible */
function normalizeAssistantMarkdown(raw: string): string {
  let s = raw.replace(/\r\n/g, '\n').trim()
  // "1. Tabla: foo" → heading + bold
  s = s.replace(/^(\d+)\.\s*Tabla:\s*(.+)$/gim, '\n### $1. `$2`\n')
  // "id: bigint (NO NULO)" → lista tipográfica
  s = s.replace(/^([a-zA-Z_][\w]*)\s*:\s*(.+)$/gm, (full, col, rest) => {
    const r = String(rest).trim()
    const looksLikeType =
      /^(bigint|int|integer|smallint|text|varchar|character|boolean|bool|timestamp|timestamptz|date|numeric|decimal|uuid|json|jsonb|real|double|float|bytea)/i.test(
        r
      ) || /\b(NO NULO|NULL|nulo|NOT NULL)\b/i.test(r)
    if (!looksLikeType) return full
    return `- **\`${col}\`**: ${r}`
  })
  return s
}

function MarkdownBody({ content, className }: { content: string; className?: string }) {
  const md = normalizeAssistantMarkdown(content)
  return (
    <div
      className={cn(
        'max-w-none text-[15px] leading-7 text-zinc-800 antialiased',
        '[&>p]:my-2.5 [&>p]:leading-7',
        '[&>h1]:mt-5 [&>h1]:mb-2 [&>h1]:text-xl [&>h1]:font-semibold [&>h1]:tracking-tight [&>h1]:text-zinc-900',
        '[&>h2]:mt-5 [&>h2]:mb-2 [&>h2]:text-lg [&>h2]:font-semibold [&>h2]:tracking-tight [&>h2]:text-zinc-900',
        '[&>h3]:mt-4 [&>h3]:mb-1.5 [&>h3]:text-base [&>h3]:font-semibold [&>h3]:text-zinc-900',
        '[&>ul]:my-2.5 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-1',
        '[&>ol]:my-2.5 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:space-y-1',
        '[&_li]:leading-7 [&_li]:text-zinc-800',
        '[&_strong]:font-semibold [&_strong]:text-zinc-900',
        '[&_code]:rounded-md [&_code]:bg-zinc-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:font-medium [&_code]:text-zinc-800',
        '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-zinc-900 [&_pre]:p-3.5 [&_pre]:text-[13px] [&_pre]:leading-6 [&_pre]:text-zinc-100',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
        '[&_a]:text-zinc-900 [&_a]:underline [&_a]:underline-offset-2',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </div>
  )
}

function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-500 py-1">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-500" />
      </span>
      <span className="animate-pulse">{label}</span>
      <span className="inline-flex gap-0.5 ml-1">
        <span className="h-1 w-1 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1 w-1 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1 w-1 rounded-full bg-zinc-400 animate-bounce" />
      </span>
    </div>
  )
}

function StatusPill({
  children,
  tone = 'neutral',
  onClick,
  disabled,
}: {
  children: ReactNode
  tone?: 'neutral' | 'ok' | 'warn' | 'action'
  onClick?: () => void
  disabled?: boolean
}) {
  const Comp = onClick ? 'button' : 'span'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={disabled ? undefined : onClick}
      disabled={onClick ? disabled : undefined}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium tracking-tight transition',
        tone === 'ok' && 'bg-emerald-50 text-emerald-800 border border-emerald-200/80',
        tone === 'warn' && 'bg-amber-50 text-amber-900 border border-amber-200/80',
        tone === 'action' &&
          'bg-zinc-900 text-white border border-zinc-900 hover:bg-zinc-800 shadow-sm',
        tone === 'neutral' && 'bg-zinc-100 text-zinc-700 border border-zinc-200/80 hover:bg-zinc-200/70',
        disabled && 'opacity-40 pointer-events-none'
      )}
    >
      {children}
    </Comp>
  )
}

function ChecklistCards({
  checklist,
}: {
  checklist: AuditChecklist | undefined
}) {
  const items = (Object.keys(CHECKLIST_META) as ChecklistItemId[]).map((id) => {
    const meta = CHECKLIST_META[id]
    const state = checklist?.[id]
    const ok = Boolean(state?.ok)
    return { id, meta, state, ok }
  })

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {items.map(({ id, meta, state, ok }) => (
          <div
            key={id}
            className={cn(
              'rounded-xl border px-2.5 py-3 min-w-0 flex flex-col items-center text-center',
              ok
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-zinc-200 bg-white'
            )}
          >
            {ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-zinc-400 shrink-0" />
            )}
            <p
              className={cn(
                'mt-1.5 text-[11px] sm:text-[12px] font-semibold leading-tight',
                ok ? 'text-emerald-900' : 'text-zinc-900'
              )}
            >
              {meta.title}
            </p>
            <p
              className={cn(
                'mt-1 text-[10px] leading-snug line-clamp-2',
                ok ? 'text-emerald-700' : 'text-zinc-500'
              )}
            >
              {state?.detail || meta.question}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function DbConnectCard({
  saving,
  onSave,
  alreadyConnected,
  host,
}: {
  saving: boolean
  onSave: (url: string) => Promise<void>
  alreadyConnected?: boolean
  host?: string | null
}) {
  const [url, setUrl] = useState('')
  return (
    <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shrink-0">
          <Database className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">Conectar Postgres del cliente</p>
          <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
            Solo lectura (SELECT). Idealmente un usuario read-only. La URL se cifra y no se vuelve a
            mostrar completa.
            {alreadyConnected && host ? ` Ahora: ${host}` : ''}
          </p>
        </div>
      </div>
      <Input
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onPaste={(e) => {
          e.stopPropagation()
          const text = e.clipboardData.getData('text')
          if (text) {
            e.preventDefault()
            setUrl(text.trim())
          }
        }}
        placeholder="postgresql://user:pass@host:5432/dbname"
        className="rounded-xl bg-white border-zinc-200 h-10 text-sm font-mono"
      />
      <Button
        type="button"
        size="sm"
        className="rounded-xl h-9"
        disabled={saving || !url.trim()}
        onClick={() => void onSave(url.trim())}
      >
        {saving ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Conectando…
          </>
        ) : (
          <>
            <Database className="h-3.5 w-3.5 mr-1.5" />
            Probar y conectar
          </>
        )}
      </Button>
    </div>
  )
}

export default function RetentionConfigureAgent({
  proyectoId,
  clientName,
  clientCompany,
}: {
  proyectoId: string
  clientName?: string | null
  clientCompany?: string | null
}) {
  const [config, setConfig] = useState<RetencionAgentConfigPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [thinkingLabel, setThinkingLabel] = useState('Pensando')
  const [optimistic, setOptimistic] = useState<UiMsg[]>([])
  const [showDbInChat, setShowDbInChat] = useState(false)
  const [savingDb, setSavingDb] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const [promptAudience, setPromptAudience] = useState<RetencionReportAudience | null>(null)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [generatingAudience, setGeneratingAudience] = useState<RetencionReportAudience | null>(null)
  const [reportMd, setReportMd] = useState('')
  const [reportId, setReportId] = useState<string | null>(null)
  const [reportTitle, setReportTitle] = useState('')
  const [reportYear, setReportYear] = useState<number | null>(null)
  const [reportMonth, setReportMonth] = useState<number | null>(null)
  const [reportAudience, setReportAudience] = useState<RetencionReportAudience | null>(null)
  const [reportTheme, setReportTheme] = useState<BuffaloThemeName>('light')
  const [editingReport, setEditingReport] = useState(false)
  const [savingReport, setSavingReport] = useState(false)
  const [phase, setPhase] = useState(0)
  const [reportHistory, setReportHistory] = useState<
    Array<{
      id: string
      year: number
      month: number
      audience?: RetencionReportAudience
      title: string | null
      content: string
      created_at: string
    }>
  >([])
  const [genYear, setGenYear] = useState(() => new Date().getFullYear())
  const [genMonth, setGenMonth] = useState(() => new Date().getMonth() + 1)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [discoveringMetrics, setDiscoveringMetrics] = useState(false)
  const [metricsNote, setMetricsNote] = useState('')
  const [versions, setVersions] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [knowledgeDraft, setKnowledgeDraft] = useState('')
  const [schemaDraft, setSchemaDraft] = useState('')
  const [savingContext, setSavingContext] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const reportPreviewRef = useRef<HTMLDivElement>(null)
  const autoAdvancedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/agent-config`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar config')
      setConfig(data.config)
      if (data.config.audit_status === 'db_needed' && !data.config.db_connected) {
        setShowDbInChat(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [proyectoId])

  useEffect(() => {
    void load()
  }, [load])

  // Cargar histórico de informes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/retencion/proyectos/${proyectoId}/monthly-report`)
        const data = await res.json()
        if (!res.ok || cancelled) return
        const list = Array.isArray(data.reports) ? data.reports : []
        setReportHistory(list)
        // No auto-cargamos ningún informe: el usuario lo abre desde el histórico
        // o genera uno nuevo cuando quiera.
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [proyectoId])

  // Auto-avance a informe cuando las 3 tarjetas están en verde
  useEffect(() => {
    if (!config?.audit_checklist) return
    if (!checklistAllGreen(config.audit_checklist)) return
    if (autoAdvancedRef.current) return
    if (phase !== 1) return
    autoAdvancedRef.current = true
    const t = window.setTimeout(() => setPhase(2), 600)
    return () => window.clearTimeout(t)
  }, [config?.audit_checklist, phase])

  const thread: UiMsg[] = useMemo(() => {
    const base: UiMsg[] = (config?.audit_messages || [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m, i) => ({
        id: `persisted-${i}`,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    const merged = [...base, ...optimistic]

    if (showDbInChat && !config?.db_connected) {
      const lastIsDb = merged[merged.length - 1]?.role === 'db_card'
      if (!lastIsDb) {
        merged.push({
          id: 'db-card',
          role: 'db_card',
          content: '',
        })
      }
    }

    return merged
  }, [config?.audit_messages, config?.db_connected, optimistic, showDbInChat])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [thread, sending, showDbInChat])

  const sendMessage = async (text: string) => {
    const msg = text.trim()
    if (!msg || sending) return

    const tempId = `opt-${Date.now()}`
    setOptimistic((prev) => [
      ...prev,
      { id: tempId, role: 'user', content: msg, pending: true },
    ])
    setReply('')
    setSending(true)
    setError('')
    setThinkingLabel('Pensando')

    const thinkTimer = window.setTimeout(() => setThinkingLabel('Escribiendo'), 1800)

    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/agent-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error del agente')
      setConfig(data.config)
      setOptimistic([])
      if (data.need_db_url || data.config?.audit_status === 'db_needed') {
        if (!data.config?.db_connected) setShowDbInChat(true)
      }
    } catch (e) {
      setOptimistic((prev) => prev.filter((m) => m.id !== tempId))
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      window.clearTimeout(thinkTimer)
      setSending(false)
    }
  }

  const startAudit = async () => {
    const res = await fetch(`/api/retencion/proyectos/${proyectoId}/agent-config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_audit: true }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.config) setConfig(data.config)
    await sendMessage(
      'Empezamos la auditoría. Primero ingiere el CRM (config, onboarding, tareas, tickets). Luego usa la skill de baseline/ROI: pregunta cuánto tiempo, dinero y recursos (personas, PCs…) perdían haciéndolo manual, calcula el ahorro vs Buffalo y guarda secciones 11–12. Después completa lo operativo que falte.'
    )
  }

  const refreshCrmKnowledge = async (overwrite: boolean) => {
    setError('')
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/agent-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_crm_knowledge: true,
          overwrite_crm_knowledge: overwrite,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo refrescar el CRM')
      setConfig(data.config)
      if (data.crm_seed?.skipped) {
        // ya hay contexto: no es error
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    }
  }

  const saveDb = async (url: string) => {
    setSavingDb(true)
    setError('')
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/agent-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_db_url: url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la URL')
      setConfig(data.config)
      setShowDbInChat(false)
      await sendMessage(
        'Postgres del cliente conectado (solo SELECT). Explora tablas, entiende el schema y sigue preguntándome lo que falte hasta dominar el contexto.'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSavingDb(false)
    }
  }

  const saveContext = async () => {
    setSavingContext(true)
    setError('')
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/agent-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audit_knowledge: knowledgeDraft,
          schema_summary: schemaDraft,
          mark_ready: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error guardando contexto')
      setConfig(data.config)
      setContextOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSavingContext(false)
    }
  }

  const askConsolidateContext = async () => {
    await sendMessage(
      'Consolida el CONTEXTO con todas las secciones (1–13), incluyendo 11 Coste manual (tiempo, dinero, personas/PCs/herramientas) y 12 ROI/ahorro vs Buffalo con la cuenta visible. Usa CRM + esta conversación. Guarda con merge/save_knowledge.'
    )
  }

  const askRoiBaseline = async () => {
    await sendMessage(
      'Activa la skill roi_baseline ahora. Pregúntame lo necesario sobre el proceso MANUAL previo: horas/semana o mes, roles, personas (FTE), ordenadores/líneas, software previo, coste €/hora o salarial, y volumen de casos. Luego calcula y guarda las secciones baseline_manual y roi_ahorro comparando con la mensualidad Buffalo.'
    )
  }

  const askValidateChecklist = async () => {
    await sendMessage(
      'Valida ahora las 3 tarjetas del contexto con update_audit_checklist. Comprueba: (1) db_access — ¿Postgres conectado y entiendes tablas/columnas clave? (2) roi_resolved — ¿secciones 11–12 con tiempo, dinero, recursos y ROI? (3) project_understood — ¿entiendes producto, flujos y operativa? Marca ok=true solo si está realmente bien; si no, ok=false con qué falta. Resume el resultado.'
    )
  }

  const openPromptModal = (audience: RetencionReportAudience) => {
    setPromptAudience(audience)
    setPromptDraft(
      audience === 'buffalo'
        ? config?.report_prompt_buffalo || DEFAULT_RETENCION_REPORT_PROMPT_BUFFALO
        : config?.report_prompt || DEFAULT_RETENCION_REPORT_PROMPT
    )
  }

  const savePrompt = async () => {
    if (!promptAudience) return
    setSavingPrompt(true)
    setError('')
    try {
      const body =
        promptAudience === 'buffalo'
          ? { report_prompt_buffalo: promptDraft }
          : { report_prompt: promptDraft }
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/agent-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error guardando prompt')
      setConfig(data.config)
      setPromptAudience(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSavingPrompt(false)
    }
  }

  const resetPromptDefault = () => {
    if (!promptAudience) return
    setPromptDraft(
      promptAudience === 'buffalo'
        ? DEFAULT_RETENCION_REPORT_PROMPT_BUFFALO
        : DEFAULT_RETENCION_REPORT_PROMPT
    )
  }

  const generateReport = async (audience: RetencionReportAudience) => {
    setGeneratingAudience(audience)
    setError('')
    setEditingReport(false)
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/monthly-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: genYear,
          month: genMonth,
          compare_previous: true,
          audience,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error generando informe')
      setReportMd(data.report?.content || '')
      setReportId(data.report?.id || null)
      setReportTitle(data.report?.title || '')
      setReportYear(data.report?.year ?? genYear)
      setReportMonth(data.report?.month ?? genMonth)
      setReportAudience(data.report?.audience === 'buffalo' ? 'buffalo' : 'client')
      setVersions([])
      setDirty(false)
      setPhase(2)
      const hist = await fetch(`/api/retencion/proyectos/${proyectoId}/monthly-report`)
      const histData = await hist.json()
      if (hist.ok && Array.isArray(histData.reports)) setReportHistory(histData.reports)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setGeneratingAudience(null)
    }
  }

  const loadHistoryReport = (r: (typeof reportHistory)[0]) => {
    setReportMd(r.content)
    setReportId(r.id)
    setReportTitle(r.title || '')
    setReportYear(r.year)
    setReportMonth(r.month)
    setReportAudience(r.audience === 'buffalo' ? 'buffalo' : 'client')
    setGenYear(r.year)
    setGenMonth(r.month)
    setEditingReport(false)
    setVersions([])
    setDirty(false)
  }

  const discoverMetricsNow = async () => {
    setDiscoveringMetrics(true)
    setError('')
    setMetricsNote('')
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/metrics/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error descubriendo métricas')
      const count = Array.isArray(data.metrics) ? data.metrics.length : 0
      setMetricsNote(
        count
          ? `${count} métricas detectadas (${data.schema_tables || 0} tablas). Se usarán en el próximo informe.`
          : data.note || 'No se detectaron métricas.'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setDiscoveringMetrics(false)
    }
  }

  const applyChatContent = (newContent: string) => {
    setVersions((v) => [...v, reportMd])
    setReportMd(newContent)
    setDirty(true)
  }

  const undoContent = () => {
    setVersions((v) => {
      if (v.length === 0) return v
      const prev = v[v.length - 1]
      setReportMd(prev)
      return v.slice(0, -1)
    })
  }

  const exportReportPdf = async () => {
    if (!reportPreviewRef.current || !reportMd.trim()) return
    setExportingPdf(true)
    setError('')
    try {
      const { exportBuffaloReportPdf } = await import(
        '@/components/retencion/report/exportReportPdf'
      )
      const audLabel = reportAudience === 'buffalo' ? 'buffalo' : 'cliente'
      const name = `informe-retencion-${audLabel}-${reportMonth || genMonth}-${reportYear || genYear}.pdf`
      await exportBuffaloReportPdf({
        rootId: 'buffalo-report',
        fileName: name,
        audience: reportAudience === 'buffalo' ? 'buffalo' : 'client',
        docTitle: reportTitle || '',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error exportando PDF')
    } finally {
      setExportingPdf(false)
    }
  }

  const saveReportEdits = async () => {
    if (!reportMd.trim()) return
    // Valida que las directivas BRM (:::) estén balanceadas antes de guardar
    const fences = (reportMd.match(/^:::/gm) || []).length
    if (fences % 2 !== 0) {
      setError('Directivas BRM sin balancear: revisa que cada ::: de apertura tenga su ::: de cierre.')
      return
    }
    setSavingReport(true)
    setError('')
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/monthly-report`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reportId || undefined,
          year: reportYear || undefined,
          month: reportMonth || undefined,
          audience: reportAudience || undefined,
          title: reportTitle || undefined,
          content: reportMd,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error guardando informe')
      setReportId(data.report?.id || reportId)
      setReportTitle(data.report?.title || reportTitle)
      setEditingReport(false)
      setDirty(false)
      setVersions([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSavingReport(false)
    }
  }

  // Mantener borradores de contexto alineados con lo que guarda el agente
  useEffect(() => {
    if (!contextOpen && config) {
      setKnowledgeDraft(config.audit_knowledge || '')
      setSchemaDraft(config.schema_summary || '')
    }
  }, [config?.audit_knowledge, config?.schema_summary, config?.updated_at, contextOpen])

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-zinc-400">Cargando agente de retención…</div>
    )
  }

  const hasSavedContext = Boolean(config?.audit_knowledge?.trim())
  const empty = thread.length === 0 && !sending

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <PhaseCarousel
        phase={phase}
        onPhaseChange={setPhase}
        phases={[
          {
            id: 'audit',
            n: '1',
            title: 'Auditoría',
            subtitle: 'CRM + preguntas + Postgres',
          },
          {
            id: 'context',
            n: '2',
            title: 'Contexto',
            subtitle: 'Documento + validación',
          },
          {
            id: 'report',
            n: '3',
            title: 'Informe',
            subtitle: 'Prompt + valor',
          },
        ]}
      >
        {/* ═══ FASE 1 ═══ */}
        <section data-no-drag className="space-y-2">
        <div className="flex flex-wrap items-center justify-center gap-2 py-1">
          <StatusPill tone={config?.audit_status === 'ready' ? 'ok' : 'neutral'}>
            {statusLabel[config?.audit_status || 'pending']}
          </StatusPill>
          {config?.db_connected ? (
            <StatusPill tone="ok">
              <Database className="h-3.5 w-3.5" />
              {config.db_host || 'Postgres'}
            </StatusPill>
          ) : (
            <StatusPill tone="action" onClick={() => setShowDbInChat(true)}>
              <Database className="h-3.5 w-3.5" />
              Conectar Postgres
            </StatusPill>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          <div className="h-[min(68vh,720px)] min-h-[480px] overflow-y-auto">
            <div className="w-full px-4 sm:px-6 py-4 space-y-4">
              {empty && (
                <div className="text-center py-16 space-y-4">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-white">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
                    Empieza la auditoría: el agente carga el CRM y te pregunta coste manual, ROI y
                    operativa.
                  </p>
                  <Button type="button" className="rounded-full h-10 px-5" onClick={() => void startAudit()}>
                    Empezar auditoría
                  </Button>
                </div>
              )}

              {thread.map((m) => {
                if (m.role === 'db_card') {
                  return (
                    <div key={m.id} className="flex justify-start">
                      <div className="w-full max-w-3xl">
                        <DbConnectCard
                          saving={savingDb}
                          onSave={saveDb}
                          alreadyConnected={config?.db_connected}
                          host={config?.db_host}
                        />
                      </div>
                    </div>
                  )
                }
                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div
                        className={cn(
                          'max-w-[min(100%,42rem)] rounded-2xl rounded-br-md bg-zinc-900 text-white px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap shadow-sm',
                          m.pending && 'opacity-80'
                        )}
                      >
                        {m.content}
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={m.id} className="flex justify-start gap-3">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1 max-w-4xl pt-0.5">
                      <MarkdownBody content={m.content} />
                    </div>
                  </div>
                )
              })}

              {sending && (
                <div className="flex justify-start gap-3">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <ThinkingIndicator label={thinkingLabel} />
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="border-t border-zinc-200/80 bg-white px-4 sm:px-8 lg:px-10 py-3">
            <div className="relative flex items-end gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 focus-within:border-zinc-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-zinc-100">
              <textarea
                ref={textareaRef}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onPaste={(e) => {
                  e.stopPropagation()
                  const text = e.clipboardData?.getData('text/plain')
                  if (text == null) return
                  e.preventDefault()
                  const el = e.currentTarget
                  const start = el.selectionStart ?? reply.length
                  const end = el.selectionEnd ?? reply.length
                  const next = reply.slice(0, start) + text + reply.slice(end)
                  setReply(next)
                  requestAnimationFrame(() => {
                    const pos = start + text.length
                    el.setSelectionRange(pos, pos)
                  })
                }}
                placeholder="Responde al agente de auditoría…"
                rows={1}
                disabled={sending}
                className="min-h-[48px] max-h-44 w-full flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-[15px] leading-6 text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-0"
                onKeyDown={(e) => {
                  if (e.ctrlKey || e.metaKey || e.altKey) return
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendMessage(reply)
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                className="rounded-full h-9 w-9 shrink-0 mb-0.5"
                disabled={sending || !reply.trim()}
                onClick={() => void sendMessage(reply)}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </section>

        {/* ═══ FASE 2 ═══ */}
        <section data-no-drag className="space-y-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {hasSavedContext ? (
            <StatusPill tone="ok">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Contexto guardado
            </StatusPill>
          ) : (
            <StatusPill tone="warn">Pendiente de guardar</StatusPill>
          )}
          <StatusPill tone="neutral" onClick={() => void refreshCrmKnowledge(false)}>
            <Database className="h-3.5 w-3.5" />
            Cargar CRM
          </StatusPill>
          <StatusPill
            tone="neutral"
            onClick={() => {
              if (
                typeof window !== 'undefined' &&
                !window.confirm(
                  '¿Sobrescribir el contexto guardado con un seed fresco del CRM? Se perderán ediciones manuales / de entrevista.'
                )
              ) {
                return
              }
              void refreshCrmKnowledge(true)
            }}
          >
            Sobrescribir CRM
          </StatusPill>
          <StatusPill tone="action" onClick={() => void askRoiBaseline()}>
            <Sparkles className="h-3.5 w-3.5" />
            Entrevista ROI
          </StatusPill>
          <StatusPill
            tone="neutral"
            onClick={() => {
              setKnowledgeDraft(config?.audit_knowledge || '')
              setSchemaDraft(config?.schema_summary || '')
              setContextOpen((v) => !v)
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            {contextOpen ? 'Cerrar editor' : 'Revisar / editar'}
          </StatusPill>
          <StatusPill tone="action" onClick={() => void askValidateChecklist()}>
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Validar con el agente
          </StatusPill>
        </div>

        <ChecklistCards checklist={config?.audit_checklist} />

        {!contextOpen && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            {hasSavedContext ? (
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-zinc-50 border border-zinc-100 p-4 text-[13px] leading-6 text-zinc-700 font-mono">
                {config?.audit_knowledge}
              </pre>
            ) : (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-zinc-400">
                  Aún no hay contexto. Continúa la auditoría o edítalo a mano.
                </p>
                {thread.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={sending}
                    onClick={() => void askConsolidateContext()}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Pedir al agente que consolide
                  </Button>
                )}
              </div>
            )}
            {config?.schema_summary?.trim() && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                  Schema Postgres
                </p>
                <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-xl bg-zinc-50 border border-zinc-100 p-3 text-[12px] leading-5 text-zinc-600 font-mono">
                  {config.schema_summary}
                </pre>
              </div>
            )}
          </div>
        )}

        {contextOpen && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
                Contexto
              </label>
              <Textarea
                value={knowledgeDraft}
                onChange={(e) => setKnowledgeDraft(e.target.value)}
                rows={12}
                className="mt-1.5 rounded-xl text-[13px] leading-6 font-mono"
                placeholder="Qué es el producto, flujos, integraciones, métricas, riesgos…"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
                Schema / tablas
              </label>
              <Textarea
                value={schemaDraft}
                onChange={(e) => setSchemaDraft(e.target.value)}
                rows={5}
                className="mt-1.5 rounded-xl text-[13px] leading-6 font-mono"
                placeholder="Tablas clave y para qué sirven…"
              />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                className="rounded-full"
                disabled={savingContext || !knowledgeDraft.trim()}
                onClick={() => void saveContext()}
              >
                {savingContext ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar contexto
              </Button>
              {!hasSavedContext && thread.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={sending}
                  onClick={() => void askConsolidateContext()}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Consolida el agente
                </Button>
              )}
            </div>
          </div>
        )}
      </section>

        {/* ═══ FASE 3 ═══ */}
        <section data-no-drag className="space-y-4">
        {/* Panel de generación */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900">Generar informe mensual</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Elige periodo y destinatario del informe.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            {config?.db_connected && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full h-9"
                disabled={discoveringMetrics}
                onClick={() => void discoverMetricsNow()}
                title="Analiza la BD del cliente y propone métricas reales para los informes"
              >
                {discoveringMetrics ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Database className="h-4 w-4 mr-1.5" />
                )}
                Descubrir métricas
              </Button>
            )}
            <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 p-1">
              <select
                value={genMonth}
                onChange={(e) => setGenMonth(Number(e.target.value))}
                className="h-8 rounded-full bg-transparent px-2.5 text-sm font-medium text-zinc-800 outline-none"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, '0')}
                  </option>
                ))}
              </select>
              <span className="text-zinc-300">/</span>
              <select
                value={genYear}
                onChange={(e) => setGenYear(Number(e.target.value))}
                className="h-8 rounded-full bg-transparent px-2.5 text-sm font-medium text-zinc-800 outline-none"
              >
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            </div>
          </div>

          {metricsNote && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-center text-emerald-800">
              {metricsNote}
            </p>
          )}

          {!hasSavedContext && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-center text-amber-800">
              Primero completa y guarda el contexto (fase 2) para poder generar informes.
            </p>
          )}

          {/* Dos opciones de destinatario */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                {
                  audience: 'buffalo' as const,
                  title: 'Para Buffalo',
                  desc: 'Interno: mejoras, churn, upsell y acciones del equipo.',
                  Icon: Building2,
                  accent: 'text-indigo-600 bg-indigo-50 ring-indigo-100',
                },
                {
                  audience: 'client' as const,
                  title: 'Para el cliente',
                  desc: 'Valor, KPIs, ROI y plan del mes.',
                  Icon: UserRound,
                  accent: 'text-emerald-600 bg-emerald-50 ring-emerald-100',
                },
              ] as const
            ).map((box) => {
              const busy = generatingAudience === box.audience
              const anyBusy = generatingAudience != null
              return (
                <div
                  key={box.audience}
                  className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 transition hover:border-zinc-300"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
                        box.accent
                      )}
                    >
                      <box.Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900">{box.title}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{box.desc}</p>
                    </div>
                  </div>
                  <div className="mt-3.5 flex items-center gap-2">
                    <Button
                      type="button"
                      className="flex-1 rounded-full h-9"
                      disabled={!hasSavedContext || anyBusy}
                      onClick={() => void generateReport(box.audience)}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-1.5" />
                      )}
                      Generar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full h-9 px-3"
                      onClick={() => openPromptModal(box.audience)}
                      title="Ver / editar prompt"
                    >
                      <Eye className="h-4 w-4" />
                      <span className="ml-1.5 hidden sm:inline">Prompt</span>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <Dialog
          open={promptAudience != null}
          onOpenChange={(open) => {
            if (!open) setPromptAudience(null)
          }}
        >
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {promptAudience === 'buffalo'
                  ? 'Prompt — informe Buffalo'
                  : 'Prompt — informe cliente'}
              </DialogTitle>
            </DialogHeader>
            <Textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={14}
              className="rounded-xl text-[12px] leading-5 font-mono"
            />
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                className="rounded-full"
                onClick={() => resetPromptDefault()}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Default
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setPromptAudience(null)}
              >
                Cerrar
              </Button>
              <Button
                type="button"
                className="rounded-full"
                disabled={savingPrompt || promptDraft.trim().length < 20}
                onClick={() => void savePrompt()}
              >
                {savingPrompt ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                )}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Histórico como tira horizontal */}
        {reportHistory.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Histórico
            </span>
            {reportHistory.map((r) => {
              const active = r.id === reportId
              const aud = r.audience === 'buffalo' ? 'buffalo' : 'client'
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => loadHistoryReport(r)}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                    active
                      ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                  )}
                >
                  {aud === 'buffalo' ? (
                    <Building2 className="h-3 w-3" />
                  ) : (
                    <UserRound className="h-3 w-3" />
                  )}
                  {String(r.month).padStart(2, '0')}/{r.year}
                  <span className={cn(active ? 'text-zinc-300' : 'text-zinc-400')}>
                    · {aud === 'buffalo' ? 'Buffalo' : 'Cliente'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="min-w-0">
        {!reportMd ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-zinc-400 ring-1 ring-zinc-100">
              <FileText className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-medium text-zinc-600">Ningún informe abierto</p>
            <p className="mt-1 text-xs text-zinc-400 max-w-xs">
              Genera un informe con los botones de arriba o abre uno del histórico.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-zinc-100 bg-zinc-50/80">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {reportAudience && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        reportAudience === 'buffalo'
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'bg-emerald-50 text-emerald-700'
                      )}
                    >
                      {reportAudience === 'buffalo' ? (
                        <Building2 className="h-3 w-3" />
                      ) : (
                        <UserRound className="h-3 w-3" />
                      )}
                      {reportAudience === 'buffalo' ? 'Buffalo' : 'Cliente'}
                    </span>
                  )}
                  <p className="text-sm font-semibold text-zinc-900 truncate">
                    {reportTitle || 'Informe mensual'}
                  </p>
                  {dirty && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Cambios sin guardar
                    </span>
                  )}
                </div>
                {(reportMonth || reportYear) && (
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    Periodo {String(reportMonth).padStart(2, '0')}/{reportYear}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!editingReport && (
                  <select
                    value={reportTheme}
                    onChange={(e) => setReportTheme(e.target.value as BuffaloThemeName)}
                    className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700"
                    title="Tema del informe"
                  >
                    <option value="light">Tema claro</option>
                    <option value="dark">Tema oscuro</option>
                    <option value="green">Tema verde</option>
                  </select>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full h-8"
                  disabled={exportingPdf}
                  onClick={() => void exportReportPdf()}
                >
                  {exportingPdf ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  PDF
                </Button>
                {!editingReport && versions.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full h-8"
                    onClick={undoContent}
                    title="Deshacer último cambio del chat"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Deshacer
                  </Button>
                )}
                {!editingReport && dirty && (
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-full h-8"
                    disabled={savingReport || !reportMd.trim()}
                    onClick={() => void saveReportEdits()}
                  >
                    {savingReport ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Guardar
                  </Button>
                )}
                {!editingReport ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full h-8"
                    onClick={() => setEditingReport(true)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Editar
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-full h-8"
                      onClick={() => setEditingReport(false)}
                    >
                      Vista previa
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full h-8"
                      disabled={savingReport || !reportMd.trim()}
                      onClick={() => void saveReportEdits()}
                    >
                      {savingReport ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Guardar
                    </Button>
                  </>
                )}
              </div>
            </div>

            {editingReport ? (
              <div className="p-4 space-y-3">
                <Input
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="Título del informe"
                  className="rounded-xl"
                />
                <Textarea
                  value={reportMd}
                  onChange={(e) => setReportMd(e.target.value)}
                  rows={22}
                  className="rounded-xl text-[13px] leading-6 font-mono"
                />
                <p className="text-[11px] text-zinc-400">
                  Edición del markdown BRM crudo. Al guardar se vuelve a renderizar con la
                  plantilla Buffalo.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_360px]">
              <div className="overflow-x-auto bg-zinc-100/70 p-4 sm:p-6">
                <BuffaloReport
                  ref={reportPreviewRef}
                  theme={reportTheme}
                  report={{
                    title: reportTitle || 'Informe mensual',
                    content: reportMd,
                    audience: reportAudience || 'client',
                    year: reportYear || genYear,
                    month: reportMonth || genMonth,
                  }}
                  client={{ name: clientName, company: clientCompany }}
                />
              </div>
              <div className="border-t border-zinc-100 p-3 lg:border-l lg:border-t-0 lg:h-[720px]">
                <ReportEditChat
                  proyectoId={proyectoId}
                  reportId={reportId}
                  content={reportMd}
                  onContentUpdate={(c) => applyChatContent(c)}
                />
              </div>
              </div>
            )}
          </div>
        )}
        </div>
      </section>
      </PhaseCarousel>
    </div>
  )
}

