import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import {
  Search, UserPlus, ChevronRight, ArrowRight,
  X, Check, Settings, FileText, Building2,
  Mail, Phone, User, Zap, Eye,
  LayoutList, LayoutGrid, FolderOpen, Plus,
} from 'lucide-react'
import { BUFFALO_STAGE_COLORS } from '@/components/PipelineCardDrawer'
import Link from 'next/link'
import AssignDevelopersButton from '@/components/onboarding/AssignDevelopersButton'

// ── Types ──────────────────────────────────────────────────────────────
interface Contact {
  id: number; nombre: string | null; email: string | null
  telefono: string | null; empresa: string | null; ciudad: string | null
}
interface Lead {
  id: number; estado: string | null; valor: string | number | null
  configuracion?: string | null
  created_at: string
  contact: { id: number; nombre: string | null; email: string | null; empresa?: string | null }
}

// ── Helpers ────────────────────────────────────────────────────────────
const stageLabel = (estado: string | null) => {
  const map: Record<string, string> = {
    frio: 'LEAD', caliente: 'CONTACTO', reunion: 'REUNIÓN',
    propuesta: 'PROPUESTA ENVIADA', negociando: 'NEGOCIANDO',
    cerrado: 'CONTRATO FIRMADO', activo: 'ACTIVO',
  }
  return map[estado || ''] || (estado?.toUpperCase() || 'LEAD')
}
const fmt = (v: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

// ── Step indicator ─────────────────────────────────────────────────────
const STEPS = [
  { n: '1', label: 'Registra el lead' },
  { n: '2', label: 'Configura el proyecto' },
  { n: '3', label: 'Genera propuesta · contrato · factura' },
]

// ── Tab definition (add more here in the future) ───────────────────────
type Tab = 'configure' | 'projects'

const TABS: { id: Tab; label: string }[] = [
  { id: 'projects',  label: 'Proyectos' },
  { id: 'configure', label: 'Configurar nuevo proyecto' },
]

// ══════════════════════════════════════════════════════════════════════
export default function OnboardingPage() {
  const router = useRouter()

  const urlPipeline = router.query.pipeline as string | undefined
  const urlCard     = router.query.card     as string | undefined
  const urlTab      = router.query.tab      as Tab | undefined

  const [activeTab, setActiveTab]     = useState<Tab>(urlTab === 'configure' ? 'configure' : 'projects')
  const [view, setView]               = useState<'hub' | 'select' | 'new_lead'>('hub')
  const [selected, setSelected]       = useState<Contact | null>(null)
  const [search, setSearch]           = useState('')
  const [results, setResults]         = useState<Contact[]>([])
  const [form, setForm]               = useState({ nombre: '', empresa: '', email: '', telefono: '' })
  const [creating, setCreating]       = useState(false)
  const [formError, setFormError]     = useState('')
  const [created, setCreated]         = useState<Contact | null>(null)
  const [projects, setProjects]       = useState<Lead[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectsView, setProjectsView] = useState<'list' | 'grid'>('list')

  useEffect(() => {
    if (!router.isReady) return
    if (urlTab === 'configure') setActiveTab('configure')
    else setActiveTab('projects')
  }, [router.isReady, urlTab])

  const loadProjects = () => {
    setLoadingProjects(true)
    fetch('/api/leads?configured=1&page=1&pageSize=50')
      .then(r => r.json())
      .then(d => setProjects(d.leads || []))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false))
  }

  useEffect(() => {
    loadProjects()
  }, [created])

  useEffect(() => {
    if (activeTab === 'projects') loadProjects()
  }, [activeTab])

  useEffect(() => {
    if (search.length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/contacts?search=${encodeURIComponent(search)}`)
        .then(r => r.json())
        .then(d => setResults(d.contacts || []))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  const handleCreateLead = async () => {
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio'); return }
    setFormError(''); setCreating(true)
    try {
      const cRes = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:   form.nombre.trim(),
          email:    form.email.trim()    || undefined,
          empresa:  form.empresa.trim()  || undefined,
          telefono: form.telefono.trim() || undefined,
        }),
      })
      if (!cRes.ok) {
        const e = await cRes.json().catch(() => ({}))
        throw new Error(e.error || 'Error creando contacto')
      }
      const contact: Contact = await cRes.json()

      const lRes = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contact.id, estado: 'frio', prioridad: 'media' }),
      })
      const leadData = lRes.ok ? await lRes.json() : null
      const leadId   = leadData?.id ?? null

      // Create pipeline card and capture its ID for the configure URL
      let newPipelineId = urlPipeline || ''
      let newCardId     = urlCard     || ''
      try {
        const pipRes = await fetch('/api/pipelines?entity_type=contact')
        if (pipRes.ok) {
          const pipData = await pipRes.json()
          const firstPipeline = (pipData.pipelines || pipData)[0]
          if (firstPipeline?.id) {
            newPipelineId = firstPipeline.id
            const cardRes = await fetch(`/api/pipelines/${firstPipeline.id}/cards`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_id:   String(contact.id),
                entity_type: 'contact',
                stage:       'LEAD',
                stage_color: BUFFALO_STAGE_COLORS['LEAD'],
              }),
            })
            if (cardRes.ok) {
              const cardData = await cardRes.json()
              newCardId = cardData.id
            }
          }
        }
      } catch { /* best-effort */ }

      // Go directly to configurator — no intermediate hub step
      const params = new URLSearchParams()
      if (leadId)          params.set('lead',     String(leadId))
      if (contact.nombre)  params.set('nombre',   contact.nombre)
      if (contact.empresa) params.set('empresa',  contact.empresa)
      if (contact.email)   params.set('email',    contact.email)
      if (contact.ciudad)  params.set('ciudad',   contact.ciudad || '')
      if (newPipelineId)   params.set('pipeline', newPipelineId)
      if (newCardId)       params.set('card',     newCardId)
      router.push(`/onboarding/configure?${params.toString()}`)
    } catch (err: any) {
      setFormError(err.message || 'Error al crear el lead')
    } finally {
      setCreating(false)
    }
  }

  const handleSelectContact = (c: Contact) => {
    setSelected(c); setSearch(''); setResults([]); setView('hub')
  }

  const handleConfigure = async (contact: Contact, overridePipeline?: string, overrideCard?: string, leadId?: number | null) => {
    let resolvedLeadId = leadId ?? null

    if (!resolvedLeadId) {
      try {
        const lRes = await fetch(`/api/leads?search=${encodeURIComponent(contact.email || contact.nombre || '')}&pageSize=5`)
        if (lRes.ok) {
          const lData = await lRes.json()
          const match = (lData.leads || []).find((l: Lead) => l.contact?.id === contact.id)
          if (match) resolvedLeadId = match.id
        }
      } catch { /* best-effort */ }
    }

    if (!resolvedLeadId) {
      try {
        const createRes = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_id: contact.id, estado: 'frio', prioridad: 'media' }),
        })
        if (createRes.ok) {
          const newLead = await createRes.json()
          resolvedLeadId = newLead.id
        } else if (createRes.status === 409) {
          const err = await createRes.json().catch(() => ({}))
          if (err.leadId) resolvedLeadId = err.leadId
        }
      } catch { /* best-effort */ }
    }

    const params = new URLSearchParams()
    if (resolvedLeadId)   params.set('lead',    String(resolvedLeadId))
    if (contact.nombre)  params.set('nombre',  contact.nombre)
    if (contact.empresa) params.set('empresa', contact.empresa)
    if (contact.email)   params.set('email',   contact.email)
    if (contact.ciudad)  params.set('ciudad',  contact.ciudad || '')
    const pip = overridePipeline || urlPipeline
    const crd = overrideCard     || urlCard
    if (pip) params.set('pipeline', pip)
    if (crd) params.set('card',     crd)
    router.push(`/onboarding/configure?${params.toString()}`)
  }

  // ══════════════════════════════════════════════════════════════════
  return (
    <Layout>
      <div className="w-full max-w-7xl mx-auto space-y-6">

        {/* ── Tab bar ── */}
        <div className="flex items-center justify-center gap-1 border-b border-gray-200">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  router.replace(
                    tab.id === 'projects' ? '/onboarding?tab=projects' : '/onboarding?tab=configure',
                    undefined,
                    { shallow: true }
                  )
                }}
                className={`
                  flex items-center gap-2 px-4 py-2.5 text-sm font-medium
                  border-b-2 -mb-px transition-colors rounded-t-lg
                  ${isActive
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab.label}
                {tab.id === 'projects' && !loadingProjects && projects.length > 0 && (
                  <span className={`
                    text-[10px] font-medium px-1.5 py-0.5 rounded-full
                    ${isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}
                  `}>
                    {projects.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            TAB 1 — Configurar nuevo proyecto
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'configure' && (
          <div className="space-y-6">

            {/* Steps strip */}
            <div className="flex items-center justify-center gap-0">
              {STEPS.map((s, i) => (
                <div key={s.n} className="flex items-center">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100">
                    <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {s.n}
                    </span>
                    <span className="text-[11px] font-medium text-gray-600 whitespace-nowrap">{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-gray-300 mx-1 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>

            {/* Success banner */}
            {created && view === 'hub' && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
                <Check className="h-4 w-4 flex-shrink-0" />
                <span>Lead <strong>{created.nombre}</strong> creado y añadido al pipeline.</span>
              </div>
            )}

            {/* Selected lead → configure CTA */}
            {selected && view === 'hub' && (
              <div className="flex items-center gap-4 rounded-2xl border-2 border-gray-900 bg-white px-5 py-4 shadow-sm">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white font-bold text-base">
                  {(selected.nombre || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-900 truncate">{selected.nombre}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {[selected.empresa, selected.email].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0 p-1">
                  <X className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void handleConfigure(selected)}
                  className="px-5 h-10 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors flex-shrink-0"
                >
                  Configurar proyecto
                </button>
              </div>
            )}

            {/* Action cards (hub) */}
            {view === 'hub' && !selected && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <button
                  onClick={() => { setView('new_lead'); setCreated(null) }}
                  className="group text-left rounded-2xl border border-gray-200/80 bg-white p-10 min-h-[300px] flex flex-col hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="text-lg font-semibold text-gray-900 mb-2">Nuevo lead</div>
                  <p className="text-sm text-gray-400 leading-relaxed flex-1">
                    Primera vez con este cliente. Rellena sus datos y empieza a configurar.
                  </p>
                  <div className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    Crear lead <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                <button
                  onClick={() => { setView('select'); setCreated(null) }}
                  className="group text-left rounded-2xl border border-gray-200/80 bg-white p-10 min-h-[300px] flex flex-col hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="text-lg font-semibold text-gray-900 mb-2">Lead existente</div>
                  <p className="text-sm text-gray-400 leading-relaxed flex-1">
                    Ya está en el sistema. Busca por nombre, empresa o email y configura.
                  </p>
                  <div className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    Buscar lead <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>
            )}

            {/* Search panel */}
            {view === 'select' && (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-gray-900">Buscar lead existente</h2>
                  <button onClick={() => { setView('hub'); setSearch('') }} className="text-gray-400 hover:text-gray-700 transition-colors p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    autoFocus type="text" value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Nombre, email o empresa..."
                    className="w-full pl-10 pr-4 h-11 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition-all"
                  />
                </div>
                {results.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {results.map(c => (
                      <button
                        key={c.id} onClick={() => handleSelectContact(c)}
                        className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors group"
                      >
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 font-bold text-sm">
                          {(c.nombre || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{c.nombre || '—'}</div>
                          <div className="text-xs text-gray-400 truncate">{[c.empresa, c.email].filter(Boolean).join(' · ')}</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-gray-600 flex-shrink-0 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
                {search.length >= 2 && results.length === 0 && (
                  <div className="mt-4 py-6 text-center">
                    <p className="text-sm text-gray-400">Sin resultados para &quot;<strong>{search}</strong>&quot;</p>
                    <button
                      onClick={() => { setView('new_lead'); setForm(f => ({ ...f, nombre: search })) }}
                      className="mt-2 text-xs text-gray-500 underline hover:text-gray-800 transition-colors"
                    >
                      ¿Crear como nuevo lead?
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* New lead form */}
            {view === 'new_lead' && (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">Nuevo lead</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Solo el nombre es obligatorio</p>
                  </div>
                  <button onClick={() => setView('hub')} className="text-gray-400 hover:text-gray-700 transition-colors p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'nombre',   label: 'Nombre *',  icon: User,      type: 'text',  ph: 'Juan García' },
                    { key: 'empresa',  label: 'Empresa',   icon: Building2, type: 'text',  ph: 'Acme S.L.' },
                    { key: 'email',    label: 'Email',     icon: Mail,      type: 'email', ph: 'juan@acme.com' },
                    { key: 'telefono', label: 'Teléfono',  icon: Phone,     type: 'tel',   ph: '+34 600 000 000' },
                  ].map(({ key, label, icon: Icon, type, ph }) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
                      <div className="relative">
                        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                        <input
                          autoFocus={key === 'nombre'}
                          type={type}
                          value={(form as any)[key]}
                          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleCreateLead()}
                          placeholder={ph}
                          className="w-full pl-9 pr-3 h-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {formError && (
                  <p className="mt-3 text-xs text-red-600 font-medium">{formError}</p>
                )}

                <div className="mt-5 flex items-center gap-3">
                  <button
                    onClick={handleCreateLead} disabled={creating}
                    className="flex items-center gap-2 px-6 h-10 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    {creating ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Creando...
                      </span>
                    ) : (
                      <><Check className="h-4 w-4" /> Crear y configurar</>
                    )}
                  </button>
                  <button onClick={() => setView('hub')} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 2 — Proyectos
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'projects' && (
          <div>
            {/* Header with toggle */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900">Proyectos configurados</h2>
                {!loadingProjects && projects.length > 0 && (
                  <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full">
                    {projects.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* New project shortcut */}
                <button
                  onClick={() => setActiveTab('configure')}
                  className="flex items-center gap-1.5 px-3 h-8 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:border-gray-300 hover:text-gray-800 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nuevo
                </button>
                {projects.length > 0 && (
                  <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
                    <button
                      onClick={() => setProjectsView('list')}
                      className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${
                        projectsView === 'list'
                          ? 'bg-white shadow-sm text-gray-900'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                      title="Vista lista"
                    >
                      <LayoutList className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setProjectsView('grid')}
                      className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${
                        projectsView === 'grid'
                          ? 'bg-white shadow-sm text-gray-900'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                      title="Vista tarjetas"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {loadingProjects ? (
              <div className="py-10 text-center text-sm text-gray-300">Cargando...</div>
            ) : projects.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 py-14 text-center">
                <p className="text-sm text-gray-400">Aún no hay proyectos guardados.</p>
                <p className="text-xs text-gray-300 mt-1">Configura un lead y avanza a &quot;Datos del cliente&quot; para guardarlo aquí.</p>
                <button
                  onClick={() => setActiveTab('configure')}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 underline hover:text-gray-800 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Crear el primero
                </button>
              </div>
            ) : projectsView === 'list' ? (

              /* ── LIST VIEW ── */
              <div className="space-y-3">
                {projects.map(lead => {
                  const stageName  = stageLabel(lead.estado)
                  const name       = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`
                  const company    = lead.contact?.empresa
                  const amount     = lead.valor ? Number(lead.valor) : null
                  const dateStr    = new Date(lead.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
                  return (
                    <div
                      key={lead.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/onboarding/proyectos/${lead.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/onboarding/proyectos/${lead.id}`) }}
                      className="group flex items-center gap-5 rounded-xl bg-white border border-gray-200/80 hover:border-gray-300 hover:shadow-sm transition-all overflow-hidden px-5 py-4 min-h-[72px] cursor-pointer"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-semibold text-sm text-gray-700">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 truncate">{name}</span>
                          {company && company !== name && (
                            <span className="text-xs text-gray-400 truncate">{company}</span>
                          )}
                          {amount && <span className="text-xs font-medium text-gray-500">{fmt(amount)}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-700">
                            {stageName}
                          </span>
                          <span className="text-[11px] text-gray-400">{dateStr}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pr-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {lead.configuracion && (
                          <AssignDevelopersButton leadId={lead.id} variant="icon" />
                        )}
                        <button
                          onClick={async () => { const r = await fetch(`/api/contacts/${lead.contact.id}`); if (r.ok) void handleConfigure(await r.json(), undefined, undefined, lead.id) }}
                          className="flex items-center gap-1.5 px-3 h-9 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          {lead.configuracion ? 'Editar' : 'Configurar'}
                        </button>
                        <Link href={`/onboarding/proyectos/${lead.id}`} className="flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-500 rounded-lg hover:border-gray-300 hover:text-gray-900 transition-colors" title="Ver proyecto">
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                        <Link href={`/invoices?search=${encodeURIComponent(lead.contact?.nombre || '')}`} className="flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-400 rounded-lg hover:border-gray-300 hover:text-gray-700 transition-colors" title="Facturas">
                          <FileText className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>

            ) : (

              /* ── GRID VIEW ── */
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {projects.map(lead => {
                  const stageName  = stageLabel(lead.estado)
                  const name       = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`
                  const company    = lead.contact?.empresa
                  const amount     = lead.valor ? Number(lead.valor) : null
                  const dateStr    = new Date(lead.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
                  return (
                    <div
                      key={lead.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/onboarding/proyectos/${lead.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/onboarding/proyectos/${lead.id}`) }}
                      className="group flex flex-col rounded-2xl bg-white border border-gray-200/80 hover:border-gray-300 hover:shadow-sm transition-all overflow-hidden cursor-pointer"
                    >
                      <div className="flex flex-col flex-1 p-5 gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-semibold text-base text-gray-700 flex-shrink-0">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-700 flex-shrink-0">
                            {stageName}
                          </span>
                        </div>

                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{name}</div>
                          {amount ? (
                            <div className="text-base font-semibold text-gray-700 mt-1">{fmt(amount)}</div>
                          ) : (
                            <div className="text-xs text-gray-400 mt-1">Sin valorar</div>
                          )}
                        </div>

                        <div className="text-[11px] text-gray-400">{dateStr}</div>

                        <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                          {lead.configuracion && (
                            <AssignDevelopersButton leadId={lead.id} variant="icon" />
                          )}
                          <button
                            onClick={async () => { const r = await fetch(`/api/contacts/${lead.contact.id}`); if (r.ok) void handleConfigure(await r.json(), undefined, undefined, lead.id) }}
                            className="flex-1 flex items-center justify-center h-9 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors"
                          >
                            {lead.configuracion ? 'Editar' : 'Configurar'}
                          </button>
                          <Link
                            href={`/onboarding/proyectos/${lead.id}`}
                            className="flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-400 rounded-lg hover:border-gray-300 hover:text-gray-700 transition-colors"
                            title="Ver proyecto"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                          <Link
                            href={`/invoices?search=${encodeURIComponent(lead.contact?.nombre || '')}`}
                            className="flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-400 rounded-lg hover:border-gray-300 hover:text-gray-700 transition-colors"
                            title="Facturas"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

            )}
          </div>
        )}

      </div>
    </Layout>
  )
}
