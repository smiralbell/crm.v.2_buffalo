import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import {
  ChevronLeft,
  Loader2,
  Sparkles,
  Send,
  CheckCircle,
  MessageCircle,
  ListChecks,
  Home,
} from 'lucide-react'
import { CUSTOM_BRIEF_NEEDS } from '@/lib/onboarding/custom-brief-needs'
import { AUDIT_BRIEF_SEED } from '@/lib/onboarding/project-kinds'
import type { ConfiguradorConfig } from '@/lib/engranaje5/types'

type ChatMsg = { role: 'user' | 'assistant'; content: string }

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export default function CustomProjectBriefPage() {
  const router = useRouter()
  const { lead, nombre, empresa, email, ciudad, pipeline, card, tipo } = router.query as Record<string, string>
  const isAudit = tipo === 'auditoria' || tipo === 'audit'

  const [brief, setBrief] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [questions, setQuestions] = useState<string[]>([])
  const [config, setConfig] = useState<ConfiguradorConfig | null>(null)
  const [confirming, setConfirming] = useState(false)
  const seededAudit = useRef(false)

  const chatScrollRef = useRef<HTMLDivElement>(null)
  const lastAssistantRef = useRef<HTMLDivElement>(null)
  const pendingScrollToAssistant = useRef(false)

  useEffect(() => {
    if (!router.isReady) return
    if (!isAudit || seededAudit.current) return
    seededAudit.current = true
    let fromAudit = ''
    try {
      const leadId = Number(lead)
      if (leadId) fromAudit = sessionStorage.getItem(`audit_brief_${leadId}`) || ''
    } catch {
      /* ignore */
    }
    setBrief((prev) => (prev.trim() ? prev : fromAudit.trim() || AUDIT_BRIEF_SEED))
  }, [router.isReady, isAudit, lead])

  const clientLabel = useMemo(
    () => [nombre, empresa].filter(Boolean).join(' · ') || email || (lead ? `Lead #${lead}` : 'Cliente'),
    [nombre, empresa, email, lead]
  )

  const clientPayload = {
    nombre: nombre || undefined,
    empresa: empresa || undefined,
    email: email || undefined,
    ciudad: ciudad || undefined,
    ref: empresa
      ? `BUF-2026-${empresa.substring(0, 6).toUpperCase().replace(/\s/g, '-')}-001`
      : undefined,
  }

  // Cuando llega un mensaje de la IA, llevarlo a la vista (no quedarse en el brief largo del user)
  useEffect(() => {
    if (!pendingScrollToAssistant.current) return
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant') return

    pendingScrollToAssistant.current = false
    // Esperar al paint del bubble
    requestAnimationFrame(() => {
      lastAssistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [messages])

  const runAi = async (nextBrief: string, nextMessages: ChatMsg[]) => {
    setLoading(true)
    setError('')
    pendingScrollToAssistant.current = true
    try {
      const res = await fetch('/api/onboarding/custom-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: nextBrief,
          messages: nextMessages,
          client: clientPayload,
          kind: isAudit ? 'audit' : 'custom',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al analizar el brief')

      const assistantText =
        data.assistant_message +
        (data.questions?.length
          ? '\n\n' + data.questions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')
          : '')

      setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }])
      setQuestions(data.questions || [])

      if (data.status === 'ready' && data.config) {
        setConfig({
          ...data.config,
          nombre: data.config.nombre || nombre,
          empresa: data.config.empresa || empresa,
          email: data.config.email || email,
          city: data.config.city || ciudad,
          leadId: lead ? Number(lead) : undefined,
          ref: data.config.ref || clientPayload.ref,
        })
      } else {
        setConfig(null)
      }
    } catch (e) {
      pendingScrollToAssistant.current = false
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  const handleAnalyze = async () => {
    if (brief.trim().length < 10) {
      setError('Escribe un brief un poco más completo (mín. 10 caracteres)')
      return
    }
    const userMsg: ChatMsg = { role: 'user', content: brief.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    await runAi(brief.trim(), next)
  }

  const handleReply = async () => {
    if (!reply.trim()) return
    const userMsg: ChatMsg = { role: 'user', content: reply.trim() }
    const next = [...messages, userMsg]
    const combinedBrief = `${brief.trim()}\n\nRespuestas adicionales:\n${next
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n')}`
    setMessages(next)
    setReply('')
    await runAi(combinedBrief, next)
  }

  const handleConfirm = async () => {
    if (!config || !lead) {
      setError('Falta lead o configuración')
      return
    }
    setConfirming(true)
    setError('')
    try {
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(config))))
      const notes = [
        config.title ? `Proyecto: ${config.title}` : '',
        config.description || '',
        ...(config.scope_items || []).map((s) => `• ${s}`),
        '',
        ...(config.line_items || []).map((l) => `• ${l.description}: ${fmt(l.amount_eur)}`),
        `Total setup: ${fmt(config.setup_total_eur || 0)}`,
        config.monthly_fee_eur
          ? `Mensualidad: ${fmt(config.monthly_fee_eur)}/mes`
          : 'Sin mensualidad',
        config.plazo ? `Plazo: ${config.plazo}` : '',
      ]
        .filter(Boolean)
        .join('\n')

      const leadRes = await fetch(`/api/leads/${lead}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configuracion: encoded,
          valor: config.setup_total_eur ?? null,
          notas: notes,
        }),
      })
      if (!leadRes.ok) {
        const e = await leadRes.json().catch(() => ({}))
        throw new Error(e.error || 'No se pudo guardar el lead')
      }

      const syncRes = await fetch('/api/engranaje5/proyectos/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: Number(lead),
          configuracion: encoded,
          setupFee: config.setup_total_eur ?? null,
          monthlyFee: config.monthly_fee_eur ?? null,
        }),
      })
      if (!syncRes.ok) {
        const e = await syncRes.json().catch(() => ({}))
        throw new Error(e.error || 'No se pudo crear el proyecto')
      }

      void router.push('/onboarding?tab=projects')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar')
      setConfirming(false)
    }
  }

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i
    }
    return -1
  })()

  return (
    <Layout>
      <div className="w-full space-y-5 pb-16">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push('/onboarding')}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Onboarding
          </button>
          <span className="text-gray-200">/</span>
          <span className="text-sm font-semibold text-gray-900 truncate">{clientLabel}</span>
        </div>

        {/* Checklist */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-7">
          <div className="flex items-center gap-2 mb-4">
            <ListChecks className="h-4 w-4 text-gray-700" />
            <h2 className="text-sm font-semibold text-gray-900">
              Qué necesita saber del proyecto
            </h2>
          </div>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
            {CUSTOM_BRIEF_NEEDS.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-gray-600">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Brief */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-7 space-y-3">
          <label className="text-sm font-semibold text-gray-900">
            {isAudit ? 'Brief de la auditoría' : 'Brief del proyecto'}
          </label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={8}
            placeholder={`Ejemplo:\nCliente quiere automatizar el seguimiento de leads de su clínica.\nAlcance: integración con su CRM, secuencias WhatsApp, dashboard simple.\nSetup: 4.500€. Sin mensualidad. Plazo 5 semanas.\nOnboarding: accesos CRM, tono de marca, ejemplos de mensajes.`}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white"
            disabled={loading || Boolean(config)}
          />
          {!config && messages.length === 0 && (
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={loading}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Analizar con IA
            </button>
          )}
        </div>

        {/* Chat */}
        {messages.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-7 space-y-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-gray-700" />
              <h2 className="text-sm font-semibold text-gray-900">Conversación con la IA</h2>
            </div>
            <div
              ref={chatScrollRef}
              className="space-y-3 max-h-[420px] overflow-y-auto scroll-smooth pr-1"
            >
              {messages.map((m, i) => {
                const isLastAssistant = m.role === 'assistant' && i === lastAssistantIndex
                return (
                  <div
                    key={i}
                    ref={isLastAssistant ? lastAssistantRef : undefined}
                    className={`rounded-xl px-4 py-3 text-sm whitespace-pre-wrap scroll-mt-2 ${
                      m.role === 'user'
                        ? 'bg-gray-900 text-white ml-10 md:ml-16'
                        : 'bg-emerald-50 text-gray-800 mr-10 md:mr-16 border border-emerald-100'
                    }`}
                  >
                    {m.role === 'assistant' && (
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80 mb-1.5">
                        IA
                      </div>
                    )}
                    {m.content}
                  </div>
                )
              })}
              {loading && (
                <div className="flex items-center gap-2 text-sm text-gray-400 mr-10 md:mr-16 px-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  La IA está pensando…
                </div>
              )}
            </div>

            {!config && (
              <div className="flex gap-2 pt-1">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleReply()
                    }
                  }}
                  placeholder={
                    questions[0]
                      ? 'Responde a las preguntas de la IA…'
                      : 'Añade más detalle…'
                  }
                  className="flex-1 h-11 rounded-xl border border-gray-200 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => void handleReply()}
                  disabled={loading || !reply.trim()}
                  className="h-11 w-11 rounded-xl bg-gray-900 text-white flex items-center justify-center disabled:opacity-60"
                  title="Enviar"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Ready preview */}
        {config && (
          <div className="rounded-2xl border border-gray-900 bg-white p-6 md:p-7 space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-4 w-4" />
              <h2 className="text-sm font-semibold">Listo para guardar</h2>
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-900">{config.title}</div>
              {config.description && (
                <p className="text-sm text-gray-500 mt-1">{config.description}</p>
              )}
            </div>
            {!!config.scope_items?.length && (
              <ul className="space-y-1.5">
                {config.scope_items.map((s) => (
                  <li key={s} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-gray-400">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-1.5">
              {(config.line_items || []).map((l) => (
                <div key={l.description} className="flex justify-between text-sm">
                  <span className="text-gray-700">{l.description}</span>
                  <span className="font-medium text-gray-900">{fmt(l.amount_eur)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-200">
                <span>Setup</span>
                <span>{fmt(config.setup_total_eur || 0)}</span>
              </div>
              {config.monthly_fee_eur ? (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Mensualidad</span>
                  <span>{fmt(config.monthly_fee_eur)}/mes</span>
                </div>
              ) : null}
              <div className="text-xs text-gray-400 pt-1">
                Plazo: {config.plazo || '—'} · Pago:{' '}
                {config.payment_split === '100_upfront' ? '100% al inicio' : '50% / 50%'}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={confirming || !lead}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-60"
              >
                {confirming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Home className="h-4 w-4" />
                )}
                Guardar y volver a inicio
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfig(null)
                  setConfirming(false)
                }}
                className="h-10 px-4 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Seguir ajustando
              </button>
            </div>
            {!lead && (
              <p className="text-xs text-red-600">Falta el lead en la URL. Vuelve a Onboarding.</p>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </Layout>
  )
}
