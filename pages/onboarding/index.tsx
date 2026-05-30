import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import {
  Search, UserPlus, ChevronRight, ArrowRight,
  X, Check, Settings, FileText, Building2, Mail, Phone, User
} from 'lucide-react'
import { BUFFALO_STAGE_COLORS } from '@/components/PipelineCardDrawer'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────
interface Contact {
  id: number; nombre: string | null; email: string | null
  telefono: string | null; empresa: string | null; ciudad: string | null
}
interface Lead {
  id: number; estado: string | null; valor: string | number | null
  created_at: string
  contact: { id: number; nombre: string | null; email: string | null }
}

// ── Helpers ────────────────────────────────────────────────────────────
const stageLabel = (estado: string | null) => {
  const map: Record<string, string> = {
    frio: 'LEAD', caliente: 'CONTACTO', reunion: 'REUNIÓN',
    propuesta: 'PROPUESTA ENVIADA', negociando: 'NEGOCIANDO',
    cerrado: 'CONTRATO FIRMADO', activo: 'ACTIVO',
  }
  return map[estado || ''] || (estado || 'LEAD')
}
const fmt = (v: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

// ══════════════════════════════════════════════════════════════════════
export default function OnboardingPage() {
  const router = useRouter()

  // View: 'hub' | 'select' | 'new_lead'
  const [view, setView]             = useState<'hub' | 'select' | 'new_lead'>('hub')
  const [selected, setSelected]     = useState<Contact | null>(null)

  // Lead search
  const [search, setSearch]         = useState('')
  const [results, setResults]       = useState<Contact[]>([])

  // New lead form
  const [form, setForm]             = useState({ nombre: '', empresa: '', email: '', telefono: '' })
  const [creating, setCreating]     = useState(false)
  const [formError, setFormError]   = useState('')
  const [created, setCreated]       = useState<Contact | null>(null)

  // Projects list
  const [projects, setProjects]     = useState<Lead[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)

  // ── Load projects (leads list) ──
  useEffect(() => {
    setLoadingProjects(true)
    fetch('/api/leads?page=1&pageSize=20')
      .then(r => r.json())
      .then(d => setProjects(d.leads || []))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false))
  }, [created])  // refresh when a lead is created

  // ── Search existing contacts (debounced) ──
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

  // ── Create new lead ──
  const handleCreateLead = async () => {
    if (!form.nombre.trim() || !form.email.trim()) {
      setFormError('Nombre y email son obligatorios')
      return
    }
    setFormError('')
    setCreating(true)
    try {
      // 1. Create contact
      const cRes = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          empresa: form.empresa.trim() || undefined,
          telefono: form.telefono.trim() || undefined,
        }),
      })
      if (!cRes.ok) {
        const e = await cRes.json().catch(() => ({}))
        throw new Error(e.error || 'Error creando contacto')
      }
      const contact: Contact = await cRes.json()

      // 2. Create lead
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contact.id, estado: 'frio', prioridad: 'media' }),
      })

      // 3. Add to first contact-type pipeline (best-effort)
      try {
        const pipRes = await fetch('/api/pipelines?entity_type=contact')
        if (pipRes.ok) {
          const pipData = await pipRes.json()
          const firstPipeline = (pipData.pipelines || pipData)[0]
          if (firstPipeline?.id) {
            await fetch(`/api/pipelines/${firstPipeline.id}/cards`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_id: String(contact.id),
                entity_type: 'contact',
                stage: 'LEAD',
                stage_color: BUFFALO_STAGE_COLORS['LEAD'],
              }),
            })
          }
        }
      } catch { /* pipeline add is best-effort */ }

      setCreated(contact)
      setSelected(contact)
      setForm({ nombre: '', empresa: '', email: '', telefono: '' })
      setView('hub')
    } catch (err: any) {
      setFormError(err.message || 'Error al crear el lead')
    } finally {
      setCreating(false)
    }
  }

  const handleSelectContact = (c: Contact) => {
    setSelected(c)
    setSearch('')
    setResults([])
    setView('hub')
  }

  const handleConfigure = (contact: Contact) => {
    const params = new URLSearchParams({
      lead: String(contact.id),
    })
    if (contact.nombre)  params.set('nombre',  contact.nombre)
    if (contact.empresa) params.set('empresa', contact.empresa)
    if (contact.email)   params.set('email',   contact.email)
    if (contact.ciudad)  params.set('ciudad',  contact.ciudad || '')
    router.push(`/onboarding/configure?${params.toString()}`)
  }

  // ══════════════════════════════════════════════════════════════════
  return (
    <Layout>
      <div className="max-w-5xl">

        {/* ── Page header ── */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configura proyectos, genera documentos y gestiona el proceso comercial.
          </p>
        </div>

        {/* ── Action cards ── */}
        {view === 'hub' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-10">

            {/* Card: Lead existente */}
            <button
              onClick={() => { setView('select'); setCreated(null) }}
              className="group text-left rounded-2xl border border-gray-200 bg-white p-6 hover:border-gray-300 hover:shadow-md transition-all"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900">
                <Search className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-1">Lead existente</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Selecciona un lead ya registrado para configurar su proyecto.
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                Seleccionar lead <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* Card: Nuevo lead */}
            <button
              onClick={() => { setView('new_lead'); setCreated(null) }}
              className="group text-left rounded-2xl border border-gray-200 bg-white p-6 hover:border-gray-300 hover:shadow-md transition-all"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900">
                <UserPlus className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-1">Nuevo lead</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Registra un cliente nuevo y añádelo automáticamente al pipeline.
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                Crear lead <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>
        )}

        {/* ── Lead selector (search) ── */}
        {view === 'select' && (
          <div className="mb-10 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Seleccionar lead existente</h2>
              <button
                onClick={() => { setView('hub'); setSearch('') }}
                className="text-gray-400 hover:text-gray-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre, email o empresa..."
                className="w-full pl-10 pr-4 h-11 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white"
              />
            </div>
            {results.length > 0 && (
              <div className="mt-3 space-y-1">
                {results.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectContact(c)}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors group"
                  >
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm">
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
              <p className="mt-3 text-sm text-gray-400 text-center py-4">Sin resultados para "{search}"</p>
            )}
          </div>
        )}

        {/* ── New lead form ── */}
        {view === 'new_lead' && (
          <div className="mb-10 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900">Nuevo lead</h2>
              <button onClick={() => setView('hub')} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nombre completo *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    autoFocus
                    type="text" value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Alex Melero García"
                    className="w-full pl-9 pr-3 h-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="alex@empresa.com"
                    className="w-full pl-9 pr-3 h-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Empresa</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text" value={form.empresa}
                    onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))}
                    placeholder="M7 Consulting SLU"
                    className="w-full pl-9 pr-3 h-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Teléfono</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="tel" value={form.telefono}
                    onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                    placeholder="+34 600 000 000"
                    className="w-full pl-9 pr-3 h-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>
            </div>
            {formError && (
              <p className="mt-3 text-xs text-red-600 font-medium">{formError}</p>
            )}
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleCreateLead}
                disabled={creating}
                className="flex items-center gap-2 px-5 h-10 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {creating ? 'Creando...' : (
                  <>
                    <Check className="h-4 w-4" />
                    Crear lead y configurar
                  </>
                )}
              </button>
              <button onClick={() => setView('hub')} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── Selected lead banner → configure CTA ── */}
        {selected && view === 'hub' && (
          <div className="mb-10 flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white font-bold text-base">
              {(selected.nombre || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-gray-900 truncate">{selected.nombre}</div>
              <div className="text-xs text-gray-400 truncate">
                {[selected.empresa, selected.email].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleConfigure(selected)}
              className="flex items-center gap-2 px-5 h-10 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors flex-shrink-0"
            >
              <Settings className="h-4 w-4" />
              Configurar proyecto
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Created success banner ── */}
        {created && view === 'hub' && (
          <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
            <Check className="h-4 w-4 flex-shrink-0" />
            Lead <strong>{created.nombre}</strong> creado y añadido al pipeline. Ya puedes configurar su proyecto.
          </div>
        )}

        {/* ══ Projects section ══════════════════════════════════════════ */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">Proyectos</h2>
            <span className="text-xs text-gray-400">{projects.length} leads</span>
          </div>

          {loadingProjects ? (
            <div className="py-12 text-center text-sm text-gray-400">Cargando proyectos...</div>
          ) : projects.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
              <p className="text-sm text-gray-400">No hay proyectos todavía.</p>
              <p className="text-xs text-gray-300 mt-1">Crea un lead o selecciona uno existente para empezar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map(lead => {
                const stageName = stageLabel(lead.estado)
                const stageColor = BUFFALO_STAGE_COLORS[stageName] || '#6B7280'
                const name = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`
                const amount = lead.valor ? Number(lead.valor) : null

                return (
                  <div
                    key={lead.id}
                    className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    {/* Avatar */}
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 font-bold text-sm">
                      {name.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-bold text-gray-900 truncate">{name}</span>
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide text-white"
                          style={{ backgroundColor: stageColor }}
                        >
                          {stageName}
                        </span>
                        {amount && (
                          <span className="text-xs font-semibold text-gray-500">{fmt(amount)}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Lead #{lead.id} · {new Date(lead.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={async () => {
                          // Fetch full contact then configure
                          const res = await fetch(`/api/contacts/${lead.contact.id}`)
                          if (res.ok) {
                            const contact: Contact = await res.json()
                            handleConfigure(contact)
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 h-8 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        Configurar
                      </button>
                      <Link
                        href={`/invoices?search=${encodeURIComponent(lead.contact?.nombre || '')}`}
                        className="flex items-center gap-1.5 px-3 h-8 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Facturas
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </Layout>
  )
}
