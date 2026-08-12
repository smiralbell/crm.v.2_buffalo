import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import OnboardingProjectEditForm from '@/components/onboarding/OnboardingProjectEditForm'
import { ChevronLeft, CheckCircle, Settings, Save, Loader2, ClipboardList, Sparkles, Pencil, ChevronDown } from 'lucide-react'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'

interface InvoiceData {
  client_name: string; client_company_name?: string; client_email?: string
  client_address?: string
  services: Array<{ description: string; quantity: number; price: number; tax: number; total: number }>
  subtotal: number; iva: number; total: number; status?: string
}

/** Acciones del configurador → avance en pipeline GLOBAL (no WEB/Cold Calling) */
const GLOBAL_PIPELINE_ACTIONS = new Set([
  'enviar_propuesta',
  'enviar_contrato',
  'enviar_factura',
  'enviar_onboarding',
])

const ACTION_STAGE_LABEL: Record<string, string> = {
  enviar_propuesta:  'PROPUESTA ENVIADA',
  enviar_contrato:   'CONTRATO ENVIADO',
  enviar_factura:    'FACTURA EMITIDA',
  enviar_onboarding: 'ONBOARDING',
}

// Maps configurator action → lead.estado DB value
const ACTION_TO_ESTADO: Record<string, string> = {
  enviar_propuesta:  'propuesta',
  enviar_contrato:   'negociando',
  enviar_onboarding: 'activo',
  enviar_factura:    'activo',
}

export default function ConfigurePage() {
  const router     = useRouter()
  const iframeRef  = useRef<HTMLIFrameElement>(null)

  const [iframeUrl, setIframeUrl]           = useState('')
  const [iframeHeight, setIframeHeight]     = useState(700)
  const [notification, setNotification]     = useState<string | null>(null)
  const [notifType, setNotifType]           = useState<'ok' | 'err'>('ok')
  const [draftSaved, setDraftSaved]         = useState(false)
  const [savedConfig, setSavedConfig]       = useState('')   // base64 saved configuracion
  const [configLoading, setConfigLoading]   = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [configSaved, setConfigSaved]       = useState(false)
  const [resolvedLeadId, setResolvedLeadId] = useState('')
  const [ensuringLead, setEnsuringLead]     = useState(false)

  // Read URL params
  const { lead, nombre, empresa, email, ciudad, pipeline, card, mode, edit } = router.query as Record<string, string>
  const activeLeadId = resolvedLeadId || lead || ''
  const [pickedMode, setPickedMode] = useState<'packaged' | 'custom' | 'audit' | null>(null)
  const isEditIntent = edit === '1' || edit === 'true'

  const effectiveMode: 'packaged' | 'custom' | 'audit' | null =
    (mode === 'custom' || mode === 'packaged' || mode === 'audit' ? mode : null) ||
    pickedMode ||
    (savedConfig
      ? parseConfiguradorConfig(savedConfig)?.mode === 'custom'
        ? 'custom'
        : savedConfig
          ? 'packaged'
          : null
      : null)

  // Resolved pipeline + card (from URL params OR auto-discovered)
  const [resolvedPipeline, setResolvedPipeline] = useState('')
  const [resolvedCard, setResolvedCard]         = useState('')
  const [showDataEditor, setShowDataEditor]     = useState(true)

  // ── Auto-vincular lead si falta en la URL (contacto existente sin lead) ──
  useEffect(() => {
    if (!router.isReady) return
    if (lead) {
      setResolvedLeadId(lead)
      return
    }
    if (!email && !nombre) return

    let cancelled = false
    setEnsuringLead(true)

    ;(async () => {
      try {
        const q = email || nombre
        const cRes = await fetch(`/api/contacts?search=${encodeURIComponent(q)}`)
        if (!cRes.ok || cancelled) return
        const cData = await cRes.json()
        const contact = (cData.contacts || []).find((c: { id: number; email?: string | null; nombre?: string | null }) =>
          (email && c.email?.toLowerCase() === email.toLowerCase()) ||
          (nombre && c.nombre?.toLowerCase() === nombre.toLowerCase())
        )
        if (!contact || cancelled) return

        let leadId: number | null = null
        const lRes = await fetch(`/api/leads?search=${encodeURIComponent(q)}&pageSize=20`)
        if (lRes.ok) {
          const lData = await lRes.json()
          const match = (lData.leads || []).find((l: { contact?: { id: number } }) => l.contact?.id === contact.id)
          if (match) leadId = match.id
        }

        if (!leadId) {
          const createRes = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact_id: contact.id, estado: 'frio', prioridad: 'media' }),
          })
          if (createRes.ok) {
            leadId = (await createRes.json()).id
          } else if (createRes.status === 409) {
            const err = await createRes.json().catch(() => ({}))
            leadId = err.leadId ?? null
          }
        }

        if (!leadId || cancelled) return

        setResolvedLeadId(String(leadId))
        await router.replace(
          { pathname: router.pathname, query: { ...router.query, lead: String(leadId) } },
          undefined,
          { shallow: true }
        )
      } catch (e) {
        console.error('ensureLead failed', e)
      } finally {
        if (!cancelled) setEnsuringLead(false)
      }
    })()

    return () => { cancelled = true }
  }, [router.isReady, lead, email, nombre, router])

  // ── Step 0: load saved configuracion from lead ───────────────────────
  useEffect(() => {
    if (!router.isReady) return
    if (!activeLeadId) {
      setSavedConfig('')
      setConfigSaved(false)
      setConfigLoading(false)
      return
    }

    let cancelled = false
    setConfigLoading(true)

    fetch(`/api/leads/${activeLeadId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        if (data?.configuracion) {
          setSavedConfig(data.configuracion)
          setConfigSaved(true)
        } else {
          setSavedConfig('')
          setConfigSaved(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSavedConfig('')
          setConfigSaved(false)
        }
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false)
      })

    return () => { cancelled = true }
  }, [router.isReady, activeLeadId])

  // ── Step 1: resolve pipeline + card ─────────────────────────────────
  useEffect(() => {
    if (!router.isReady) return

    if (pipeline && card) {
      // Already provided in the URL — use them directly
      setResolvedPipeline(pipeline)
      setResolvedCard(card)
      return
    }

    if (!activeLeadId) return

    // Auto-discover: find this contact's card in the pipeline
    fetch(`/api/pipelines/lookup?entity_id=${encodeURIComponent(activeLeadId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.pipelineId && data?.cardId) {
          setResolvedPipeline(data.pipelineId)
          setResolvedCard(data.cardId)
        }
        // If not found, we proceed without pipeline sync (no card exists yet)
      })
      .catch(() => { /* best-effort */ })
  }, [router.isReady, activeLeadId, pipeline, card])

  // Si eligen a medida o auditoría sin config aún → brief + IA
  useEffect(() => {
    if (!router.isReady || configLoading) return
    if (isEditIntent || savedConfig) return
    if (effectiveMode !== 'custom' && effectiveMode !== 'audit') return

    const params = new URLSearchParams()
    if (activeLeadId) params.set('lead', activeLeadId)
    if (nombre) params.set('nombre', nombre)
    if (empresa) params.set('empresa', empresa)
    if (email) params.set('email', email)
    if (ciudad) params.set('ciudad', ciudad || '')
    if (pipeline) params.set('pipeline', pipeline)
    if (card) params.set('card', card)
    if (effectiveMode === 'audit') {
      router.replace(`/onboarding/notas?${params.toString()}`)
      return
    }
    router.replace(`/onboarding/custom?${params.toString()}`)
  }, [
    router.isReady,
    configLoading,
    isEditIntent,
    effectiveMode,
    savedConfig,
    activeLeadId,
    nombre,
    empresa,
    email,
    ciudad,
    pipeline,
    card,
    router,
  ])

  // Edición con config: solo formulario (nombre, precios, fechas). Sin iframe de resumen/documentos/a medida.
  const isEditWithConfig = Boolean(savedConfig)
  const showModePicker =
    !configLoading &&
    !isEditIntent &&
    !isEditWithConfig &&
    !effectiveMode

  // Configurador embebido: solo si no hay config guardada y el modo es empaquetado
  const showConfiguratorIframe = Boolean(
    !configLoading && effectiveMode === 'packaged' && !isEditWithConfig
  )

  // ── Step 2: build iframe URL (solo empaquetados nuevos) ────────────────
  useEffect(() => {
    if (!router.isReady) return
    if (!showConfiguratorIframe) {
      setIframeUrl('')
      return
    }

    const p = new URLSearchParams({ crm: '1' })
    if (nombre)           p.set('nombre',     nombre)
    if (empresa)          p.set('empresa',    empresa)
    if (email)            p.set('email',      email)
    if (ciudad)           p.set('ciudad',     ciudad || '')
    if (activeLeadId)     p.set('leadId',     activeLeadId)
    if (resolvedPipeline) p.set('pipelineId', resolvedPipeline)
    if (resolvedCard)     p.set('cardId',     resolvedCard)

    const slug = (empresa || nombre || 'XXX').substring(0, 6).toUpperCase().replace(/\s/g, '-')
    p.set('ref',     `BUF-2026-${slug}-001`)
    p.set('baseurl', typeof window !== 'undefined' ? window.location.origin : '')

    setIframeUrl(`/configurador.html?${p.toString()}`)
  }, [
    router.isReady,
    showConfiguratorIframe,
    nombre,
    empresa,
    email,
    ciudad,
    activeLeadId,
    resolvedPipeline,
    resolvedCard,
  ])

  // ── postMessage listener: pipeline moves + invoice + height ─────────
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (event.data?.type === 'buffalo_crm_save_error') {
        setSaving(false)
        if (event.data.error === 'no_lead') {
          toast('No hay lead vinculado — no se pudo guardar', 'err')
        } else if (event.data.error === 'empty') {
          toast('Falta configuración para guardar', 'err')
        }
        return
      }

      // Auto-resize iframe
      if (event.data?.type === 'buffalo_iframe_height') {
        setIframeHeight(Math.max(600, event.data.height + 40))
        return
      }

      if (!event.data || event.data.type !== 'buffalo_configurador_action') return

      const { action, cardId: evCard, pipelineId: evPipeline, invoiceData,
              leadId: evLead, projectTotal, projectNotes, projectConfig, projectMaint } = event.data

      // Use event IDs if present, otherwise fall back to resolved state
      const pip  = evPipeline || resolvedPipeline
      const crd  = evCard     || resolvedCard
      const lid  = evLead || activeLeadId

      // ── Auto-save draft + update pipeline card amount ──────────────────
      if (action === 'guardar_borrador') {
        if (lid && (projectTotal != null || projectNotes)) {
          setSaving(true)
          updateLead(String(lid), projectTotal, projectNotes, undefined, projectConfig)
            .then(async () => {
              setDraftSaved(true)
              setConfigSaved(true)
              setSaving(false)
              setTimeout(() => setDraftSaved(false), 2500)
              toast('Configuración guardada correctamente', 'ok')
              if (projectConfig) {
                try {
                  await syncProyecto(String(lid), projectConfig, projectTotal, projectMaint)
                } catch (e) {
                  console.error('syncProyecto failed', e)
                  toast(`${(e as Error).message || 'Error al sincronizar con proyectos'}`, 'err')
                }
              }
            })
            .catch((e: Error) => {
              setSaving(false)
              console.error('guardar_borrador failed', e)
              toast(`${e.message || 'Error al guardar — reinicia el servidor'}`, 'err')
            })
        } else {
          setSaving(false)
          toast('Activa al menos un agente antes de guardar', 'err')
        }
        // Also update pipeline card amount without changing stage
        if (pip && crd && projectTotal != null) {
          updateCardAmount(pip, crd, projectTotal).catch(console.error)
        }
        return
      }

      // ── Sync lead: valor + notas + estado ──────────────────────────────
      if (lid && action !== 'emitir_factura') {
        const nuevoEstado = ACTION_TO_ESTADO[action]
        try {
          await updateLead(String(lid), projectTotal, projectNotes, nuevoEstado, projectConfig)
          if (projectConfig) {
            await syncProyecto(String(lid), projectConfig, projectTotal, projectMaint, nuevoEstado)
          }
        } catch (e) {
          console.error('updateLead failed', e)
          toast(`${(e as Error).message || 'Error al guardar — reinicia el servidor'}`, 'err')
        }
      }

      // Generar / Ver factura → borrador CRM, SIN avanzar pipeline
      if (action === 'emitir_factura' && invoiceData) {
        try {
          const res = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...(invoiceData as InvoiceData), status: 'draft' }),
          })
          if (res.ok) {
            const inv = await res.json()
            toast(`Factura ${inv.invoice_number} creada (borrador)`, 'ok')
            setTimeout(() => router.push(`/invoices/${inv.id}`), 1800)
          } else {
            const e = await res.json().catch(() => ({}))
            toast(`${e.error || 'Error creando factura'}`, 'err')
          }
        } catch { toast('Error al guardar la factura', 'err') }
        return
      }

      // Enviar * → embudo GLOBAL
      if (lid && GLOBAL_PIPELINE_ACTIONS.has(action)) {
        const label = ACTION_STAGE_LABEL[action] || action
        try {
          const res = await fetch('/api/onboarding/pipeline-advance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leadId: Number(lid),
              action,
              amount: projectTotal ?? null,
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (res.ok && data.ok) {
            toast(`Pipeline global → ${data.stage || label}`, 'ok')
          } else {
            console.error('pipeline-advance', data)
            toast(data.reason || data.error || 'No se pudo avanzar el pipeline', 'err')
          }
        } catch (e) {
          console.error('pipeline-advance failed', e)
          toast('Error al avanzar el pipeline global', 'err')
        }
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [resolvedPipeline, resolvedCard, activeLeadId])

  const updateCardAmount = async (pip: string, crd: string, amount: number) => {
    await fetch(`/api/pipelines/${pip}/cards`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: crd, amount }),
    })
  }

  const syncProyecto = async (
    leadId: string,
    config?: string,
    total?: number,
    maint?: number,
    estado?: string
  ) => {
    if (!config) return
    const res = await fetch('/api/engranaje5/proyectos/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: Number(leadId),
        configuracion: config,
        setupFee: total ?? null,
        monthlyFee: maint ?? null,
        leadEstado: estado ?? null,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const hint = err.hint ? ` — ${err.hint}` : ''
      throw new Error(`${err.error || `Error sincronizando proyecto (${res.status})`}${hint}`)
    }
  }

  const updateLead = async (leadId: string, total?: number, notes?: string, estado?: string, config?: string) => {
    const body: Record<string, unknown> = {}
    if (total != null) body.valor         = total
    if (notes)         body.notas         = notes
    if (estado)        body.estado        = estado
    if (config)        body.configuracion = config
    if (!Object.keys(body).length) return
    const res = await fetch(`/api/leads/${leadId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Error HTTP ${res.status} — reinicia el servidor si persiste`)
    }
  }

  const toast = (msg: string, type: 'ok' | 'err') => {
    setNotification(msg); setNotifType(type)
    setTimeout(() => setNotification(null), 4000)
  }

  const requestSave = useCallback(() => {
    if (!activeLeadId) {
      toast(
        ensuringLead
          ? 'Vinculando lead, espera un momento…'
          : 'No hay lead vinculado — vuelve a Onboarding y selecciona un cliente',
        'err'
      )
      return
    }
    setSaving(true)
    iframeRef.current?.contentWindow?.postMessage({ type: 'buffalo_crm_save_request' }, '*')
    setTimeout(() => setSaving(false), 8000)
  }, [activeLeadId, ensuringLead])

  const displayName = nombre || email || (activeLeadId ? `Lead #${activeLeadId}` : 'Cliente')

  return (
    <Layout>
      <div className="w-full">
      {/* Toast */}
      {notification && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-2.5 text-sm font-medium px-4 py-3 rounded-xl shadow-xl ${
          notifType === 'ok' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'
        }`}>
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {notification}
        </div>
      )}

      {/* Breadcrumb */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <button
            onClick={() => router.push('/onboarding')}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
            Onboarding
          </button>
          <span className="text-gray-200">/</span>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {(displayName || '?').charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-semibold text-gray-900 truncate">{displayName}</span>
            {empresa && empresa !== nombre && (
              <span className="text-sm text-gray-400 truncate hidden sm:inline">· {empresa}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:ml-auto">
          {draftSaved && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium animate-fade-in">
              <Save className="h-3.5 w-3.5" />
              Guardado
            </div>
          )}
          {activeLeadId && showConfiguratorIframe && (
            <button
              type="button"
              onClick={requestSave}
              disabled={saving || ensuringLead}
              className="inline-flex items-center justify-center gap-2 px-4 h-9 w-full sm:w-auto bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-60 transition-colors"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar configuración
            </button>
          )}
          {resolvedPipeline && resolvedCard && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Settings className="h-3.5 w-3.5" />
              Pipeline sincronizado
            </div>
          )}
        </div>
      </div>

      {activeLeadId && configLoading && (
        <div className="mb-6 flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-16 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando proyecto…
        </div>
      )}

      {activeLeadId && !configLoading && isEditWithConfig && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white px-5 py-5 sm:px-6 sm:py-6">
          <div className="mb-4">
            <p className="text-sm font-semibold text-gray-900">Editar proyecto</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Cliente, precio, mensualidad, definición y fechas
            </p>
          </div>
          <OnboardingProjectEditForm leadId={activeLeadId} />
        </div>
      )}

      {activeLeadId && !configLoading && !isEditWithConfig && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDataEditor((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Pencil className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Datos del cliente y proyecto</p>
                <p className="text-xs text-gray-400">
                  Cliente, precio, mensualidad, definición y fechas
                </p>
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${showDataEditor ? 'rotate-180' : ''}`}
            />
          </button>
          {showDataEditor && (
            <div className="px-5 pb-5 border-t border-gray-100 pt-4">
              <OnboardingProjectEditForm leadId={activeLeadId} />
            </div>
          )}
        </div>
      )}

      {/* Mode picker — solo proyectos nuevos sin configuración */}
      {showModePicker && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 max-w-5xl">
          <button
            type="button"
            onClick={() => {
              setPickedMode('audit')
              void router.replace(
                { pathname: router.pathname, query: { ...router.query, mode: 'audit' } },
                undefined,
                { shallow: true }
              )
            }}
            className="text-left rounded-2xl border border-gray-200 bg-white px-8 py-10 min-h-[180px] hover:border-gray-900 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="h-5 w-5 text-gray-800" />
              <span className="text-base font-semibold text-gray-900">Cuaderno de reuniones</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Notas libres con copiloto de huecos. Brief + IA para propuesta, contrato y factura.
            </p>
          </button>
          <button
            type="button"
            onClick={() => {
              setPickedMode('custom')
              void router.replace(
                { pathname: router.pathname, query: { ...router.query, mode: 'custom' } },
                undefined,
                { shallow: true }
              )
            }}
            className="text-left rounded-2xl border border-gray-200 bg-white px-8 py-10 min-h-[180px] hover:border-gray-900 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-gray-800" />
              <span className="text-base font-semibold text-gray-900">A medida (IA)</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Brief con IA cuando el servicio no es una auditoría estándar.
            </p>
          </button>
        </div>
      )}

      {/* Configurador empaquetado — no en edición (sin resumen / documentos / a medida) */}
      {showConfiguratorIframe && iframeUrl ? (
        <iframe
          ref={iframeRef}
          src={iframeUrl}
          style={{
            width:    '100%',
            height:   `${iframeHeight}px`,
            border:   'none',
            display:  'block',
            overflow: 'hidden',
          }}
          scrolling="no"
          title="Configurador de proyecto Buffalo"
        />
      ) : showConfiguratorIframe ? (
        <div className="h-64 flex items-center justify-center text-sm text-gray-400">
          Cargando configurador...
        </div>
      ) : null}
      </div>
    </Layout>
  )
}
