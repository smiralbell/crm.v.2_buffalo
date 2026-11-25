import { useEffect, useState } from 'react'
import { Building2, Check, Copy, Loader2, Mail, Phone, Save, Send, Sparkles } from 'lucide-react'
import PersonaContactoForm, { type PersonaContacto } from '@/components/onboarding/persona/PersonaContactoForm'
import PersonaArchivos from '@/components/onboarding/persona/PersonaArchivos'

type PersonaCompleta = PersonaContacto & {
  estado: string | null
  contexto: string | null
}

const ESTADO_LABEL: Record<string, string> = {
  frio: 'Frío',
  caliente: 'Caliente',
  reunion: 'Reunión',
  propuesta: 'Propuesta',
  negociando: 'Negociando',
  cerrado: 'Cerrado',
  activo: 'Activo',
  perdido: 'Perdido',
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}))
  return (data as { error?: string }).error || fallback
}

/** Ficha completa de una persona: contacto, contexto, preguntas a la IA y archivos. */
export default function PersonaDetalle({ leadId }: { leadId: number }) {
  const [persona, setPersona] = useState<PersonaCompleta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const [contexto, setContexto] = useState('')
  const [savedContexto, setSavedContexto] = useState('')
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [copied, setCopied] = useState<'contexto' | 'respuesta' | null>(null)

  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState('')

  const dirty = contexto !== savedContexto

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/onboarding/personas/${leadId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, 'No se pudo cargar la persona'))
        return res.json() as Promise<{ persona: PersonaCompleta }>
      })
      .then((d) => {
        setPersona(d.persona)
        setContexto(d.persona.contexto || '')
        setSavedContexto(d.persona.contexto || '')
        setAnswer('')
        setQuestion('')
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [leadId])

  const saveContexto = async () => {
    if (!persona) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/personas/${persona.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contexto }),
      })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo guardar'))
      setSavedContexto(contexto)
      setPersona((p) => (p ? { ...p, contexto: contexto.trim() ? contexto : null } : p))
      setOkMsg('Contexto guardado')
      window.setTimeout(() => setOkMsg(''), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const draftWithAi = async () => {
    if (!persona) return
    if (dirty && !window.confirm('El texto actual no está guardado y se reemplazará por el borrador. ¿Continuar?')) return
    setDrafting(true)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/personas/${persona.id}/draft`, { method: 'POST' })
      if (!res.ok) throw new Error(await readError(res, 'La IA no pudo generar el resumen'))
      const data = (await res.json()) as { draft: string }
      setContexto(data.draft)
      setOkMsg('Borrador generado. Revísalo y guárdalo si te encaja.')
      window.setTimeout(() => setOkMsg(''), 3500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La IA no pudo generar el resumen')
    } finally {
      setDrafting(false)
    }
  }

  const askAi = async () => {
    if (!persona || !question.trim()) return
    setAsking(true)
    setError('')
    setAnswer('')
    try {
      const res = await fetch(`/api/onboarding/personas/${persona.id}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      if (!res.ok) throw new Error(await readError(res, 'La IA no pudo responder'))
      const data = (await res.json()) as { answer: string }
      setAnswer(data.answer)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La IA no pudo responder')
    } finally {
      setAsking(false)
    }
  }

  const copy = async (text: string, which: 'contexto' | 'respuesta') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setError('No se pudo copiar al portapapeles')
    }
  }

  if (loading) return <p className="py-16 text-center text-sm text-gray-400">Cargando persona…</p>
  if (!persona) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
        {error || 'Persona no encontrada'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-gray-900">{persona.nombre || 'Sin nombre'}</h2>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          {persona.empresa && (
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              {persona.empresa}
            </span>
          )}
          {persona.email && (
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-gray-400" />
              {persona.email}
            </span>
          )}
          {persona.telefono && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-gray-400" />
              {persona.telefono}
            </span>
          )}
          {persona.estado && (
            <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
              {ESTADO_LABEL[persona.estado] || persona.estado}
            </span>
          )}
        </div>
      </div>

      <PersonaContactoForm
        leadId={persona.id}
        persona={persona}
        onSaved={(p) => setPersona((prev) => (prev ? { ...prev, ...p } : prev))}
      />

      {/* Contexto */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Contexto</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={draftWithAi}
              disabled={drafting}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Generar resumen con IA
            </button>
            <button
              type="button"
              onClick={() => copy(contexto, 'contexto')}
              disabled={!contexto.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {copied === 'contexto' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copiar
            </button>
            <button
              type="button"
              onClick={saveContexto}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gray-900 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </button>
          </div>
        </div>
        <textarea
          value={contexto}
          onChange={(e) => setContexto(e.target.value)}
          rows={12}
          placeholder="Escribe aquí lo que hay que saber de esta persona: quién es, qué necesita, qué se ha hablado, qué queda pendiente…"
          className="w-full rounded-xl border border-gray-200 p-3 text-sm leading-relaxed text-gray-900 focus:outline-none focus:border-gray-400 whitespace-pre-wrap"
        />
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{dirty ? 'Cambios sin guardar' : 'Guardado'}</span>
          <span>{contexto.length} caracteres</span>
        </div>
      </div>

      {/* Preguntar a la IA */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Preguntar a la IA sobre esta persona</h3>
        <p className="text-xs text-gray-500">La IA usa el contexto guardado y el historial reciente (correos, llamadas, notas).</p>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void askAi()
              }
            }}
            placeholder="Ej.: ¿qué le prometimos y qué falta?"
            className="flex-1 h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:border-gray-400"
          />
          <button
            type="button"
            onClick={askAi}
            disabled={asking || !question.trim()}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Preguntar
          </button>
        </div>
        {answer && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-2">
            <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">{answer}</p>
            <button
              type="button"
              onClick={() => copy(answer, 'respuesta')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              {copied === 'respuesta' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copiar respuesta
            </button>
          </div>
        )}
      </div>

      <PersonaArchivos leadId={persona.id} hasContact />

      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}
      {okMsg && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">{okMsg}</div>}
    </div>
  )
}
