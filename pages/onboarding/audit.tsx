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
  analysis?: { message: string; enough_for_proposal: boolean; gaps: AuditGap[] }
  pending_count?: number
  ai_error?: string | null
  can_retry_generate?: boolean
  proposal?: { brief: string; completeness: { percent: number; criticalMissing: string[]; enoughForProposal: boolean }; warn_critical?: boolean }
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
    unknown: 'bg-slate-100 text-slate-600',
    not_applicable: 'bg-slate-100 text-slate-500',
    ai_inference: 'bg-violet-50 text-violet-800',
    skipped: 'bg-orange-50 text-orange-800',
    pending: 'bg-sky-50 text-sky-800',
  }
  return map[status] || 'bg-gray-100 text-gray-600'
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
  const [proposalWarn, setProposalWarn] = useState<{ brief: string; missing: string[] } | null>(null)

  const clientLabel = useMemo(
    () => [nombre, empresa].filter(Boolean).join(' · ') || email || (lead ? `Lead #${lead}` : 'Cliente'),
    [nombre, empresa, email, lead]
  )

  const applyPayload = (data: ApiPayload) => {
    setAudit(data.audit)
    setQuestion(data.current_question)
    setAreas(data.areas || [])
    setPendingCount(data.pending_count ?? 0)
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
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [audit?.conversation, question])

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
      const missing = data.proposal?.completeness?.criticalMissing || data.completeness?.criticalMissing || []
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

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-5.5rem)] min-h-[620px]">
        <div className="shrink-0 flex flex-wrap items-center gap-3 pb-3 border-b border-gray-200">
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => router.push('/onboarding')}
              className="h-9 w-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-gray-900 truncate">Copiloto de auditoría</h1>
              <p className="text-xs text-gray-500 truncate">{clientLabel}</p>
            </div>
          </div>

          <nav className="flex flex-1 items-center gap-1.5 min-w-0 overflow-x-auto py-0.5">
            {AGENTS.map((agent) => {
              const active = meetingStarted && audit?.active_mode === agent.id
              return (
                <button
                  key={agent.id}
                  type="button"
                  disabled={!meetingStarted || saving || loading}
                  onClick={() => changeAgent(agent.id)}
                  className={`shrink-0 text-center px-3 py-1.5 rounded-full text-[11px] leading-tight transition-colors disabled:opacity-40 border ${
                    active
                      ? 'bg-gray-900 text-white border-gray-900 font-medium shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {agent.label}
                </button>
              )
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0 ml-auto flex-wrap justify-end">
            {meetingStarted && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => router.push('/onboarding?tab=projects')}
              >
                <Save className="h-4 w-4 mr-1.5" />
                Guardar y salir
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={!audit || !meetingStarted}
              onClick={() => setPendingOpen(true)}
            >
              <ListTodo className="h-4 w-4 mr-1.5" />
              Pendientes ({pendingCount || pendingQuestions.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={!audit || saving || !meetingStarted}
              onClick={async () => {
                await postAction({ action: 'analyze' })
                setGapsOpen(true)
              }}
            >
              <ClipboardCheck className="h-4 w-4 mr-1.5" />
              Analizar huecos
            </Button>
            <Button
              size="sm"
              className="rounded-xl"
              disabled={!audit || !meetingStarted || saving}
              onClick={() => void goToProposal(false)}
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Pasar a propuesta
            </Button>
          </div>
        </div>

        {needsTypeSetup && !meetingStarted && !loading && (
          <div className="shrink-0 mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-gray-500 mr-1">Tipo de proyecto:</span>
            {AUDIT_PROJECT_TYPES.map((t) => {
              const on = setupTypes.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleType(t.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] border ${
                    on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        )}

        {error && (
          <div className="shrink-0 mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {aiError && (
          <div className="shrink-0 mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
            <span>Respuesta guardada. Falló la siguiente pregunta: {aiError}</span>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg shrink-0"
              disabled={saving}
              onClick={() => void postAction({ action: 'retry_generate' })}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Reintentar
            </Button>
          </div>
        )}
        {analysisMsg && (
          <div className="shrink-0 mt-3 text-sm text-sky-900 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
            {analysisMsg}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_16rem] min-h-0 mt-3 gap-0">
            <section className="flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-gray-200">
              {!meetingStarted ? (
                <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
                  <p className="text-base font-semibold text-gray-900 mb-2">Listo para la reunión</p>
                  <p className="text-sm text-gray-500 max-w-md mb-6">
                    El copiloto empieza en Descubrimiento y adapta las preguntas al contexto. Puedes
                    cambiar de modo sin perder el historial.
                  </p>
                  <Button
                    size="lg"
                    className="rounded-xl h-12 px-8"
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
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {(audit?.conversation || []).map((t) => {
                      if (t.message_type === 'mode_separator' || t.role === 'system') {
                        return (
                          <div key={t.id} className="flex justify-center py-1">
                            <span className="text-[11px] text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
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
                      return (
                        <div
                          key={t.id}
                          id={`msg-${t.id}`}
                          className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                              isAssistant
                                ? isSkipped
                                  ? 'bg-orange-50 text-orange-950 border border-orange-100'
                                  : 'bg-gray-100 text-gray-900'
                                : 'bg-gray-900 text-white'
                            }`}
                          >
                            {isAssistant && t.message_type === 'question' && (
                              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                                {modeLabel(t.mode)}
                                {qMeta ? ` · ${qMeta.importance}` : ''}
                                {isSkipped ? ' · Omitida' : ''}
                              </p>
                            )}
                            {t.content}
                          </div>
                        </div>
                      )
                    })}

                    {question &&
                      audit?.conversation[audit.conversation.length - 1]?.question_id !==
                        question.id && (
                        <div className="flex justify-start">
                          <div className="max-w-[88%] rounded-2xl px-4 py-2.5 text-sm bg-gray-100 text-gray-900">
                            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                              {modeLabel(audit?.active_mode || 'descubrimiento')}
                            </p>
                            {question.question}
                          </div>
                        </div>
                      )}

                    {saving && (
                      <div className="flex items-center gap-2 text-xs text-gray-400 pl-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Generando siguiente pregunta…
                      </div>
                    )}

                    {!question && !saving && (
                      <p className="text-sm text-gray-400 text-center py-6">
                        No hay pregunta activa. Cambia de modo, abre Pendientes o Analizar huecos.
                      </p>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="shrink-0 border-t border-gray-200 p-4 space-y-3">
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
                              className="px-3 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-40"
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
                              className="px-3 py-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-600"
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
                                    on ? prev.filter((x) => x !== opt.value) : [...prev, opt.value]
                                  )
                                }
                                className={`px-3 py-2 rounded-xl border text-sm ${
                                  on
                                    ? 'bg-gray-900 text-white border-gray-900'
                                    : 'border-gray-200 hover:bg-gray-50'
                                }`}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                          <button
                            type="button"
                            onClick={() => setShowOther((v) => !v)}
                            className="px-3 py-2 rounded-xl border border-dashed border-gray-300 text-sm"
                          >
                            Otro…
                          </button>
                        </div>
                        {showOther && (
                          <input
                            value={otherText}
                            onChange={(e) => setOtherText(e.target.value)}
                            placeholder="Especifica otro…"
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                          />
                        )}
                        <Button
                          size="sm"
                          className="rounded-xl"
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
                            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                          />
                          <Button
                            size="sm"
                            className="rounded-xl"
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

                    <div className="flex gap-2 items-end">
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
                        className="flex-1 resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:bg-gray-50"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            submitAnswer('save_continue')
                          }
                        }}
                      />
                      <Button
                        className="rounded-2xl h-11 w-11 shrink-0"
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
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

            <aside className="flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
                {!meetingStarted ? (
                  <p className="text-xs text-gray-400 leading-relaxed">
                    El contexto estructurado se irá llenando con cada respuesta (confirmado,
                    estimado o inferido).
                  </p>
                ) : (
                  <>
                    {audit?.context.next_hint && (
                      <div className="text-xs text-amber-900 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                        {audit.context.next_hint}
                      </div>
                    )}
                    {AUDIT_CONTEXT_SECTIONS.map((sec) => {
                      const items = audit?.context.sections?.[sec.id] || []
                      if (!items.length) return null
                      return (
                        <div key={sec.id}>
                          <p className="text-xs font-semibold text-gray-900 mb-1.5">{sec.label}</p>
                          <ul className="space-y-1.5">
                            {items.map((it) => (
                              <li key={it.path} className="text-xs text-gray-600 leading-relaxed">
                                <span className="text-gray-800">{it.label}:</span> {it.value}{' '}
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
                      <p className="text-xs text-gray-400">Aún vacío. Se irá llenando al responder.</p>
                    )}
                  </>
                )}
              </div>

              {meetingStarted && areas.length > 0 && (
                <div className="shrink-0 border-t border-gray-200 p-3 space-y-1.5 max-h-[42%] overflow-y-auto">
                  {areas.map((a) => (
                    <div key={a.id} className="px-1.5 py-1.5">
                      <div className="flex justify-between text-[10px] text-gray-600 mb-1 gap-1">
                        <span className="truncate">{a.label}</span>
                        <span className="tabular-nums text-gray-400 shrink-0">{a.sufficiency}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className={`h-full ${sufficiencyColor(a.sufficiency)}`}
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

      {/* Pendientes */}
      <Dialog open={pendingOpen} onOpenChange={setPendingOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preguntas pendientes ({pendingQuestions.length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {!pendingQuestions.length && (
              <p className="text-sm text-gray-500">No hay preguntas pendientes.</p>
            )}
            {pendingQuestions.map((q) => (
              <div key={q.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <p className="text-sm text-gray-900">{q.text}</p>
                <p className="text-[11px] text-gray-500">
                  {modeLabel(q.mode)} · {q.category} · {q.importance} · {q.status}
                  {q.reason ? ` · ${q.reason}` : ''}
                </p>
                <p className="text-[10px] text-gray-400">
                  {new Date(q.created_at).toLocaleString('es-ES')}
                </p>
                {lateQuestion?.id === q.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      rows={2}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      placeholder="Respuesta…"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        className="rounded-lg"
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
                        className="rounded-lg"
                        onClick={() => submitAnswer('not_applicable', { questionId: q.id, late: true })}
                      >
                        No aplica
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
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
                      className="rounded-lg"
                      onClick={() => {
                        setLateQuestion(q)
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
                      className="rounded-lg"
                      disabled={saving}
                      onClick={() =>
                        submitAnswer('not_applicable', { questionId: q.id, late: true, text: 'N/A' })
                      }
                    >
                      No aplica
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      disabled={saving}
                      onClick={() =>
                        submitAnswer('resolve', { questionId: q.id, late: true, text: 'Resuelta' })
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

      {/* Huecos */}
      <Dialog open={gapsOpen} onOpenChange={setGapsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Huecos detectados</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {(audit?.gaps || []).filter((g) => g.status === 'open').length === 0 && (
              <p className="text-sm text-gray-500">No hay huecos abiertos.</p>
            )}
            {(audit?.gaps || [])
              .filter((g) => g.status === 'open')
              .map((g) => (
                <div key={g.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {g.importance === 'critical' && (
                      <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{g.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{g.description}</p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {g.importance} · {g.owner} · {g.category}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      className="rounded-lg"
                      disabled={saving}
                      onClick={() =>
                        void postAction({
                          action: 'gap',
                          gap_id: g.id,
                          gap_action: 'ask_now',
                        }).then(() => setGapsOpen(false))
                      }
                    >
                      Preguntar ahora
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
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
                      className="rounded-lg"
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
                      className="rounded-lg"
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

      {/* Aviso propuesta */}
      <Dialog open={Boolean(proposalWarn)} onOpenChange={(o) => !o && setProposalWarn(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hay huecos críticos</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Faltan datos críticos: {proposalWarn?.missing.join(', ')}. ¿Continuar igual a la
            propuesta?
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setProposalWarn(null)}>
              Seguir auditando
            </Button>
            <Button
              className="rounded-xl"
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
    </Layout>
  )
}
