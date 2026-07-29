'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Loader2, Sparkles, Save, Copy, Check, FileText, ScrollText, Rocket } from 'lucide-react'

export type AiDocKind = 'proposal' | 'contract' | 'pre_kickoff'

const META: Record<
  AiDocKind,
  {
    title: string
    draftLabel: string
    emptyHint: string
    generateLabel: string
    regenerateLabel: string
    draftKey: 'proposal_draft' | 'contract_draft' | 'pre_kickoff_draft'
    Icon: typeof FileText
  }
> = {
  proposal: {
    title: 'Propuesta',
    draftLabel: 'Borrador de propuesta',
    emptyHint: 'Pulsa «Generar con IA» para crear la propuesta a partir del contexto y la definición…',
    generateLabel: 'Generar con IA',
    regenerateLabel: 'Regenerar con IA',
    draftKey: 'proposal_draft',
    Icon: FileText,
  },
  contract: {
    title: 'Contrato',
    draftLabel: 'Borrador de contrato',
    emptyHint: 'Pulsa «Generar con IA» para crear el borrador de contrato…',
    generateLabel: 'Generar contrato',
    regenerateLabel: 'Regenerar contrato',
    draftKey: 'contract_draft',
    Icon: ScrollText,
  },
  pre_kickoff: {
    title: 'Pre-kick-off',
    draftLabel: 'Documento de pre-kick-off',
    emptyHint: 'Pulsa «Generar con IA» para preparar el arranque del proyecto…',
    generateLabel: 'Generar pre-kick-off',
    regenerateLabel: 'Regenerar',
    draftKey: 'pre_kickoff_draft',
    Icon: Rocket,
  },
}

export default function OnboardingAiDocWorkspace({ kind }: { kind: AiDocKind }) {
  const router = useRouter()
  const leadId = Number(router.query.lead)
  const m = META[kind]
  const Icon = m.Icon

  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [meta, setMeta] = useState({
    name: '',
    client: '',
    hasContext: false,
    hasDefinition: false,
  })
  const [instructions, setInstructions] = useState('')
  const [draft, setDraft] = useState('')

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
        const client = [data.lead?.contact?.empresa, data.lead?.contact?.nombre]
          .filter(Boolean)
          .join(' · ')
        setMeta({
          name,
          client,
          hasContext: Boolean(data.project_context),
          hasDefinition: Boolean(data.project_definition),
        })
        const fromApi =
          kind === 'proposal'
            ? data.proposal_draft
            : kind === 'contract'
              ? data.contract_draft
              : data.pre_kickoff_draft
        setDraft(fromApi || '')
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
  }, [router.isReady, leadId, kind])

  const generate = async () => {
    if (!Number.isFinite(leadId) || leadId <= 0) return
    setGenerating(true)
    setError('')
    setOkMsg('')
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          instructions: instructions.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error generando documento')
      setDraft(data.draft || '')
      setOkMsg('Documento generado')
      window.setTimeout(() => setOkMsg(''), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando documento')
    } finally {
      setGenerating(false)
    }
  }

  const save = async () => {
    if (!Number.isFinite(leadId) || leadId <= 0) return
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, save_only: true, draft }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setOkMsg('Borrador guardado')
      window.setTimeout(() => setOkMsg(''), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('No se pudo copiar')
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f6f4] text-gray-900">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              {m.title}
            </p>
            <h1 className="text-lg font-semibold tracking-tight truncate">{meta.name || '…'}</h1>
            {meta.client && <p className="text-xs text-gray-500 truncate">{meta.client}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyAll()}
              disabled={!draft}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !draft}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating || loading}
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-xl bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {draft ? m.regenerateLabel : m.generateLabel}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </div>
        ) : (
          <>
            {!meta.hasContext && !meta.hasDefinition && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Este proyecto aún no tiene contexto ni definición. Ve a Editar, actualiza el contexto
                (con IA) y vuelve aquí.
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Instrucciones extra (opcional)
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                placeholder="Ej. Enfatizar plazos, tono más formal, incluir fase piloto…"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white resize-y"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
            {okMsg && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {okMsg}
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">{m.draftLabel}</p>
                {generating && (
                  <span className="text-xs text-gray-400 inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generando…
                  </span>
                )}
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={28}
                placeholder={m.emptyHint}
                className="w-full px-4 py-4 text-sm leading-relaxed font-sans focus:outline-none resize-y min-h-[420px]"
                disabled={generating}
              />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
