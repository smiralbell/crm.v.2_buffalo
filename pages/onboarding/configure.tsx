import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { ChevronLeft, CheckCircle, Settings, Save, Loader2 } from 'lucide-react'
import { BUFFALO_STAGE_COLORS } from '@/components/PipelineCardDrawer'

interface InvoiceData {
  client_name: string; client_company_name?: string; client_email?: string
  client_address?: string
  services: Array<{ description: string; quantity: number; price: number; tax: number; total: number }>
  subtotal: number; iva: number; total: number; status?: string
}

const STAGE_ADVANCE: Record<string, string> = {
  enviar_propuesta:  'PROPUESTA ENVIADA',
  enviar_contrato:   'CONTRATO FIRMADO',
  emitir_factura:    'FACTURA EMITIDA',
  enviar_onboarding: 'ONBOARDING',
}

// Maps configurator action → lead.estado DB value
const ACTION_TO_ESTADO: Record<string, string> = {
  enviar_propuesta:  'propuesta',
  enviar_contrato:   'cerrado',
  enviar_onboarding: 'activo',
  emitir_factura:    'activo',
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
  const [saving, setSaving]                 = useState(false)
  const [configSaved, setConfigSaved]       = useState(false)
  const [resolvedLeadId, setResolvedLeadId] = useState('')
  const [ensuringLead, setEnsuringLead]     = useState(false)

  // Read URL params
  const { lead, nombre, empresa, email, ciudad, pipeline, card } = router.query as Record<string, string>
  const activeLeadId = resolvedLeadId || lead || ''

  // Resolved pipeline + card (from URL params OR auto-discovered)
  const [resolvedPipeline, setResolvedPipeline] = useState('')
  const [resolvedCard, setResolvedCard]         = useState('')

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
    if (!router.isReady || !activeLeadId) return
    fetch(`/api/leads/${activeLeadId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.configuracion) {
          setSavedConfig(data.configuracion)
          setConfigSaved(true)
        }
      })
      .catch(() => {})
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

  // ── Step 2: build iframe URL once we have all params ────────────────
  useEffect(() => {
    if (!router.isReady) return

    const p = new URLSearchParams({ crm: '1' })
    if (nombre)           p.set('nombre',     nombre)
    if (empresa)          p.set('empresa',    empresa)
    if (email)            p.set('email',      email)
    if (ciudad)           p.set('ciudad',     ciudad || '')
    if (activeLeadId)     p.set('leadId',     activeLeadId)
    if (resolvedPipeline) p.set('pipelineId', resolvedPipeline)
    if (resolvedCard)     p.set('cardId',     resolvedCard)
    if (savedConfig)      p.set('cfg',        savedConfig)   // restore saved config

    // Default ref
    const slug = (empresa || nombre || 'XXX').substring(0, 6).toUpperCase().replace(/\s/g, '-')
    p.set('ref',     `BUF-2026-${slug}-001`)
    p.set('baseurl', typeof window !== 'undefined' ? window.location.origin : '')

    setIframeUrl(`/configurador.html?${p.toString()}`)
  }, [router.isReady, nombre, empresa, email, ciudad, activeLeadId, resolvedPipeline, resolvedCard, savedConfig])

  // ── postMessage listener: pipeline moves + invoice + height ─────────
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (event.data?.type === 'buffalo_crm_save_error') {
        setSaving(false)
        if (event.data.error === 'no_lead') {
          toast('No hay lead vinculado — no se pudo guardar', 'err')
        } else if (event.data.error === 'empty') {
          toast('Activa al menos un agente antes de guardar', 'err')
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
      const targetStage = STAGE_ADVANCE[action]

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
      if (lid) {
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

      if (action === 'emitir_factura' && invoiceData) {
        try {
          const res = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoiceData as InvoiceData),
          })
          if (res.ok) {
            const inv = await res.json()
            if (pip && crd) await movePipelineCard(pip, crd, 'FACTURA EMITIDA', projectTotal)
            toast(`Factura ${inv.invoice_number} creada`, 'ok')
            setTimeout(() => router.push(`/invoices/${inv.id}`), 1800)
          } else {
            const e = await res.json().catch(() => ({}))
            toast(`${e.error || 'Error creando factura'}`, 'err')
          }
        } catch { toast('Error al guardar la factura', 'err') }
        return
      }

      if (targetStage) {
        if (pip && crd) await movePipelineCard(pip, crd, targetStage, projectTotal)
        toast(`Pipeline → ${targetStage}`, 'ok')
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

  const movePipelineCard = async (pip: string, crd: string, stage: string, amount?: number) => {
    await fetch(`/api/pipelines/${pip}/cards`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id:     crd,
        stage,
        position:    0,
        stage_color: BUFFALO_STAGE_COLORS[stage] || '#3B82F6',
        ...(amount != null ? { amount } : {}),
      }),
    }).catch(console.error)
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
      throw new Error(err.error || `Error sincronizando proyecto (${res.status})`)
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
      <div className="w-full max-w-7xl mx-auto">
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
      <div className="mb-5 flex items-center gap-4">
        <button
          onClick={() => router.push('/onboarding')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Onboarding
        </button>
        <span className="text-gray-200">/</span>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {(displayName || '?').charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-gray-900 truncate">{displayName}</span>
          {empresa && empresa !== nombre && (
            <span className="text-sm text-gray-400">· {empresa}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {draftSaved && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium animate-fade-in">
              <Save className="h-3.5 w-3.5" />
              Guardado
            </div>
          )}
          {activeLeadId && (
            <button
              type="button"
              onClick={requestSave}
              disabled={saving || ensuringLead}
              className="inline-flex items-center gap-2 px-4 h-9 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-60 transition-colors"
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

      {/* Configurador */}
      {iframeUrl ? (
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
      ) : (
        <div className="h-64 flex items-center justify-center text-sm text-gray-400">
          Cargando configurador...
        </div>
      )}
      </div>
    </Layout>
  )
}
