import { useMemo, useState } from 'react'
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
} from 'lucide-react'
import { CUSTOM_BRIEF_NEEDS } from '@/lib/onboarding/custom-brief-needs'
import type { ConfiguradorConfig } from '@/lib/engranaje5/types'

type ChatMsg = { role: 'user' | 'assistant'; content: string }

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export default function CustomProjectBriefPage() {
  const router = useRouter()
  const { lead, nombre, empresa, email, ciudad, pipeline, card } = router.query as Record<string, string>

  const [brief, setBrief] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [questions, setQuestions] = useState<string[]>([])
  const [config, setConfig] = useState<ConfiguradorConfig | null>(null)
  const [confirming, setConfirming] = useState(false)

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

  const runAi = async (nextBrief: string, nextMessages: ChatMsg[]) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/onboarding/custom-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: nextBrief,
          messages: nextMessages,
          client: clientPayload,
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

      const params = new URLSearchParams()
      params.set('lead', lead)
      params.set('mode', 'custom')
      if (nombre) params.set('nombre', nombre)
      if (empresa) params.set('empresa', empresa)
      if (email) params.set('email', email)
      if (ciudad) params.set('ciudad', ciudad)
      if (pipeline) params.set('pipeline', pipeline)
      if (card) params.set('card', card)
      router.push(`/onboarding/configure?${params.toString()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar')
      setConfirming(false)
    }
  }

  return (
    <Layout>
      <div className="w-full max-w-3xl mx-auto space-y-6 pb-16">
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

        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            Proyecto a medida
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Brief + IA
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Describe el proyecto. Si falta algo, la IA te pregunta. Luego generas propuesta,
            contrato, factura y onboarding igual que siempre.
          </p>
        </div>

        {/* Qué necesita saber */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <ListChecks className="h-4 w-4 text-gray-700" />
            <h2 className="text-sm font-semibold text-gray-900">
              Antes de empezar: qué necesita saber del proyecto
            </h2>
          </div>
          <ul className="space-y-2">
            {CUSTOM_BRIEF_NEEDS.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-gray-600">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-400">
            No hace falta un texto perfecto: pega notas de la reunión. Si falta el precio o el
            alcance, la IA te lo pedirá.
          </p>
        </div>

        {/* Brief */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
          <label className="text-sm font-semibold text-gray-900">Brief del proyecto</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={7}
            placeholder={`Ejemplo:\nCliente quiere automatizar el seguimiento de leads de su clínica.\nAlcance: integración con su CRM, secuencias WhatsApp, dashboard simple.\nSetup: 4.500€. Sin mensualidad. Plazo 5 semanas.\nOnboarding: accesos CRM, tono de marca, ejemplos de mensajes.`}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white"
            disabled={loading || Boolean(config)}
          />
          {!config && (
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
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-gray-700" />
              <h2 className="text-sm font-semibold text-gray-900">Conversación</h2>
            </div>
            <div className="space-y-3 max-h-[360px] overflow-y-auto">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-gray-900 text-white ml-8'
                      : 'bg-gray-50 text-gray-800 mr-8 border border-gray-100'
                  }`}
                >
                  {m.content}
                </div>
              ))}
            </div>

            {!config && (
              <div className="flex gap-2">
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
                  className="flex-1 h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => void handleReply()}
                  disabled={loading || !reply.trim()}
                  className="h-10 w-10 rounded-xl bg-gray-900 text-white flex items-center justify-center disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Ready preview */}
        {config && (
          <div className="rounded-2xl border border-gray-900 bg-white p-5 space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-4 w-4" />
              <h2 className="text-sm font-semibold">Listo para documentos</h2>
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
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-1.5">
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
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Confirmar y abrir documentos
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
