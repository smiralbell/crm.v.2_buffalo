import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { ChevronLeft, CheckCircle, Settings } from 'lucide-react'
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

export default function ConfigurePage() {
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeUrl, setIframeUrl]       = useState('')
  const [notification, setNotification] = useState<string | null>(null)
  const [notifType, setNotifType]       = useState<'ok' | 'err'>('ok')

  // Read URL params
  const { lead, nombre, empresa, email, ciudad, pipeline, card } = router.query as Record<string, string>

  // Build iframe URL once params are ready
  useEffect(() => {
    if (!router.isReady) return
    const p = new URLSearchParams({ crm: '1' })
    if (nombre)   p.set('nombre',   nombre)
    if (empresa)  p.set('empresa',  empresa)
    if (email)    p.set('email',    email)
    if (ciudad)   p.set('ciudad',   ciudad || '')
    if (pipeline) p.set('pipelineId', pipeline)
    if (card)     p.set('cardId',   card)
    if (lead)     p.set('leadId',   lead)
    // Default ref from empresa/nombre
    const slug = (empresa || nombre || 'XXX').substring(0, 6).toUpperCase().replace(/\s/g, '-')
    p.set('ref', `BUF-2026-${slug}-001`)
    p.set('baseurl', typeof window !== 'undefined' ? `${window.location.origin}` : '')
    setIframeUrl(`/configurador.html?${p.toString()}`)
  }, [router.isReady, nombre, empresa, email, ciudad, pipeline, card, lead])

  // postMessage listener: pipeline moves + invoice creation
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'buffalo_configurador_action') return
      const { action, cardId: evCard, pipelineId: evPipeline, invoiceData } = event.data
      const targetStage = STAGE_ADVANCE[action]

      if (action === 'emitir_factura' && invoiceData) {
        try {
          const res = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoiceData as InvoiceData),
          })
          if (res.ok) {
            const inv = await res.json()
            if (evCard && evPipeline) await movePipelineCard(evPipeline, evCard, 'FACTURA EMITIDA')
            toast(`✅ Factura ${inv.invoice_number} creada`, 'ok')
            setTimeout(() => router.push(`/invoices/${inv.id}`), 1800)
          } else {
            const e = await res.json().catch(() => ({}))
            toast(`❌ ${e.error || 'Error creando factura'}`, 'err')
          }
        } catch { toast('❌ Error al guardar la factura', 'err') }
        return
      }

      if (targetStage) {
        if (evCard && evPipeline) await movePipelineCard(evPipeline, evCard, targetStage)
        toast(`✅ Pipeline → ${targetStage}`, 'ok')
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const movePipelineCard = async (pip: string, crd: string, stage: string) => {
    await fetch(`/api/pipelines/${pip}/cards`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: crd, stage, position: 0, stage_color: BUFFALO_STAGE_COLORS[stage] || '#3B82F6' }),
    }).catch(console.error)
  }

  const toast = (msg: string, type: 'ok' | 'err') => {
    setNotification(msg); setNotifType(type)
    setTimeout(() => setNotification(null), 4000)
  }

  const displayName = nombre || email || `Lead #${lead}`

  return (
    <Layout>
      {/* Toast */}
      {notification && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-2.5 text-sm font-medium px-4 py-3 rounded-xl shadow-xl ${
          notifType === 'ok' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'
        }`}>
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {notification}
        </div>
      )}

      {/* Header */}
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
        {pipeline && card && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
            <Settings className="h-3.5 w-3.5" />
            Las acciones moverán la tarjeta del pipeline automáticamente
          </div>
        )}
      </div>

      {/* Configurador — full width, NO card wrapper */}
      {iframeUrl ? (
        <iframe
          ref={iframeRef}
          src={iframeUrl}
          style={{
            width: '100%',
            height: 'calc(100vh - 160px)',
            minHeight: '600px',
            border: 'none',
            display: 'block',
          }}
          title="Configurador de proyecto Buffalo"
        />
      ) : (
        <div className="h-64 flex items-center justify-center text-sm text-gray-400">
          Cargando configurador...
        </div>
      )}
    </Layout>
  )
}
