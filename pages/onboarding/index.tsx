import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import {
  Search, UserPlus, ChevronRight, ArrowRight,
  X, Check, Building2,
  Mail, Phone, User, Zap, Eye,
  LayoutList, LayoutGrid, FolderOpen, Plus, Trash2, CheckCircle2, Rocket, Pencil,
  PlayCircle, ClipboardList, PauseCircle,
} from 'lucide-react'
import { BUFFALO_STAGE_COLORS } from '@/components/PipelineCardDrawer'
import Link from 'next/link'
import AssignDevelopersButton from '@/components/onboarding/AssignDevelopersButton'
import OnboardingSectionTabs from '@/components/onboarding/OnboardingSectionTabs'
import DeleteOnboardingProjectDialog from '@/components/onboarding/DeleteOnboardingProjectDialog'
import { buildProjectViewData } from '@/lib/onboarding/project-view'
import { isAuditConfiguracion } from '@/lib/onboarding/audit/config-detect'

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

type ProjectFee = { setup: number | null; monthly: number | null }

type ProjectsFilter = 'all' | 'en_marcha' | 'no_en_marcha' | 'auditoria' | 'sin_auditoria'

const PROJECT_FILTERS: {
  id: ProjectsFilter
  label: string
  short: string
  setupLabel: string
  monthlyLabel: string
}[] = [
  { id: 'all', label: 'Todos', short: 'Todos', setupLabel: 'Setup', monthlyLabel: 'Mensual' },
  { id: 'en_marcha', label: 'En marcha', short: 'En marcha', setupLabel: 'Setup en marcha', monthlyLabel: 'Mensual en marcha' },
  { id: 'no_en_marcha', label: 'No en marcha', short: 'Pendientes', setupLabel: 'Setup', monthlyLabel: 'Mensual' },
  { id: 'auditoria', label: 'Auditoría iniciada', short: 'Auditoría', setupLabel: 'Setup', monthlyLabel: 'Mensual' },
  { id: 'sin_auditoria', label: 'Sin auditoría', short: 'Sin auditoría', setupLabel: 'Setup', monthlyLabel: 'Mensual' },
]

function auditResumeUrl(lead: Lead): string {
  const params = new URLSearchParams()
  params.set('lead', String(lead.id))
  if (lead.contact?.nombre) params.set('nombre', lead.contact.nombre)
  if (lead.contact?.empresa) params.set('empresa', lead.contact.empresa)
  if (lead.contact?.email) params.set('email', lead.contact.email)
  return `/onboarding/audit?${params.toString()}`
}

function resolveProjectFees(
  lead: Lead,
  fromDb?: { setup: number | null; monthly: number | null } | null
): ProjectFee {
  const view = buildProjectViewData(
    lead.configuracion || null,
    lead.valor != null ? Number(lead.valor) : null,
    null
  )
  const setup =
    fromDb?.setup != null && fromDb.setup > 0
      ? fromDb.setup
      : view.setupTotal > 0
        ? view.setupTotal
        : lead.valor
          ? Number(lead.valor)
          : null
  const monthly =
    fromDb?.monthly != null && fromDb.monthly > 0
      ? fromDb.monthly
      : view.maintMonthly != null && view.maintMonthly > 0
        ? view.maintMonthly
        : null
  return { setup, monthly }
}

// ── Step indicator ─────────────────────────────────────────────────────
const STEPS = [
  { n: '1', label: 'Registra el lead' },
  { n: '2', label: 'Configura el proyecto' },
  { n: '3', label: 'Genera propuesta · contrato' },
]

// ── Tab definition (add more here in the future) ───────────────────────
type Tab = 'configure' | 'projects'

// ══════════════════════════════════════════════════════════════════════
export default function OnboardingPage() {
  const router = useRouter()

  const urlPipeline = router.query.pipeline as string | undefined
  const urlCard     = router.query.card     as string | undefined
  const urlTab = typeof router.query.tab === 'string' ? router.query.tab : undefined

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
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
  const [buffaloFlags, setBuffaloFlags] = useState<Record<number, boolean>>({})
  const [projectFees, setProjectFees] = useState<Record<number, ProjectFee>>({})
  const [launchingId, setLaunchingId] = useState<number | null>(null)
  const [projectsFilter, setProjectsFilter] = useState<ProjectsFilter>('all')

  useEffect(() => {
    if (!router.isReady) return
    if (urlTab === 'configure') setActiveTab('configure')
    else if (urlTab === 'demos') {
      void router.replace('/demos')
      return
    }
    else setActiveTab('projects')
  }, [router.isReady, urlTab])

  const togglePonerEnMarcha = async (leadId: number, currentlyBuffalo: boolean) => {
    setLaunchingId(leadId)
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ es_buffalo: !currentlyBuffalo }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al actualizar')
      setBuffaloFlags((prev) => ({
        ...prev,
        [leadId]: Boolean(data.proyecto?.es_buffalo ?? !currentlyBuffalo),
      }))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Error al poner en marcha')
    } finally {
      setLaunchingId(null)
    }
  }

  const loadProjects = () => {
    setLoadingProjects(true)
    fetch('/api/leads?configured=1&page=1&pageSize=50')
      .then(r => r.json())
      .then(async (d) => {
        const leads = (d.leads || []) as Lead[]
        setProjects(leads)
        if (leads.length) {
          const ids = leads.map((l) => l.id).join(',')
          const fr = await fetch(`/api/onboarding/projects/buffalo-status?ids=${ids}`)
          const fd = await fr.json().catch(() => ({ flags: {}, fees: {} }))
          const nextFlags: Record<number, boolean> = {}
          for (const [k, v] of Object.entries(fd.flags || {})) {
            nextFlags[Number(k)] = Boolean(v)
          }
          setBuffaloFlags(nextFlags)

          const feesDb = (fd.fees || {}) as Record<
            string,
            { setup: number | null; monthly: number | null }
          >
          const nextFees: Record<number, ProjectFee> = {}
          for (const lead of leads) {
            nextFees[lead.id] = resolveProjectFees(lead, feesDb[String(lead.id)] || null)
          }
          setProjectFees(nextFees)
        } else {
          setBuffaloFlags({})
          setProjectFees({})
        }
      })
      .catch(() => {
        setProjects([])
        setProjectFees({})
      })
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

      // Ir al configurador (elige paquete vs a medida)
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

  const handleConfigure = async (
    contact: Contact,
    overridePipeline?: string,
    overrideCard?: string,
    leadId?: number | null,
    kind?: 'audit' | 'custom'
  ) => {
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

    if (kind === 'audit' || kind === 'custom') {
      if (kind === 'audit') {
        router.push(`/onboarding/audit?${params.toString()}`)
        return
      }
      router.push(`/onboarding/custom?${params.toString()}`)
      return
    }

    // Reconfigurar proyecto existente → picker Auditoría / A medida (o config guardada)
    if (leadId != null) params.set('edit', '1')
    router.push(`/onboarding/configure?${params.toString()}`)
  }

  const filterCounts = useMemo(() => {
    let enMarcha = 0
    let noEnMarcha = 0
    let auditoria = 0
    let sinAuditoria = 0
    for (const lead of projects) {
      const launched = Boolean(buffaloFlags[lead.id])
      const audit = isAuditConfiguracion(lead.configuracion)
      if (launched) enMarcha += 1
      else noEnMarcha += 1
      if (audit) auditoria += 1
      else sinAuditoria += 1
    }
    return {
      all: projects.length,
      en_marcha: enMarcha,
      no_en_marcha: noEnMarcha,
      auditoria,
      sin_auditoria: sinAuditoria,
    }
  }, [projects, buffaloFlags])

  const filteredProjects = useMemo(() => {
    return projects.filter((lead) => {
      const launched = Boolean(buffaloFlags[lead.id])
      const audit = isAuditConfiguracion(lead.configuracion)
      switch (projectsFilter) {
        case 'en_marcha':
          return launched
        case 'no_en_marcha':
          return !launched
        case 'auditoria':
          return audit
        case 'sin_auditoria':
          return !audit
        default:
          return true
      }
    })
  }, [projects, buffaloFlags, projectsFilter])

  const activeFilterMeta =
    PROJECT_FILTERS.find((f) => f.id === projectsFilter) || PROJECT_FILTERS[0]

  const filteredTotals = useMemo(() => {
    return filteredProjects.reduce(
      (acc, lead) => {
        const fee = projectFees[lead.id] || resolveProjectFees(lead, null)
        if (fee.setup) acc.setup += fee.setup
        if (fee.monthly) acc.monthly += fee.monthly
        return acc
      },
      { setup: 0, monthly: 0 }
    )
  }, [filteredProjects, projectFees])

  // ══════════════════════════════════════════════════════════════════
  return (
    <Layout>
      <div
        className={
          activeTab === 'configure'
            ? 'w-full flex flex-col gap-6 min-h-[calc(100dvh-5rem)] md:min-h-[calc(100dvh-3.5rem)]'
            : 'w-full space-y-6'
        }
      >

        {/* ── Tab bar ── */}
        <OnboardingSectionTabs
          active={activeTab === 'configure' ? 'configure' : 'projects'}
          projectsCount={!loadingProjects ? projects.length : undefined}
        />

        {/* ══════════════════════════════════════════════════════════════
            TAB 1 — Configurar nuevo proyecto
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'configure' && (
          <div className="flex flex-1 flex-col gap-6 min-h-0">

            {/* Steps strip */}
            <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
              {STEPS.map((s, i) => (
                <div key={s.n} className="flex items-center">
                  <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100">
                    <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {s.n}
                    </span>
                    <span className="text-[11px] font-medium text-gray-600 whitespace-nowrap">{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <ArrowRight className="hidden sm:block h-3 w-3 text-gray-300 mx-1 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>

            {/* Success banner */}
            {created && view === 'hub' && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700 shrink-0">
                <Check className="h-4 w-4 flex-shrink-0" />
                <span>Lead <strong>{created.nombre}</strong> creado y añadido al pipeline.</span>
              </div>
            )}

            {/* Selected lead → configure CTA */}
            {selected && view === 'hub' && (
              <div className="flex items-center gap-4 rounded-2xl border-2 border-gray-900 bg-white px-5 py-4 shadow-sm shrink-0">
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
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => void handleConfigure(selected, undefined, undefined, undefined, 'audit')}
                    className="px-4 h-10 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors"
                  >
                    Auditoría
                  </button>
                  <button
                    onClick={() => void handleConfigure(selected, undefined, undefined, undefined, 'custom')}
                    className="px-4 h-10 border border-gray-300 text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    A medida (IA)
                  </button>
                </div>
              </div>
            )}

            {/* Action cards (hub) — centradas vertical y horizontalmente */}
            {view === 'hub' && !selected && (
              <div className="flex-1 flex flex-wrap items-center justify-center gap-5 content-center">
                <button
                  type="button"
                  onClick={() => { setView('new_lead'); setCreated(null) }}
                  className="group w-44 h-44 sm:w-48 sm:h-48 rounded-2xl border border-gray-200 bg-white flex flex-col items-center justify-center text-center px-4 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <UserPlus className="h-6 w-6 text-gray-700 mb-3" />
                  <div className="text-sm font-semibold text-gray-900">Nuevo lead</div>
                  <p className="text-[11px] text-gray-400 leading-snug mt-1.5">
                    Primera vez con este cliente
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => { setView('select'); setCreated(null) }}
                  className="group w-44 h-44 sm:w-48 sm:h-48 rounded-2xl border border-gray-200 bg-white flex flex-col items-center justify-center text-center px-4 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <Search className="h-6 w-6 text-gray-700 mb-3" />
                  <div className="text-sm font-semibold text-gray-900">Lead existente</div>
                  <p className="text-[11px] text-gray-400 leading-snug mt-1.5">
                    Busca por nombre, empresa o email
                  </p>
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
            {/* Header: filtro + métricas + acciones */}
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  {/* Filtro */}
                  {!loadingProjects && projects.length > 0 && (
                    <div className="inline-flex flex-wrap items-center gap-0.5 p-1 rounded-xl bg-gray-100/90 border border-gray-200/80">
                      {PROJECT_FILTERS.map((f) => {
                        const active = projectsFilter === f.id
                        const count = filterCounts[f.id]
                        const icon =
                          f.id === 'en_marcha' ? (
                            <Rocket className="h-3 w-3" />
                          ) : f.id === 'no_en_marcha' ? (
                            <PauseCircle className="h-3 w-3" />
                          ) : f.id === 'auditoria' ? (
                            <ClipboardList className="h-3 w-3" />
                          ) : f.id === 'sin_auditoria' ? (
                            <FolderOpen className="h-3 w-3" />
                          ) : null
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setProjectsFilter(f.id)}
                            title={`${f.label} (${count})`}
                            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11px] font-semibold transition-all ${
                              active
                                ? 'bg-white text-gray-900 shadow-sm border border-gray-200/80'
                                : 'text-gray-500 hover:text-gray-800 border border-transparent'
                            }`}
                          >
                            {icon}
                            <span className="hidden sm:inline">{f.short}</span>
                            <span className="sm:hidden">
                              {f.id === 'all'
                                ? 'Todos'
                                : f.id === 'en_marcha'
                                  ? 'Marcha'
                                  : f.id === 'no_en_marcha'
                                    ? 'Pend.'
                                    : f.id === 'auditoria'
                                      ? 'Audit.'
                                      : 'Sin aud.'}
                            </span>
                            <span
                              className={`min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums inline-flex items-center justify-center ${
                                active
                                  ? f.id === 'en_marcha'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : f.id === 'auditoria'
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-gray-900 text-white'
                                  : 'bg-gray-200/80 text-gray-600'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Burbuja total del filtro activo */}
                  {!loadingProjects && projects.length > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2.5 rounded-full bg-gray-900 text-white text-xs font-bold tabular-nums"
                      title={`${filteredProjects.length} onboarding${filteredProjects.length === 1 ? '' : 's'} en este filtro`}
                    >
                      {filteredProjects.length}
                    </span>
                  )}

                  {/* Métricas del filtro */}
                  {!loadingProjects && projects.length > 0 && (
                    <div
                      className={`inline-flex items-stretch h-10 rounded-xl border overflow-hidden ${
                        projectsFilter === 'en_marcha'
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : projectsFilter === 'auditoria'
                            ? 'border-sky-200 bg-sky-50/60'
                            : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 px-3.5 border-r border-inherit/60">
                        <Rocket
                          className={`h-3.5 w-3.5 shrink-0 ${
                            projectsFilter === 'en_marcha'
                              ? 'text-emerald-600'
                              : projectsFilter === 'auditoria'
                                ? 'text-sky-600'
                                : 'text-gray-400'
                          }`}
                        />
                        <div className="leading-tight min-w-0">
                          <p
                            className={`text-[9px] font-medium uppercase tracking-wide ${
                              projectsFilter === 'en_marcha'
                                ? 'text-emerald-700/70'
                                : projectsFilter === 'auditoria'
                                  ? 'text-sky-700/70'
                                  : 'text-gray-400'
                            }`}
                          >
                            {activeFilterMeta.setupLabel}
                          </p>
                          <p
                            className={`text-xs font-semibold tabular-nums truncate ${
                              projectsFilter === 'en_marcha'
                                ? 'text-emerald-900'
                                : projectsFilter === 'auditoria'
                                  ? 'text-sky-900'
                                  : 'text-gray-900'
                            }`}
                          >
                            {fmt(filteredTotals.setup)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center px-3.5">
                        <div className="leading-tight min-w-0">
                          <p
                            className={`text-[9px] font-medium uppercase tracking-wide ${
                              projectsFilter === 'en_marcha'
                                ? 'text-emerald-700/70'
                                : projectsFilter === 'auditoria'
                                  ? 'text-sky-700/70'
                                  : 'text-gray-400'
                            }`}
                          >
                            {activeFilterMeta.monthlyLabel}
                          </p>
                          <p
                            className={`text-xs font-semibold tabular-nums truncate ${
                              projectsFilter === 'en_marcha'
                                ? 'text-emerald-900'
                                : projectsFilter === 'auditoria'
                                  ? 'text-sky-900'
                                  : 'text-gray-900'
                            }`}
                          >
                            {fmt(filteredTotals.monthly)}/mes
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
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
            ) : filteredProjects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center">
                <p className="text-sm text-gray-500">
                  No hay onboardings en «{activeFilterMeta.label}».
                </p>
                <button
                  type="button"
                  onClick={() => setProjectsFilter('all')}
                  className="mt-2 text-xs font-semibold text-gray-500 underline hover:text-gray-800"
                >
                  Ver todos
                </button>
              </div>
            ) : projectsView === 'list' ? (

              /* ── LIST VIEW ── */
              <div className="space-y-3">
                {filteredProjects.map(lead => {
                  const stageName  = stageLabel(lead.estado)
                  const name       = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`
                  const company    = lead.contact?.empresa
                  const fees       = projectFees[lead.id] || resolveProjectFees(lead, null)
                  const amount     = fees.setup
                  const monthly    = fees.monthly
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
                          {amount != null && amount > 0 && (
                            <span className="text-xs font-medium text-gray-500">{fmt(amount)}</span>
                          )}
                          {monthly != null && monthly > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-100">
                              {fmt(monthly)}/mes
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-700">
                            {stageName}
                          </span>
                          <span className="text-[11px] text-gray-400">{dateStr}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pr-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => router.push(auditResumeUrl(lead))}
                          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold bg-sky-50 text-sky-900 border border-sky-200 hover:bg-sky-100 transition-colors"
                          title={
                            isAuditConfiguracion(lead.configuracion)
                              ? 'Continuar la auditoría con el copiloto'
                              : 'Empezar auditoría con el copiloto'
                          }
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                          {isAuditConfiguracion(lead.configuracion)
                            ? 'Reanudar auditoría'
                            : 'Iniciar auditoría'}
                        </button>
                        {buffaloFlags[lead.id] ? (
                          <button
                            type="button"
                            onClick={() => togglePonerEnMarcha(lead.id, true)}
                            disabled={launchingId === lead.id}
                            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                            title="Quitar de Proyectos abiertos"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {launchingId === lead.id ? '…' : 'Proyecto Buffalo'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => togglePonerEnMarcha(lead.id, false)}
                            disabled={launchingId === lead.id || !lead.configuracion}
                            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
                            title="Pasar a Proyectos abiertos"
                          >
                            <Rocket className="h-3.5 w-3.5" />
                            {launchingId === lead.id ? '…' : 'Poner en marcha'}
                          </button>
                        )}
                        {lead.configuracion && (
                          <AssignDevelopersButton leadId={lead.id} variant="icon" />
                        )}
                        <button
                          onClick={async () => { const r = await fetch(`/api/contacts/${lead.contact.id}`); if (r.ok) void handleConfigure(await r.json(), undefined, undefined, lead.id) }}
                          className="flex items-center gap-1.5 px-3 h-9 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
                          title="Editar cliente, proyecto y configuración"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <Link href={`/onboarding/proyectos/${lead.id}`} className="flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-500 rounded-lg hover:border-gray-300 hover:text-gray-900 transition-colors" title="Ver proyecto">
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ id: lead.id, name })}
                          className="flex items-center justify-center w-9 h-9 border border-red-100 text-red-500 rounded-lg hover:border-red-200 hover:bg-red-50 transition-colors"
                          title="Eliminar proyecto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

            ) : (

              /* ── GRID VIEW ── */
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredProjects.map(lead => {
                  const stageName  = stageLabel(lead.estado)
                  const name       = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`
                  const company    = lead.contact?.empresa
                  const fees       = projectFees[lead.id] || resolveProjectFees(lead, null)
                  const amount     = fees.setup
                  const monthly    = fees.monthly
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
                          {company && company !== name && (
                            <div className="text-xs text-gray-400 mt-0.5 truncate">{company}</div>
                          )}
                          {amount != null && amount > 0 ? (
                            <div className="text-base font-semibold text-gray-700 mt-1">{fmt(amount)}</div>
                          ) : (
                            <div className="text-xs text-gray-400 mt-1">Sin valorar</div>
                          )}
                          {monthly != null && monthly > 0 && (
                            <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-100">
                              {fmt(monthly)}/mes
                            </div>
                          )}
                        </div>

                        <div className="text-[11px] text-gray-400">{dateStr}</div>

                        <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => router.push(auditResumeUrl(lead))}
                            className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-semibold bg-sky-50 text-sky-900 border border-sky-200 hover:bg-sky-100 transition-colors"
                            title={
                              isAuditConfiguracion(lead.configuracion)
                                ? 'Continuar la auditoría con el copiloto'
                                : 'Empezar auditoría con el copiloto'
                            }
                          >
                            <PlayCircle className="h-3.5 w-3.5" />
                            {isAuditConfiguracion(lead.configuracion)
                              ? 'Reanudar auditoría'
                              : 'Iniciar auditoría'}
                          </button>
                          {buffaloFlags[lead.id] ? (
                            <button
                              type="button"
                              onClick={() => togglePonerEnMarcha(lead.id, true)}
                              disabled={launchingId === lead.id}
                              className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                              title="Quitar de Proyectos abiertos"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {launchingId === lead.id ? '…' : 'Proyecto Buffalo'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => togglePonerEnMarcha(lead.id, false)}
                              disabled={launchingId === lead.id || !lead.configuracion}
                              className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
                              title="Pasar a Proyectos abiertos"
                            >
                              <Rocket className="h-3.5 w-3.5" />
                              {launchingId === lead.id ? '…' : 'Poner en marcha'}
                            </button>
                          )}
                          <div className="flex items-center gap-1.5">
                            {lead.configuracion && (
                              <AssignDevelopersButton leadId={lead.id} variant="icon" />
                            )}
                            <button
                              onClick={async () => { const r = await fetch(`/api/contacts/${lead.contact.id}`); if (r.ok) void handleConfigure(await r.json(), undefined, undefined, lead.id) }}
                              className="flex-1 flex items-center justify-center gap-1 h-9 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
                              title="Editar cliente, proyecto y configuración"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            <Link
                              href={`/onboarding/proyectos/${lead.id}`}
                              className="flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-400 rounded-lg hover:border-gray-300 hover:text-gray-700 transition-colors"
                              title="Ver proyecto"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ id: lead.id, name })}
                              className="flex items-center justify-center w-9 h-9 border border-red-100 text-red-500 rounded-lg hover:border-red-200 hover:bg-red-50 transition-colors"
                              title="Eliminar proyecto"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

            )}
          </div>
        )}

        <DeleteOnboardingProjectDialog
          open={Boolean(deleteTarget)}
          leadId={deleteTarget?.id ?? null}
          projectName={deleteTarget?.name ?? ''}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
          onDeleted={() => {
            setDeleteTarget(null)
            loadProjects()
          }}
        />
      </div>
    </Layout>
  )
}
