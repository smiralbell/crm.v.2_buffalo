'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AuditViewTabs, type AuditWorkspaceView } from '@/components/onboarding/audit/AuditViewTabs'
import { AuditDocumentView } from '@/components/onboarding/audit/AuditDocumentView'
import { AuditMapView } from '@/components/onboarding/audit/AuditMapView'
import { AuditBlockNav } from '@/components/onboarding/audit/AuditBlockNav'
import { AuditReportPreview } from '@/components/onboarding/audit/AuditReportPreview'
import { AuditEditAnswerDialog } from '@/components/onboarding/audit/AuditEditAnswerDialog'
import {
  ChevronLeft,
  Loader2,
  SkipForward,
  Ban,
  HelpCircle,
  StickyNote,
  MessageSquarePlus,
  ClipboardCheck,
  Sparkles,
  Play,
  Send,
  ListTodo,
  AlertTriangle,
  RefreshCw,
  Save,
  CornerDownRight,
  Flag,
  FileText,
  Pencil,
} from 'lucide-react'
import {
  AUDIT_CONTEXT_SECTIONS,
  AUDIT_PROJECT_TYPES,
  modeLabel,
  type AuditAnswerAction,
  type AuditAreaId,
  type AuditGap,
  type AuditMode,
  type AuditProjectType,
  type AuditQuestion,
  type CurrentQuestion,
  type ProjectAudit,
} from '@/lib/onboarding/audit/types'
import {
  computeBlockStatus,
  type AuditBlockProgress,
} from '@/lib/onboarding/audit/blocks'

type AreaProgress = {
  id: AuditAreaId | string
  label: string
  answered: number
  critical_missing: number
  sufficiency: number
}

type ApiPayload = {
  audit: ProjectAudit
  current_question: CurrentQuestion | null
  areas: AreaProgress[]
  blocks?: AuditBlockProgress[]
  block_progress?: { completed: number; total: number; percent: number }
  analysis?: { message: string; enough_for_proposal: boolean; gaps: AuditGap[] }
  pending_count?: number
  ai_error?: string | null
  can_retry_generate?: boolean
  proposal?: {
    brief: string
    completeness: { percent: number; criticalMissing: string[]; enoughForProposal: boolean }
    warn_critical?: boolean
  }
  report?: { markdown: string; generated_at: string; completeness_percent: number }
  completeness?: { percent: number; criticalMissing: string[]; enoughForProposal: boolean }
  warn_critical?: boolean
  error?: string
}

const AGENTS: { id: AuditMode; label: string }[] = [
  { id: 'descubrimiento', label: 'Descubrimiento' },
  { id: 'roi', label: 'ROI' },
  { id: 'funcional', label: 'Funcional' },
  { id: 'tecnico', label: 'Técnico' },
  { id: 'integraciones', label: 'Integraciones' },
  { id: 'presupuesto', label: 'Presupuesto' },
  { id: 'cerrar_huecos', label: 'Cerrar huecos' },
]

function sufficiencyColor(n: number) {
  if (n >= 70) return 'bg-emerald-500'
  if (n >= 40) return 'bg-amber-400'
  return 'bg-rose-400'
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    confirmed: 'bg-emerald-50 text-emerald-800',
    answered: 'bg-emerald-50 text-emerald-800',
    estimated: 'bg-amber-50 text-amber-800',
    pending_confirmation: 'bg-amber-50 text-amber-800',
    unknown: 'bg-zinc-100 text-zinc-600',
    not_applicable: 'bg-zinc-100 text-zinc-500',
    ai_inference: 'bg-sky-50 text-sky-800',
    skipped: 'bg-orange-50 text-orange-800',
    pending: 'bg-sky-50 text-sky-800',
  }
  return map[status] || 'bg-zinc-100 text-zinc-600'
}

export default function OnboardingAuditPage() {
  const router = useRouter()
  const { lead, nombre, empresa, email } = router.query as Record<string, string>
  const leadId = Number(lead)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [aiError, setAiError] = useState<string | null>(null)
  const [audit, setAudit] = useState<ProjectAudit | null>(null)
  const [question, setQuestion] = useState<CurrentQuestion | null>(null)
  const [areas, setAreas] = useState<AreaProgress[]>([])
  const [answer, setAnswer] = useState('')
  const [multiSel, setMultiSel] = useState<string[]>([])
  const [otherText, setOtherText] = useState('')
  const [showOther, setShowOther] = useState(false)
  const [analysisMsg, setAnalysisMsg] = useState<string | null>(null)
  const [setupTypes, setSetupTypes] = useState<AuditProjectType[]>(['unclear'])
  const [needsTypeSetup, setNeedsTypeSetup] = useState(false)
  const [meetingStarted, setMeetingStarted] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [gapsOpen, setGapsOpen] = useState(false)
  const [lateQuestion, setLateQuestion] = useState<AuditQuestion | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [proposalWarn, setProposalWarn] = useState<{ brief: string; missing: string[] } | null>(
    null
  )
  const [workspaceView, setWorkspaceView] = useState<AuditWorkspaceView>('chat')
  const [blocks, setBlocks] = useState<AuditBlockProgress[]>([])
  const [reportOpen, setReportOpen] = useState(false)
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [editTarget, setEditTarget] = useState<{
    answerId?: string
    questionId?: string
    text: string
  } | null>(null)

  const clientLabel = useMemo(
    () =>
      [nombre, empresa].filter(Boolean).join(' · ') ||
      email ||
      (lead ? `Lead #${lead}` : 'Cliente'),
    [nombre, empresa, email, lead]
  )

  const applyPayload = (data: ApiPayload) => {
    setAudit(data.audit)
    setQuestion(data.current_question)
    setAreas(data.areas || [])
    setPendingCount(data.pending_count ?? 0)
    setBlocks(data.blocks?.length ? data.blocks : computeBlockStatus(data.audit))
    if (data.report?.markdown) setReportMarkdown(data.report.markdown)
    else if (data.audit.report?.markdown) setReportMarkdown(data.audit.report.markdown)
    if (data.analysis?.message) setAnalysisMsg(data.analysis.message)
    if (data.ai_error) setAiError(data.ai_error)
    else setAiError(null)
    setAnswer('')
    setMultiSel([])
    setOtherText('')
    setShowOther(false)
  }

  const load = useCallback(async () => {
    if (!leadId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/audit?lead_id=${leadId}`)
      const data = (await res.json()) as ApiPayload
      if (!res.ok) throw new Error(data.error || 'Error cargando auditoría')
      applyPayload(data)
      const types = data.audit.project_types || []
      const hasStarted = Boolean(
        data.audit.started_at ||
          (data.audit.questions || []).length > 0 ||
          (data.audit.conversation || []).some((t) => t.message_type === 'question')
      )
      if (!types.length || (types.length === 1 && types[0] === 'unclear' && !hasStarted)) {
        setNeedsTypeSetup(true)
        setSetupTypes(types.length ? types : ['unclear'])
      } else {
        setNeedsTypeSetup(false)
      }
      setMeetingStarted(hasStarted)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    if (!router.isReady) return
    if (!leadId) {
      setError('Falta lead en la URL')
      setLoading(false)
      return
    }
    void load()
  }, [router.isReady, leadId, load])

  useEffect(() => {
    if (workspaceView !== 'chat') return
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [audit?.conversation, question, workspaceView])

  const postAction = async (body: Record<string, unknown>) => {
    if (!audit) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/audit/${audit.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as ApiPayload
      if (!res.ok) throw new Error(data.error || 'Error')
      applyPayload(data)
      setMeetingStarted(true)
      return data
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const submitAnswer = (
    answer_action: AuditAnswerAction,
    opts?: {
      questionId?: string
      text?: string
      value?: string | number | boolean | string[] | null
      late?: boolean
    }
  ) => {
    const qid = opts?.questionId || question?.id || lateQuestion?.id
    if (!qid) return
    if (answer_action === 'save_continue') {
      const text = (opts?.text ?? answer).trim()
      const val = opts?.value
      if (!text && (val == null || (Array.isArray(val) && !val.length))) {
        setError('Escribe o selecciona una respuesta, o usa Omitir / No aplica')
        return
      }
    }
    void postAction({
      action: 'answer',
      question_id: qid,
      answer: opts?.text ?? answer,
      value: opts?.value,
      answer_action,
      late: opts?.late || false,
      mode: audit?.active_mode,
    }).then(() => {
      if (opts?.late) {
        setLateQuestion(null)
        setPendingOpen(false)
      }
    })
  }

  const changeAgent = (mode: AuditMode) => {
    if (!meetingStarted || saving) return
    void postAction({ action: 'patch', active_mode: mode })
  }

  const startMeeting = async () => {
    if (!leadId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/onboarding/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          project_types: needsTypeSetup ? setupTypes : audit?.project_types || ['unclear'],
          start_meeting: true,
        }),
      })
      const data = (await res.json()) as ApiPayload
      if (!res.ok) throw new Error(data.error || 'Error')
      applyPayload(data)
      setNeedsTypeSetup(false)
      setMeetingStarted(true)
      setWorkspaceView('chat')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const toggleType = (t: AuditProjectType) => {
    setSetupTypes((prev) => {
      if (t === 'unclear') return ['unclear']
      const without = prev.filter((x) => x !== 'unclear' && x !== t)
      if (prev.includes(t)) return without.length ? without : ['unclear']
      return [...without, t]
    })
  }

  const goToProposal = async (force = false) => {
    if (!audit) return
    setSaving(true)
    try {
      const res = await fetch(`/api/onboarding/audit/${audit.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'proposal_payload' }),
      })
      const data = (await res.json()) as ApiPayload
      if (!res.ok) throw new Error(data.error || 'Error')
      const missing =
        data.proposal?.completeness?.criticalMissing || data.completeness?.criticalMissing || []
      if (missing.length && !force) {
        setProposalWarn({ brief: data.proposal?.brief || '', missing })
        return
      }
      const params = new URLSearchParams()
      if (lead) params.set('lead', lead)
      if (nombre) params.set('nombre', nombre)
      if (empresa) params.set('empresa', empresa)
      if (email) params.set('email', email)
      params.set('tipo', 'auditoria')
      if (data.proposal?.brief) {
        try {
          sessionStorage.setItem(`audit_brief_${leadId}`, data.proposal.brief)
        } catch {
          /* ignore */
        }
      }
      router.push(`/onboarding/custom?${params.toString()}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const pendingQuestions = useMemo(
    () =>
      (audit?.questions || []).filter((q) =>
        ['pending', 'skipped', 'unknown', 'buffalo_later'].includes(q.status)
      ),
    [audit?.questions]
  )

  const activeInteractive = question

  const onSelectSingle = (value: string, label: string) => {
    if (value === '__other__') {
      setShowOther(true)
      return
    }
    submitAnswer('save_continue', { text: label, value })
  }

  const confirmMulti = () => {
    const vals = [...multiSel]
    if (showOther && otherText.trim()) vals.push(otherText.trim())
    if (!vals.length) {
      setError('Selecciona al menos una opción')
      return
    }
    submitAnswer('save_continue', { text: vals.join(', '), value: vals })
  }

  const onMapUpdate = async (payload: {
    field_key: string
    map_checked?: boolean
    note?: string | null
  }) => {
    await postAction({ action: 'patch', map_update: payload })
  }

  const focusBlock = (blockId: string) => {
    if (!meetingStarted || saving) return
    setWorkspaceView('chat')
    void postAction({ action: 'focus_block', block_id: blockId })
  }

  return (
    <Layout>
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        La auditoría estructurada queda en modo lectura. El flujo activo es el{' '}
        <a
          className="font-medium underline underline-offset-2"
          href={
            Number.isFinite(leadId) && leadId > 0
              ? `/onboarding/notas?lead=${leadId}${nombre ? `&nombre=${encodeURIComponent(nombre)}` : ''}${empresa ? `&empresa=${encodeURIComponent(empresa)}` : ''}`
              : '/onboarding'
          }
        >
          cuaderno de reuniones
        </a>
        . El histórico de auditorías se conserva.
      </div>
      <div className="flex flex-col h-[calc(100vh-5.5rem)] min-h-[640px] -mx-1">
        {/* Top bar */}
        <div className="shrink-0 rounded-[1.75rem] bg-white/80 backdrop-blur-xl ring-1 ring-zinc-200/70 px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 min-w-0 shrink-0">
              <button
                type="button"
                onClick={() => router.push('/onboarding')}
                className="h-10 w-10 rounded-2xl bg-zinc-100/90 ring-1 ring-zinc-200/60 flex items-center justify-center hover:bg-zinc-200/70 transition-colors shrink-0"
              >
                <ChevronLeft className="h-4 w-4 text-zinc-700" />
              </button>
              <div className="min-w-0">
                <h1 className="text-[17px] font-semibold tracking-tight text-zinc-900 truncate">
                  Auditoría
                </h1>
                <p className="text-[12px] text-zinc-500 truncate">{clientLabel}</p>
              </div>
            </div>

            <div className="flex-1 flex justify-center min-w-[12rem]">
              <AuditViewTabs value={workspaceView} onChange={setWorkspaceView} />
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto flex-wrap justify-end">
              {meetingStarted && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-2xl border-zinc-200"
                  onClick={() => router.push('/onboarding?tab=projects')}
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Guardar
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="rounded-2xl border-zinc-200"
                disabled={!audit || !meetingStarted || saving}
                onClick={() => void postAction({ action: 'follow_up' })}
              >
                <CornerDownRight className="h-3.5 w-3.5 mr-1.5" />
                Seguimiento
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-2xl border-zinc-200"
                disabled={!audit || !meetingStarted}
                onClick={() => setNoteOpen(true)}
              >
                <StickyNote className="h-3.5 w-3.5 mr-1.5" />
                Nota
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-2xl border-zinc-200"
                disabled={!audit || !meetingStarted}
                onClick={() => setPendingOpen(true)}
              >
                <ListTodo className="h-3.5 w-3.5 mr-1.5" />
                Pendientes ({pendingCount || pendingQuestions.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-2xl border-zinc-200"
                disabled={!audit || saving || !meetingStarted}
                onClick={async () => {
                  await postAction({ action: 'analyze' })
                  setGapsOpen(true)
                }}
              >
                <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
                Huecos
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-2xl border-zinc-200"
                disabled={!audit || !meetingStarted || saving}
                onClick={async () => {
                  const data = await postAction({ action: 'finalize' })
                  if (data?.report?.markdown) setReportMarkdown(data.report.markdown)
                  setReportOpen(true)
                }}
              >
                <Flag className="h-3.5 w-3.5 mr-1.5" />
                Finalizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-2xl border-zinc-200"
                disabled={!audit || !meetingStarted}
                onClick={() => {
                  setReportMarkdown(audit?.report?.markdown || reportMarkdown)
                  setReportOpen(true)
                }}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Informe
              </Button>
              <Button
                size="sm"
                className="rounded-2xl bg-zinc-900 hover:bg-zinc-800"
                disabled={!audit || !meetingStarted || saving}
                onClick={() => void goToProposal(false)}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Propuesta
              </Button>
            </div>
          </div>

          {meetingStarted && (
            <nav className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {AGENTS.map((agent) => {
                const active = audit?.active_mode === agent.id
                return (
                  <button
                    key={agent.id}
                    type="button"
                    disabled={saving || loading}
                    onClick={() => changeAgent(agent.id)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] transition-all disabled:opacity-40 ${
                      active
                        ? 'bg-zinc-900 text-white font-medium shadow-sm'
                        : 'bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/70'
                    }`}
                  >
                    {agent.label}
                  </button>
                )
              })}
            </nav>
          )}
        </div>

        {needsTypeSetup && !meetingStarted && !loading && (
          <div className="shrink-0 mt-3 flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-[11px] text-zinc-500 mr-1">Tipo de proyecto:</span>
            {AUDIT_PROJECT_TYPES.map((t) => {
              const on = setupTypes.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleType(t.id)}
                  className={`px-3 py-1.5 rounded-full text-[11px] transition-colors ${
                    on
                      ? 'bg-zinc-900 text-white'
                      : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        )}

        {error && (
          <div className="shrink-0 mt-3 text-sm text-rose-700 bg-rose-50/90 ring-1 ring-rose-100 rounded-[1.15rem] px-4 py-2.5">
            {error}
          </div>
        )}
        {aiError && (
          <div className="shrink-0 mt-3 text-sm text-amber-900 bg-amber-50/90 ring-1 ring-amber-100 rounded-[1.15rem] px-4 py-2.5 flex items-center justify-between gap-3">
            <span>Respuesta guardada. Falló la siguiente pregunta: {aiError}</span>
            <Button
              size="sm"
              variant="outline"
              className="rounded-2xl shrink-0"
              disabled={saving}
              onClick={() => void postAction({ action: 'retry_generate' })}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Reintentar
            </Button>
          </div>
        )}
        {analysisMsg && (
          <div className="shrink-0 mt-3 text-sm text-sky-900 bg-sky-50/90 ring-1 ring-sky-100 rounded-[1.15rem] px-4 py-2.5">
            {analysisMsg}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-zinc-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)_17rem] min-h-0 mt-3 gap-3">
            <aside className="hidden lg:flex flex-col min-h-0 rounded-[1.85rem] bg-white ring-1 ring-zinc-200/70 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
              <AuditBlockNav
                blocks={blocks.length ? blocks : computeBlockStatus(audit)}
                activeBlock={audit?.meta?.active_block}
                disabled={!meetingStarted || saving}
                onSelect={focusBlock}
              />
            </aside>

            <section className="flex flex-col min-h-0 rounded-[1.85rem] bg-white ring-1 ring-zinc-200/70 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
              {!meetingStarted ? (
                <div className="flex-1 flex flex-col items-center justify-center px-8 text-center bg-[radial-gradient(ellipse_at_top,_#fafafa_0%,_#ffffff_55%)]">
                  <div className="h-14 w-14 rounded-[1.35rem] bg-zinc-900 text-white flex items-center justify-center mb-5 shadow-lg shadow-zinc-900/20">
                    <Play className="h-5 w-5 fill-current ml-0.5" />
                  </div>
                  <p className="text-xl font-semibold tracking-tight text-zinc-900 mb-2">
                    Listo para la reunión
                  </p>
                  <p className="text-[15px] text-zinc-500 max-w-md mb-8 leading-relaxed">
                    Chat para responder en vivo, documento con el guion completo, y mapa para tachar
                    lo importante con notas.
                  </p>
                  <Button
                    size="lg"
                    className="rounded-[1.25rem] h-12 px-8 bg-zinc-900 hover:bg-zinc-800"
                    disabled={saving}
                    onClick={() => void startMeeting()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Play className="h-4 w-4 mr-2 fill-current" />
                    )}
                    Empezar reunión
                  </Button>
                </div>
              ) : workspaceView === 'document' ? (
                <AuditDocumentView audit={audit} />
              ) : workspaceView === 'map' ? (
                <AuditMapView audit={audit} saving={saving} onMapUpdate={onMapUpdate} />
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-3.5 bg-[linear-gradient(180deg,#fafafa_0%,#ffffff_120px)]">
                    {(audit?.conversation || []).map((t) => {
                      if (t.message_type === 'mode_separator' || t.role === 'system') {
                        return (
                          <div key={t.id} className="flex justify-center py-1">
                            <span className="text-[11px] text-zinc-400 bg-zinc-100/90 px-3.5 py-1.5 rounded-full">
                              {t.content}
                            </span>
                          </div>
                        )
                      }
                      const isAssistant = t.role === 'assistant'
                      const qMeta = t.question_id
                        ? audit?.questions.find((q) => q.id === t.question_id)
                        : null
                      const isSkipped = qMeta?.status === 'skipped' && t.message_type === 'question'
                      const answerMeta =
                        t.role === 'user' && t.question_id
                          ? audit?.answers.find((a) => a.question_id === t.question_id)
                          : null
                      return (
                        <div
                          key={t.id}
                          id={`msg-${t.id}`}
                          className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`group relative max-w-[min(88%,36rem)] px-4 py-3 text-[14.5px] leading-relaxed ${
                              isAssistant
                                ? isSkipped
                                  ? 'rounded-[1.35rem] rounded-bl-lg bg-orange-50 text-orange-950 ring-1 ring-orange-100/80'
                                  : 'rounded-[1.35rem] rounded-bl-lg bg-zinc-100/95 text-zinc-900'
                                : 'rounded-[1.35rem] rounded-br-lg bg-zinc-900 text-white shadow-sm shadow-zinc-900/10'
                            }`}
                          >
                            {isAssistant && t.message_type === 'question' && (
                              <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-400 mb-1.5">
                                {modeLabel(t.mode)}
                                {qMeta ? ` · ${qMeta.importance}` : ''}
                                {isSkipped ? ' · Omitida' : ''}
                              </p>
                            )}
                            {t.content}
                            {t.role === 'user' && (
                              <button
                                type="button"
                                className="absolute -left-8 top-2 opacity-0 group-hover:opacity-100 h-7 w-7 rounded-full bg-white ring-1 ring-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-900 transition-opacity"
                                title="Editar respuesta"
                                onClick={() =>
                                  setEditTarget({
                                    answerId: answerMeta?.id,
                                    questionId: t.question_id || undefined,
                                    text: t.content,
                                  })
                                }
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {question &&
                      audit?.conversation[audit.conversation.length - 1]?.question_id !==
                        question.id && (
                        <div className="flex justify-start">
                          <div className="max-w-[min(88%,36rem)] rounded-[1.35rem] rounded-bl-lg px-4 py-3 text-[14.5px] bg-zinc-100/95 text-zinc-900">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-400 mb-1.5">
                              {modeLabel(audit?.active_mode || 'descubrimiento')}
                            </p>
                            {question.question}
                          </div>
                        </div>
                      )}

                    {saving && (
                      <div className="flex items-center gap-2 text-xs text-zinc-400 pl-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Pensando la siguiente pregunta…
                      </div>
                    )}

                    {!question && !saving && (
                      <p className="text-sm text-zinc-400 text-center py-8">
                        No hay pregunta activa. Cambia de modo, abre Pendientes o Huecos.
                      </p>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="shrink-0 border-t border-zinc-100 bg-white/95 backdrop-blur-sm p-4 sm:p-5 space-y-3">
                    {activeInteractive &&
                      ['single_select', 'yes_no', 'confirmation'].includes(
                        activeInteractive.answer_type
                      ) && (
                        <div className="flex flex-wrap gap-2">
                          {(activeInteractive.options || []).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={saving}
                              onClick={() => onSelectSingle(opt.value, opt.label)}
                              className="px-3.5 py-2 rounded-2xl bg-zinc-50 ring-1 ring-zinc-200/80 text-sm text-zinc-800 hover:bg-zinc-100 disabled:opacity-40 transition-colors"
                            >
                              {opt.label}
                            </button>
                          ))}
                          {(activeInteractive.allow_other ||
                            activeInteractive.answer_type === 'single_select') && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => setShowOther(true)}
                              className="px-3.5 py-2 rounded-2xl border border-dashed border-zinc-300 text-sm text-zinc-500"
                            >
                              Otro…
                            </button>
                          )}
                        </div>
                      )}

                    {activeInteractive?.answer_type === 'multi_select' && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {(activeInteractive.options || []).map((opt) => {
                            const on = multiSel.includes(opt.value)
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                  setMultiSel((prev) =>
                                    on
                                      ? prev.filter((x) => x !== opt.value)
                                      : [...prev, opt.value]
                                  )
                                }
                                className={`px-3.5 py-2 rounded-2xl text-sm transition-colors ${
                                  on
                                    ? 'bg-zinc-900 text-white'
                                    : 'bg-zinc-50 ring-1 ring-zinc-200/80 text-zinc-800 hover:bg-zinc-100'
                                }`}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                          <button
                            type="button"
                            onClick={() => setShowOther((v) => !v)}
                            className="px-3.5 py-2 rounded-2xl border border-dashed border-zinc-300 text-sm text-zinc-500"
                          >
                            Otro…
                          </button>
                        </div>
                        {showOther && (
                          <input
                            value={otherText}
                            onChange={(e) => setOtherText(e.target.value)}
                            placeholder="Especifica otro…"
                            className="w-full rounded-2xl bg-zinc-50 ring-1 ring-zinc-200/80 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                          />
                        )}
                        <Button
                          size="sm"
                          className="rounded-2xl"
                          disabled={saving}
                          onClick={confirmMulti}
                        >
                          Confirmar selección
                        </Button>
                      </div>
                    )}

                    {showOther &&
                      activeInteractive &&
                      activeInteractive.answer_type !== 'multi_select' && (
                        <div className="flex gap-2">
                          <input
                            value={otherText}
                            onChange={(e) => setOtherText(e.target.value)}
                            placeholder="Especifica…"
                            className="flex-1 rounded-2xl bg-zinc-50 ring-1 ring-zinc-200/80 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                          />
                          <Button
                            size="sm"
                            className="rounded-2xl"
                            disabled={saving || !otherText.trim()}
                            onClick={() =>
                              submitAnswer('save_continue', {
                                text: otherText.trim(),
                                value: otherText.trim(),
                              })
                            }
                          >
                            Enviar
                          </Button>
                        </div>
                      )}

                    <div className="flex gap-2.5 items-end">
                      <textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        rows={2}
                        disabled={!question || saving}
                        placeholder={
                          activeInteractive?.help_text ||
                          (activeInteractive?.unit
                            ? `Escribe la respuesta (${activeInteractive.unit})…`
                            : 'Escribe la respuesta…')
                        }
                        className="flex-1 resize-none rounded-[1.35rem] bg-zinc-50 ring-1 ring-zinc-200/80 px-4 py-3.5 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            submitAnswer('save_continue')
                          }
                        }}
                      />
                      <Button
                        className="rounded-[1.2rem] h-12 w-12 shrink-0 bg-zinc-900 hover:bg-zinc-800"
                        disabled={!question || saving}
                        onClick={() => submitAnswer('save_continue')}
                        aria-label="Enviar"
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ['skip', 'Omitir', SkipForward],
                          ['not_applicable', 'No aplica', Ban],
                          ['unknown', 'No lo sabe', HelpCircle],
                          ['buffalo_later', 'Buffalo después', StickyNote],
                          ['ask_example', 'Ejemplo', MessageSquarePlus],
                        ] as const
                      ).map(([action, label, Icon]) => (
                        <button
                          key={action}
                          type="button"
                          disabled={!question || saving}
                          onClick={() => submitAnswer(action)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] text-zinc-500 bg-zinc-50 ring-1 ring-zinc-200/70 hover:bg-zinc-100 disabled:opacity-40 transition-colors"
                        >
                          <Icon className="h-3 w-3" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>

            <aside className="flex flex-col min-h-0 rounded-[1.85rem] bg-white ring-1 ring-zinc-200/70 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">Contexto</p>
                {audit?.updated_at && (
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Actualizado {new Date(audit.updated_at).toLocaleString('es-ES')}
                    {audit.meta?.last_edited_by ? ` · ${audit.meta.last_edited_by}` : ''}
                  </p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-4 min-h-0">
                {!meetingStarted ? (
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    El contexto se irá llenando con cada respuesta (confirmado, estimado o
                    inferido).
                  </p>
                ) : (
                  <>
                    {audit?.context.next_hint && (
                      <div className="text-xs text-amber-900 bg-amber-50/90 rounded-[1.1rem] px-3.5 py-2.5 leading-relaxed ring-1 ring-amber-100/80">
                        {audit.context.next_hint}
                      </div>
                    )}
                    {AUDIT_CONTEXT_SECTIONS.map((sec) => {
                      const items = audit?.context.sections?.[sec.id] || []
                      if (!items.length) return null
                      return (
                        <div key={sec.id}>
                          <p className="text-xs font-semibold text-zinc-900 mb-1.5">{sec.label}</p>
                          <ul className="space-y-1.5">
                            {items.map((it) => (
                              <li key={it.path} className="text-xs text-zinc-600 leading-relaxed">
                                <span className="text-zinc-800">{it.label}:</span> {it.value}{' '}
                                <span
                                  className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full ${statusBadge(
                                    it.source === 'ai_inference' ? 'ai_inference' : it.status
                                  )}`}
                                >
                                  {it.source === 'ai_inference'
                                    ? 'inferido'
                                    : it.status === 'confirmed' || it.status === 'answered'
                                      ? 'confirmado'
                                      : it.status === 'estimated'
                                        ? 'estimado'
                                        : it.status === 'pending_confirmation'
                                          ? 'por confirmar'
                                          : it.status}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                    {!Object.values(audit?.context.sections || {}).some((x) => x?.length) && (
                      <p className="text-xs text-zinc-400">
                        Aún vacío. Se irá llenando al responder.
                      </p>
                    )}
                  </>
                )}
              </div>

              {meetingStarted && areas.length > 0 && (
                <div className="shrink-0 border-t border-zinc-100 p-3.5 space-y-2 max-h-[42%] overflow-y-auto">
                  {areas.map((a) => (
                    <div key={a.id} className="px-1 py-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 mb-1 gap-1">
                        <span className="truncate">{a.label}</span>
                        <span className="tabular-nums text-zinc-400 shrink-0">{a.sufficiency}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${sufficiencyColor(a.sufficiency)}`}
                          style={{ width: `${a.sufficiency}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        )}
      </div>

      <Dialog open={pendingOpen} onOpenChange={setPendingOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto rounded-[1.75rem]">
          <DialogHeader>
            <DialogTitle>Preguntas pendientes ({pendingQuestions.length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {!pendingQuestions.length && (
              <p className="text-sm text-zinc-500">No hay preguntas pendientes.</p>
            )}
            {pendingQuestions.map((q) => (
              <div
                key={q.id}
                className="ring-1 ring-zinc-200/80 rounded-[1.25rem] p-3.5 space-y-2 bg-zinc-50/50"
              >
                <p className="text-sm text-zinc-900">{q.text}</p>
                <p className="text-[11px] text-zinc-500">
                  {modeLabel(q.mode)} · {q.category} · {q.importance} · {q.status}
                  {q.reason ? ` · ${q.reason}` : ''}
                </p>
                {lateQuestion?.id === q.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      rows={2}
                      className="w-full rounded-2xl bg-white ring-1 ring-zinc-200 px-3 py-2 text-sm"
                      placeholder="Respuesta…"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        className="rounded-2xl"
                        disabled={saving}
                        onClick={() =>
                          submitAnswer('save_continue', {
                            questionId: q.id,
                            late: true,
                            text: answer,
                          })
                        }
                      >
                        Guardar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() =>
                          submitAnswer('not_applicable', { questionId: q.id, late: true })
                        }
                      >
                        No aplica
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => submitAnswer('resolve', { questionId: q.id, late: true })}
                      >
                        Marcar resuelta
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      className="rounded-2xl"
                      onClick={() => {
                        setLateQuestion(q)
                        setWorkspaceView('chat')
                        if (q.message_id) {
                          document.getElementById(`msg-${q.message_id}`)?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center',
                          })
                        }
                      }}
                    >
                      Responder ahora
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-2xl"
                      disabled={saving}
                      onClick={() =>
                        submitAnswer('not_applicable', {
                          questionId: q.id,
                          late: true,
                          text: 'N/A',
                        })
                      }
                    >
                      No aplica
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-2xl"
                      disabled={saving}
                      onClick={() =>
                        submitAnswer('resolve', {
                          questionId: q.id,
                          late: true,
                          text: 'Resuelta',
                        })
                      }
                    >
                      Marcar como resuelta
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={gapsOpen} onOpenChange={setGapsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto rounded-[1.75rem]">
          <DialogHeader>
            <DialogTitle>Huecos detectados</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {(audit?.gaps || []).filter((g) => g.status === 'open').length === 0 && (
              <p className="text-sm text-zinc-500">No hay huecos abiertos.</p>
            )}
            {(audit?.gaps || [])
              .filter((g) => g.status === 'open')
              .map((g) => (
                <div
                  key={g.id}
                  className="ring-1 ring-zinc-200/80 rounded-[1.25rem] p-3.5 space-y-2 bg-zinc-50/50"
                >
                  <div className="flex items-start gap-2">
                    {g.importance === 'critical' && (
                      <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{g.title}</p>
                      <p className="text-xs text-zinc-600 mt-0.5">{g.description}</p>
                      <p className="text-[10px] text-zinc-400 mt-1">
                        {g.importance} · {g.owner} · {g.category}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      className="rounded-2xl"
                      disabled={saving}
                      onClick={() =>
                        void postAction({
                          action: 'gap',
                          gap_id: g.id,
                          gap_action: 'ask_now',
                        }).then(() => {
                          setGapsOpen(false)
                          setWorkspaceView('chat')
                        })
                      }
                    >
                      Preguntar ahora
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-2xl"
                      disabled={saving}
                      onClick={() =>
                        void postAction({
                          action: 'gap',
                          gap_id: g.id,
                          gap_action: 'assign_client',
                        })
                      }
                    >
                      Cliente
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-2xl"
                      disabled={saving}
                      onClick={() =>
                        void postAction({
                          action: 'gap',
                          gap_id: g.id,
                          gap_action: 'assign_buffalo',
                        })
                      }
                    >
                      Buffalo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-2xl"
                      disabled={saving}
                      onClick={() =>
                        void postAction({
                          action: 'gap',
                          gap_id: g.id,
                          gap_action: 'resolve',
                        })
                      }
                    >
                      Resuelto
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(proposalWarn)} onOpenChange={(o) => !o && setProposalWarn(null)}>
        <DialogContent className="max-w-md rounded-[1.75rem]">
          <DialogHeader>
            <DialogTitle>Hay huecos críticos</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600">
            Faltan datos críticos: {proposalWarn?.missing.join(', ')}. ¿Continuar igual a la
            propuesta?
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => setProposalWarn(null)}
            >
              Seguir auditando
            </Button>
            <Button
              className="rounded-2xl"
              onClick={() => {
                setProposalWarn(null)
                void goToProposal(true)
              }}
            >
              Continuar igual
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AuditReportPreview
        open={reportOpen}
        onOpenChange={setReportOpen}
        markdown={reportMarkdown || audit?.report?.markdown || null}
        generatedAt={audit?.report?.generated_at}
      />

      <AuditEditAnswerDialog
        open={Boolean(editTarget)}
        onOpenChange={(o) => !o && setEditTarget(null)}
        initialText={editTarget?.text || ''}
        saving={saving}
        onSave={async (text) => {
          await postAction({
            action: 'edit_answer',
            answer_id: editTarget?.answerId,
            question_id: editTarget?.questionId,
            raw_text: text,
          })
          setEditTarget(null)
        }}
      />

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="max-w-md rounded-[1.75rem]">
          <DialogHeader>
            <DialogTitle>Nota de reunión</DialogTitle>
          </DialogHeader>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={4}
            placeholder="Añade una nota manual…"
            className="w-full mt-2 resize-none rounded-[1.25rem] bg-zinc-50 ring-1 ring-zinc-200/80 px-4 py-3 text-sm"
          />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" className="rounded-2xl" onClick={() => setNoteOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="rounded-2xl"
              disabled={saving || !noteText.trim()}
              onClick={async () => {
                await postAction({
                  action: 'add_note',
                  text: noteText.trim(),
                  block_id: audit?.meta?.active_block || null,
                })
                setNoteText('')
                setNoteOpen(false)
              }}
            >
              Guardar nota
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
