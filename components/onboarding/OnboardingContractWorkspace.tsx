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
import ContractAnnexDocView, {
  downloadContractHtml,
  exportContractAnnexPdf,
} from '@/components/onboarding/ContractAnnexDoc'
import {
  formatContractDate,
  parseContractDraft,
} from '@/lib/onboarding/contract-annex-types'
import { buildDefaultContractAnnex } from '@/lib/onboarding/contract-annex-default'
import { useDraftHistory } from '@/lib/onboarding/use-draft-history'
import { cn } from '@/lib/utils'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ContractStatus = 'draft' | 'sent'

export default function OnboardingContractWorkspace() {
  const router = useRouter()
  const leadId = Number(router.query.lead)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [markingSent, setMarkingSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [status, setStatus] = useState<ContractStatus>('draft')
  const [meta, setMeta] = useState({
    name: '',
    clientName: '',
    clientCompany: '',
    clientCif: '',
    clientAddress: '',
    setupFee: null as number | null,
    monthlyFee: null as number | null,
    hasContext: false,
    hasDefinition: false,
  })
  const { draft, canUndo, canRedo, resetDraft, commitDraft, undo, redo } = useDraftHistory()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')

  const parsed = useMemo(() => parseContractDraft(draft), [draft])
  const clientLabel = meta.clientCompany || meta.clientName || 'Cliente'

  const previewDoc = useMemo(() => {
    if (parsed) return parsed
    if (!draft.trim()) return null
    return buildDefaultContractAnnex({
      client: {
        legal_name: meta.clientCompany || meta.clientName || 'Cliente (a completar)',
        cif: meta.clientCif || 'A completar',
        address: meta.clientAddress || 'A completar',
        representative: meta.clientName
          ? `D. ${meta.clientName}`
          : 'Representante legal (a completar)',
      },
      placeDate: formatContractDate(),
      setupFeeEur: meta.setupFee,
      monthlyFeeEur: meta.monthlyFee,
    })
  }, [parsed, draft, meta])

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
          clientCif: data.lead?.contact?.cif || '',
          clientAddress: data.lead?.contact?.direccion_fiscal || '',
          setupFee:
            data.proyecto?.setup_fee_eur != null
              ? Number(data.proyecto.setup_fee_eur)
              : data.lead?.valor != null
                ? Number(data.lead.valor)
                : null,
          monthlyFee:
            data.proyecto?.monthly_fee_eur != null
              ? Number(data.proyecto.monthly_fee_eur)
              : null,
          hasContext: Boolean(data.project_context),
          hasDefinition: Boolean(data.project_definition),
        })
        resetDraft(data.contract_draft || '')
        setStatus(data.contract_status === 'sent' ? 'sent' : 'draft')
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
          kind: 'contract',
          save_only: true,
          draft: nextDraft,
          contract_status: 'draft',
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
          kind: 'contract',
          instructions: instructions?.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error generando contrato')
      commitDraft(data.draft || '')
      setStatus('draft')
      flashOk('Contrato generado · guardado como borrador')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error generando contrato'
      setError(msg)
      throw e instanceof Error ? e : new Error(msg)
    } finally {
      setGenerating(false)
    }
  }

  const saveAs = async (nextStatus: ContractStatus) => {
    if (!Number.isFinite(leadId) || leadId <= 0) return
    if (nextStatus === 'sent') setMarkingSent(true)
    else setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'contract',
          save_only: true,
          draft,
          contract_status: nextStatus,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setStatus(nextStatus)
      flashOk(nextStatus === 'sent' ? 'Marcado como enviado' : 'Guardado como borrador')
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
      if (!draft.trim() || !parseContractDraft(draft)) {
        await generate(text)
        setMessages([
          ...nextMessages,
          {
            role: 'assistant',
            content:
              'He generado el contrato de prestación de servicios y lo he guardado como borrador.',
          },
        ])
        return
      }
      const res = await fetch(`/api/onboarding/projects/${leadId}/contract-chat`, {
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
      if (!res.ok) throw new Error(data.error || 'Error editando el contrato')
      const nextDraft = typeof data.content === 'string' ? data.content : ''
      if (nextDraft && nextDraft !== draft) {
        commitDraft(nextDraft)
        setStatus('draft')
      }
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content:
            nextDraft && nextDraft !== draft
              ? `${data.note || 'Documento actualizado'} · Guardado como borrador`
              : data.note ||
                'No vi cambios en la previsualización. Prueba a indicar la cláusula (ej. quinta) y el texto exacto.',
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
      await exportContractAnnexPdf({
        rootId: 'buffalo-contract-annex',
        fileName: `contrato-${leadId}`,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la impresión')
    }
  }

  const downloadHtml = async () => {
    try {
      await downloadContractHtml({
        rootId: 'buffalo-contract-annex',
        fileName: `contrato-${leadId}`,
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
              Contrato:{' '}
              <span className="font-medium text-zinc-700">{clientLabel}</span>
            </h1>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Prestación de servicios de IA ·{' '}
              {status === 'sent' ? 'Estado: enviado' : 'Estado: borrador'}
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
            <button
              type="button"
              onClick={() => void printPdf()}
              disabled={!previewDoc}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            >
              <Printer className="h-3.5 w-3.5" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => void downloadHtml()}
              disabled={!previewDoc}
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
              {status === 'sent' ? 'Enviado' : 'Enviado'}
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
          <div className="hide-scrollbar min-h-0 overflow-y-auto rounded-3xl border border-zinc-200/70 bg-[#ededed] p-4 sm:p-6">
            {!meta.hasContext && !meta.hasDefinition && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Este proyecto aún no tiene contexto ni definición. Actualízalos en Editar y vuelve
                aquí, o descríbelo en el chat.
              </div>
            )}
            {draft.trim() && !parsed && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Hay un borrador antiguo (anexo DPA o texto libre). Pulsa «Regenerar» para crear el
                contrato de prestación de servicios con la plantilla Buffalo.
              </div>
            )}
            {!previewDoc ? (
              <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-zinc-300 bg-white/80 px-6 py-16 text-center">
                <Sparkles className="h-8 w-8 text-zinc-400" />
                <p className="text-sm font-medium text-zinc-800">Sin contrato todavía</p>
                <p className="text-xs leading-relaxed text-zinc-500">
                  Pulsa «Generar con IA» o escribe en el chat. Se creará el contrato de prestación de
                  servicios con la plantilla Buffalo, adaptado al cliente, al proyecto y a los
                  importes del CRM.
                </p>
              </div>
            ) : (
              <div className="mx-auto w-fit max-w-full">
                <ContractAnnexDocView doc={previewDoc} id="buffalo-contract-annex" />
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
                        : 'bg-zinc-100 text-zinc-800'
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {(sending || generating) && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-3xl bg-zinc-100 px-3.5 py-2.5 text-[13px] text-zinc-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {generating && !draft ? 'Generando…' : 'Actualizando…'}
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
              <div className="flex items-end gap-2 rounded-3xl border border-zinc-200 bg-zinc-50 p-2.5 focus-within:border-zinc-300 focus-within:bg-white">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={3}
                  placeholder="Ej: pon este texto en rojo… · añade estas dos cosas en rojo…"
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
