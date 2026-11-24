import { useEffect, useMemo, useState } from 'react'
import Layout from '@/components/Layout'
import OnboardingSectionTabs from '@/components/onboarding/OnboardingSectionTabs'
import PersonaContactoForm, { type PersonaContacto } from '@/components/onboarding/persona/PersonaContactoForm'
import PersonaArchivos from '@/components/onboarding/persona/PersonaArchivos'
import { Check, Copy, Loader2, Mail, Phone, Save, Search, Sparkles, Building2, Send } from 'lucide-react'

type Persona = {
  id: number
  nombre: string | null
  empresa: string | null
  email: string | null
  telefono: string | null
  estado: string | null
  contexto: string | null
  updated_at: string
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

export default function OnboardingPersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detalle, setDetalle] = useState<PersonaContacto | null>(null)

  const [contexto, setContexto] = useState('')
  const [savedContexto, setSavedContexto] = useState('')
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [copied, setCopied] = useState<'contexto' | 'respuesta' | null>(null)

  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState('')

  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const selected = useMemo(
    () => personas.find((p) => p.id === selectedId) || null,
    [personas, selectedId]
  )
  const dirty = contexto !== savedContexto

  const loadPersonas = (search: string) => {
    setLoading(true)
    const params = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''
    fetch(`/api/onboarding/personas${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, 'No se pudieron cargar las personas'))
        return res.json() as Promise<{ personas: Persona[] }>
      })
      .then((data) => setPersonas(data.personas))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  // Búsqueda con pausa para no lanzar una petición por tecla.
  useEffect(() => {
    const t = window.setTimeout(() => loadPersonas(q), 300)
    return () => window.clearTimeout(t)
  }, [q])

  const selectPersona = (p: Persona) => {
    if (dirty && !window.confirm('Hay cambios sin guardar en el contexto. ¿Cambiar de persona igualmente?')) {
      return
    }
    setSelectedId(p.id)
    setDetalle(null)
    fetch(`/api/onboarding/personas/${p.id}`)
      .then(async (res) => (res.ok ? ((await res.json()) as { persona: PersonaContacto }) : null))
      .then((d) => {
        if (d?.persona) setDetalle(d.persona)
      })
      .catch(() => setDetalle(null))
    setContexto(p.contexto || '')
    setSavedContexto(p.contexto || '')
    setAnswer('')
    setQuestion('')
    setError('')
    setOkMsg('')
  }

  const saveContexto = async () => {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/personas/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contexto }),
      })
      if (!res.ok) throw new Error(await readError(res, 'No se pudo guardar'))
      setSavedContexto(contexto)
      setPersonas((prev) =>
        prev.map((p) => (p.id === selected.id ? { ...p, contexto: contexto.trim() ? contexto : null } : p))
      )
      setOkMsg('Contexto guardado')
      window.setTimeout(() => setOkMsg(''), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const draftWithAi = async () => {
    if (!selected) return
    if (dirty && !window.confirm('El texto actual no está guardado y se reemplazará por el borrador. ¿Continuar?')) {
      return
    }
    setDrafting(true)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/personas/${selected.id}/draft`, { method: 'POST' })
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
    if (!selected || !question.trim()) return
    setAsking(true)
    setError('')
    setAnswer('')
    try {
      const res = await fetch(`/api/onboarding/personas/${selected.id}/ask`, {
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

  return (
    <Layout>
      <div className="w-full space-y-4 -mt-2 lg:-mt-3">
        <OnboardingSectionTabs active="personas" />

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Lista de personas */}
          <aside className="rounded-2xl border border-gray-200 bg-white p-3 flex flex-col min-h-[320px] lg:max-h-[calc(100vh-180px)]">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, empresa, email…"
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
            <div className="flex-1 overflow-y-auto -mx-1">
              {loading && personas.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-gray-400">Cargando…</p>
              ) : personas.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-gray-400">No hay personas con ese filtro.</p>
              ) : (
                <ul className="space-y-0.5">
                  {personas.map((p) => {
                    const active = p.id === selectedId
                    const title = p.nombre || p.empresa || p.email || `Persona #${p.id}`
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => selectPersona(p)}
                          className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                            active ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-900'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate">{title}</span>
                            {p.contexto?.trim() && (
                              <span
                                title="Tiene contexto guardado"
                                className={`h-2 w-2 rounded-full shrink-0 ${active ? 'bg-emerald-300' : 'bg-emerald-500'}`}
                              />
                            )}
                          </div>
                          <div className={`text-xs truncate ${active ? 'text-gray-300' : 'text-gray-500'}`}>
                            {[p.empresa, p.estado ? ESTADO_LABEL[p.estado] || p.estado : null]
                              .filter(Boolean)
                              .join(' · ') || p.email || '—'}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* Detalle y contexto */}
          <section className="min-w-0">
            {!selected ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-20 text-center">
                <p className="text-sm text-gray-500">Elige una persona para ver y editar su contexto.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                  <h2 className="text-lg font-semibold text-gray-900">{selected.nombre || 'Sin nombre'}</h2>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    {selected.empresa && (
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-gray-400" />
                        {selected.empresa}
                      </span>
                    )}
                    {selected.email && (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-gray-400" />
                        {selected.email}
                      </span>
                    )}
                    {selected.telefono && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-gray-400" />
                        {selected.telefono}
                      </span>
                    )}
                    {selected.estado && (
                      <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                        {ESTADO_LABEL[selected.estado] || selected.estado}
                      </span>
                    )}
                  </div>
                </div>

                {detalle && (
                  <PersonaContactoForm
                    leadId={selected.id}
                    persona={detalle}
                    onSaved={(p) => {
                      setDetalle(p)
                      setPersonas((prev) =>
                        prev.map((x) =>
                          x.id === p.id
                            ? { ...x, nombre: p.nombre, empresa: p.empresa, email: p.email, telefono: p.telefono }
                            : x
                        )
                      )
                    }}
                  />
                )}

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
                  <p className="text-xs text-gray-500">
                    La IA usa el contexto guardado y el historial reciente (correos, llamadas, notas).
                  </p>
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
              </div>
            )}

            {selected && (
              <div className="mt-4">
                <PersonaArchivos leadId={selected.id} hasContact />
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>
            )}
            {okMsg && (
              <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">{okMsg}</div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  )
}
