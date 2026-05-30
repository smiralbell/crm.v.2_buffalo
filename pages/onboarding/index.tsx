import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { ChevronLeft, User, CheckCircle, ArrowRight, FileText } from 'lucide-react'
import Link from 'next/link'

interface Contact {
  id: number
  nombre: string | null
  email: string | null
  telefono: string | null
  empresa: string | null
  ciudad: string | null
}

interface InvoiceData {
  client_name: string
  client_company_name?: string
  client_email?: string
  client_address?: string
  services: Array<{ description: string; quantity: number; price: number; tax: number; total: number }>
  subtotal: number
  iva: number
  total: number
  status?: string
}

// Pipeline stage auto-advance map
const STAGE_ADVANCE: Record<string, string> = {
  enviar_propuesta:   'PROPUESTA ENVIADA',
  enviar_contrato:    'CONTRATO FIRMADO',
  emitir_factura:     'FACTURA EMITIDA',
  enviar_onboarding:  'ONBOARDING',
}

export default function OnboardingPage() {
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [contacts, setContacts]           = useState<Contact[]>([])
  const [selectedContact, setSelected]    = useState<Contact | null>(null)
  const [searchTerm, setSearchTerm]       = useState('')
  const [showDropdown, setShowDropdown]   = useState(false)
  const [iframeUrl, setIframeUrl]         = useState('')
  const [notification, setNotification]   = useState<string | null>(null)
  const [loadingContact, setLoadingContact] = useState(false)

  // Read URL params
  const leadId     = router.query.lead     as string | undefined
  const pipelineId = router.query.pipeline as string | undefined
  const cardId     = router.query.card     as string | undefined

  // Auto-select from URL param on load
  useEffect(() => {
    if (!leadId) return
    setLoadingContact(true)
    fetch(`/api/contacts/${leadId}`)
      .then(r => r.json())
      .then(c => { setSelected(c); setSearchTerm(c.nombre || c.email || '') })
      .catch(console.error)
      .finally(() => setLoadingContact(false))
  }, [leadId])

  // Search contacts when typing
  useEffect(() => {
    if (searchTerm.length < 2) { setContacts([]); return }
    const timer = setTimeout(() => {
      fetch(`/api/contacts?search=${encodeURIComponent(searchTerm)}&page=1`)
        .then(r => r.json())
        .then(data => {
          const list: Contact[] = Array.isArray(data) ? data : (data.contacts || [])
          setContacts(list)
        })
        .catch(console.error)
    }, 250)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Build iframe URL when contact changes
  useEffect(() => {
    if (!selectedContact) {
      setIframeUrl('/configurador.html?crm=1')
      return
    }
    const params = new URLSearchParams({ crm: '1' })
    if (selectedContact.nombre)  params.set('nombre',  selectedContact.nombre)
    if (selectedContact.empresa) params.set('empresa', selectedContact.empresa)
    if (selectedContact.email)   params.set('email',   selectedContact.email)
    if (selectedContact.ciudad)  params.set('ciudad',  selectedContact.ciudad || '')
    if (pipelineId)              params.set('pipelineId', pipelineId)
    if (cardId)                  params.set('cardId',     cardId)
    if (leadId)                  params.set('leadId',     leadId)
    // Default ref
    params.set('ref', `BUF-2026-${(selectedContact.empresa || selectedContact.nombre || 'XXX').substring(0,6).toUpperCase().replace(/\s/g,'-')}-001`)
    setIframeUrl(`/configurador.html?${params.toString()}`)
  }, [selectedContact, pipelineId, cardId, leadId])

  // Listen to postMessage from configurador iframe
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'buffalo_configurador_action') return
      const { action, cardId: evCardId, pipelineId: evPipelineId, invoiceData } = event.data
      const targetStage = STAGE_ADVANCE[action]

      // ── 1. Si es factura, crear en el sistema de facturas ──
      if (action === 'emitir_factura' && invoiceData) {
        try {
          const invRes = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoiceData as InvoiceData),
          })

          if (invRes.ok) {
            const created = await invRes.json()
            showNotification(`✅ Factura ${created.invoice_number} creada`)

            // Move pipeline card to FACTURA EMITIDA
            if (evCardId && evPipelineId) {
              await movePipelineCard(evPipelineId, evCardId, 'FACTURA EMITIDA')
            }

            // Navigate to the new invoice after a short delay
            setTimeout(() => {
              router.push(`/invoices/${created.id}`)
            }, 1500)
          } else {
            const err = await invRes.json().catch(() => ({}))
            showNotification(`❌ Error creando factura: ${err.error || 'desconocido'}`)
          }
        } catch (err) {
          console.error('Error creating invoice:', err)
          showNotification('❌ Error al guardar la factura')
        }
        return
      }

      // ── 2. Resto de acciones: mover tarjeta de pipeline ──
      if (targetStage && evCardId && evPipelineId) {
        await movePipelineCard(evPipelineId, evCardId, targetStage)
        showNotification(`✅ Pipeline movido a "${targetStage}"`)
      } else if (targetStage) {
        showNotification(`✅ ${action.replace(/_/g, ' ')}`)
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const movePipelineCard = async (pipelineId: string, cardId: string, stage: string) => {
    try {
      await fetch(`/api/pipelines/${pipelineId}/cards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: cardId, stage, position: 0 }),
      })
    } catch (err) {
      console.error('Error moving pipeline card:', err)
    }
  }

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  // Server-side filtered contacts (already limited)
  const filtered = contacts.slice(0, 8)

  const handleSelect = (c: Contact) => {
    setSelected(c)
    setSearchTerm(c.nombre || c.email || '')
    setShowDropdown(false)
  }

  const handleClear = () => {
    setSelected(null)
    setSearchTerm('')
    setShowDropdown(false)
  }

  return (
    <Layout>
      {/* Notification toast */}
      {notification && (
        <div className="fixed top-6 right-6 z-[100] flex items-center gap-2.5 bg-gray-900 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-xl animate-fade-in">
          <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
          {notification}
        </div>
      )}

      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          {pipelineId && (
            <Link
              href={`/pipelines/${pipelineId}`}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Volver al pipeline
            </Link>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Configurador de proyecto</h1>
        <p className="mt-1 text-sm text-gray-500">
          Selecciona un lead, configura el proyecto y genera todos los documentos.
        </p>
      </div>

      {/* Lead selector */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Lead / Cliente
        </label>
        <div className="relative max-w-md">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setShowDropdown(true); setSelected(null) }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder="Buscar lead por nombre, email o empresa..."
              className="w-full pl-9 pr-4 h-10 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
            />
            {selectedContact && (
              <button
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Dropdown */}
          {showDropdown && searchTerm.length >= 1 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400">Sin resultados</div>
              ) : (
                filtered.map(c => (
                  <button
                    key={c.id}
                    onMouseDown={() => handleSelect(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-sm font-semibold text-gray-900">{c.nombre || '—'}</div>
                    <div className="text-xs text-gray-400">
                      {[c.empresa, c.email].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Selected contact badge */}
        {selectedContact && (
          <div className="mt-2 flex items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              {selectedContact.nombre || selectedContact.email}
              {selectedContact.empresa && (
                <span className="text-gray-400">· {selectedContact.empresa}</span>
              )}
            </div>
            {pipelineId && cardId && (
              <div className="text-xs text-gray-400 flex items-center gap-1">
                <ArrowRight className="h-3 w-3" />
                Las acciones moverán la tarjeta en el pipeline
              </div>
            )}
          </div>
        )}
      </div>

      {/* Configurador iframe */}
      <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
        {loadingContact ? (
          <div className="h-32 flex items-center justify-center text-sm text-gray-400">
            Cargando datos del lead...
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            className="w-full"
            style={{ height: 'calc(100vh - 280px)', minHeight: '600px', border: 'none' }}
            title="Configurador de proyecto Buffalo"
          />
        )}
      </div>
    </Layout>
  )
}
