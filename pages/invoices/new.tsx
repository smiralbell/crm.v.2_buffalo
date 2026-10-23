import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useState, useRef, useEffect } from 'react'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import FullScreenLayout from '@/components/FullScreenLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Plus, Trash2, Download } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import InvoicePreview from '@/components/InvoicePreview'
import { getNextDocumentNumber } from '@/lib/invoices/numbers'
import InvoiceFeedbackDialog from '@/components/invoices/InvoiceFeedbackDialog'
import InvoiceDocumentFields, {
  type InvoiceOriginalOption,
} from '@/components/invoices/InvoiceDocumentFields'
import { ensureInvoiceDocumentColumns } from '@/lib/invoices/ensure-columns'
import {
  defaultRectificationObservations,
  defaultRectificationReason,
  asAmount,
  normalizeInvoiceDocument,
  numberMatchesDocumentType,
  pdfDocumentFields,
  type DocumentType,
} from '@/lib/invoices/document'

interface Service {
  description: string
  quantity: number
  price: number | string
  tax: number
  total: number
}

interface Contact {
  id: number
  nombre: string | null
  email: string | null
  empresa: string | null
  direccion_fiscal: string | null
  cif: string | null
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch (error) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  try {
    const contacts = await prisma.contact.findMany({
      select: {
        id: true,
        nombre: true,
        email: true,
        empresa: true,
        direccion_fiscal: true,
        cif: true,
      },
      orderBy: { nombre: 'asc' },
    })

    await ensureInvoiceDocumentColumns()
    const [nextInvoice, nextCredit, nextProforma, nextQuote, originalRows] = await Promise.all([
      getNextDocumentNumber('invoice'),
      getNextDocumentNumber('credit_note'),
      getNextDocumentNumber('proforma'),
      getNextDocumentNumber('quote'),
      prisma.invoice.findMany({
        where: {
          deleted_at: null,
          status: 'sent',
          document_type: 'invoice',
          invoice_source: { not: 'developer' },
        },
        select: {
          id: true,
          invoice_number: true,
          client_name: true,
          issue_date: true,
          total: true,
        },
        orderBy: { issue_date: 'desc' },
        take: 200,
      }),
    ])

    const originals = originalRows.map((invoice) => ({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      client_name: invoice.client_name,
      issue_date: invoice.issue_date.toISOString(),
      total: Number(invoice.total),
    }))

    let prefill: Record<string, unknown> | null = null
    let rectificaError = ''
    const rectificaRaw = context.query.rectifica
    const rectificaId = typeof rectificaRaw === 'string' ? parseInt(rectificaRaw, 10) : NaN
    if (Number.isFinite(rectificaId) && rectificaId > 0) {
      const original = await prisma.invoice.findUnique({ where: { id: rectificaId } })
      if (
        !original ||
        original.deleted_at ||
        original.status !== 'sent' ||
        original.document_type !== 'invoice' ||
        original.invoice_source === 'developer'
      ) {
        rectificaError =
          'Solo se puede crear una rectificativa de una factura de cliente ya emitida. La original no se toca.'
      } else {
        const sourceLines = Array.isArray(original.services) ? (original.services as unknown as Service[]) : []
        const dateLabel = format(original.issue_date, 'dd/MM/yyyy')
        prefill = {
          invoice_number: nextCredit,
          client_name: original.client_name,
          client_company_name: original.client_company_name || '',
          client_address: original.client_address || '',
          client_email: original.client_email || '',
          client_tax_id: original.client_tax_id || '',
          document_type: 'credit_note',
          document_title: '',
          observations: defaultRectificationObservations(original.invoice_number, dateLabel),
          rectifies_invoice_id: original.id,
          rectification_reason: defaultRectificationReason(),
          show_payment_info: false,
          services: sourceLines.map((service) => ({
            description: service.description || '',
            quantity: Number(service.quantity) || 1,
            price: -Math.abs(Number(service.price) || 0),
            tax: Number(service.tax ?? 21),
            total: 0,
          })),
        }
      }
    }

    return {
      props: {
        contacts,
        nextNumbers: {
          invoice: nextInvoice,
          credit_note: nextCredit,
          proforma: nextProforma,
          quote: nextQuote,
        },
        originals,
        prefill,
        rectificaError,
      },
    }
  } catch (error: any) {
    // Si hay error de BD, redirigir a lista de facturas
    if (error?.message?.includes('does not exist') || error?.code === 'P2021') {
      return {
        redirect: {
          destination: '/invoices',
          permanent: false,
        },
      }
    }

    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }
}

interface NewInvoiceProps {
  contacts: Contact[]
  nextNumbers: Record<DocumentType, string>
  originals: InvoiceOriginalOption[]
  prefill: {
    invoice_number: string
    client_name: string
    client_company_name: string
    client_address: string
    client_email: string
    client_tax_id: string
    document_type: DocumentType
    document_title: string
    observations: string
    rectifies_invoice_id: number
    rectification_reason: string
    show_payment_info: boolean
    services: Service[]
  } | null
  rectificaError: string
}

export default function NewInvoice({
  contacts,
  nextNumbers,
  originals,
  prefill,
  rectificaError,
}: NewInvoiceProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<{
    open: boolean
    variant: 'success' | 'error'
    title: string
    description?: string
    confirmLabel?: string
    nextHref?: string | null
  }>({ open: false, variant: 'success', title: '' })
  const [onboardingLeadId, setOnboardingLeadId] = useState<number | null>(null)
  const [onboardingLabel, setOnboardingLabel] = useState('')
  const invoicePreviewRef = useRef<HTMLDivElement>(null)

  const [formData, setFormData] = useState({
    invoice_number: prefill?.invoice_number || nextNumbers.invoice,
    client_name: prefill?.client_name || '',
    client_company_name: prefill?.client_company_name || '',
    client_address: prefill?.client_address || '',
    client_email: prefill?.client_email || '',
    client_tax_id: prefill?.client_tax_id || '',
    company_name: 'BUFFALO AI',
    company_address: 'C/ Provença 474, esc B, entr. 2ª, Barcelona (08025), Barcelona, España',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
    status: 'draft' as 'draft' | 'sent' | 'cancelled',
    document_type: (prefill?.document_type || 'invoice') as DocumentType,
    document_title: prefill?.document_title || '',
    observations: prefill?.observations || '',
    rectifies_invoice_id: prefill?.rectifies_invoice_id ?? null,
    rectification_reason: prefill?.rectification_reason || '',
    show_payment_info: prefill?.show_payment_info ?? true,
    payment_method: '',
    bank_name: '',
    bank_account_holder: '',
    iban: '',
    payment_instructions: '',
  })

  const [services, setServices] = useState<Service[]>(
    prefill?.services?.length
      ? prefill.services
      : [{ description: '', quantity: 1, price: 0, tax: 21, total: 0 }]
  )

  // Prefill + track desde onboarding (?lead=)
  useEffect(() => {
    if (!router.isReady) return
    const leadId = Number(router.query.lead)
    if (!Number.isFinite(leadId) || leadId <= 0) return

    let cancelled = false
    setOnboardingLeadId(leadId)

    ;(async () => {
      try {
        const res = await fetch(`/api/onboarding/projects/${leadId}`)
        const data = await res.json()
        if (!res.ok || cancelled) return

        const contact = data.lead?.contact
        const proyecto = data.proyecto
        const name =
          proyecto?.name ||
          contact?.empresa ||
          contact?.nombre ||
          `Lead #${leadId}`
        setOnboardingLabel(name)

        setFormData((prev) => ({
          ...prev,
          client_name: contact?.nombre || contact?.empresa || prev.client_name,
          client_company_name: contact?.empresa || prev.client_company_name,
          client_email: contact?.email || prev.client_email,
          client_address: contact?.direccion_fiscal || prev.client_address,
          client_tax_id: contact?.cif || prev.client_tax_id,
        }))

        const setup =
          proyecto?.setup_fee_eur != null
            ? Number(proyecto.setup_fee_eur)
            : data.lead?.valor != null
              ? Number(data.lead.valor)
              : 0
        const monthly =
          proyecto?.monthly_fee_eur != null ? Number(proyecto.monthly_fee_eur) : 0

        const lines: Service[] = []
        if (setup > 0) {
          const lineSubtotal = setup
          const tax = 21
          lines.push({
            description: `${name} — Setup`,
            quantity: 1,
            price: setup,
            tax,
            total: lineSubtotal + lineSubtotal * (tax / 100),
          })
        }
        if (monthly > 0) {
          const lineSubtotal = monthly
          const tax = 21
          lines.push({
            description: `${name} — Mensualidad`,
            quantity: 1,
            price: monthly,
            tax,
            total: lineSubtotal + lineSubtotal * (tax / 100),
          })
        }
        if (lines.length) setServices(lines)
      } catch {
        /* best-effort prefill */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router.isReady, router.query.lead])

  const addService = () => {
    setServices([...services, { description: '', quantity: 1, price: 0, tax: 21, total: 0 }])
  }

  const removeService = (index: number) => {
    if (services.length > 1) {
      setServices(services.filter((_, i) => i !== index))
    }
  }

  const updateService = (index: number, field: string, value: any) => {
    const newServices = [...services]
    newServices[index] = { ...newServices[index], [field]: value }
    
    // Calcular total de la línea
    if (field === 'quantity' || field === 'price' || field === 'tax') {
      const qty = field === 'quantity' ? parseFloat(value) || 0 : asAmount(newServices[index].quantity)
      const price = field === 'price' ? parseFloat(value) || 0 : asAmount(newServices[index].price)
      const tax = field === 'tax' ? parseFloat(value) || 21 : newServices[index].tax
      const subtotal = qty * price
      const taxAmount = subtotal * (tax / 100)
      newServices[index].total = subtotal + taxAmount
    }
    
    setServices(newServices)
  }

  const selectContact = (contactId: string) => {
    if (contactId === 'none') return

    const contact = contacts.find((c) => c.id === parseInt(contactId))
    if (contact) {
      setFormData({
        ...formData,
        client_name: contact.nombre || contact.empresa || '',
        client_address: contact.direccion_fiscal || '',
        client_tax_id: contact.cif || '',
        client_email: contact.email || '',
      })
    }
  }

  const suggestedNumber = nextNumbers[formData.document_type]

  const numericServices = services.map((service) => ({
    ...service,
    quantity: Number(service.quantity) || 0,
    price: Number(service.price),
    tax: Number(service.tax),
  }))

  const calculateTotals = () => {
    let subtotal = 0
    let iva = 0

    numericServices.forEach((service) => {
      if (!Number.isFinite(service.price)) return
      const lineSubtotal = asAmount(service.quantity) * asAmount(service.price)
      const lineIva = lineSubtotal * (service.tax / 100)
      subtotal += lineSubtotal
      iva += lineIva
    })

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      total: Math.round((subtotal + iva) * 100) / 100,
    }
  }

  const handleDocumentChange = (patch: Partial<typeof formData>) => {
    setFormData((prev) => {
      if (!patch.document_type || patch.document_type === prev.document_type) {
        return { ...prev, ...patch }
      }
      const keepNumber = numberMatchesDocumentType(prev.invoice_number, patch.document_type)
      return {
        ...prev,
        ...patch,
        invoice_number: keepNumber ? prev.invoice_number : nextNumbers[patch.document_type],
        show_payment_info:
          patch.document_type === 'credit_note' ? false : prev.show_payment_info,
        rectifies_invoice_id:
          patch.document_type === 'credit_note' ? prev.rectifies_invoice_id : null,
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const checked = normalizeInvoiceDocument({
      ...formData,
      services: numericServices,
    })
    if (!checked.ok) {
      setError(checked.error)
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          invoice_number: formData.invoice_number || suggestedNumber,
          services: checked.value.services,
          subtotal: checked.value.subtotal,
          iva: checked.value.iva,
          total: checked.value.total,
          document_type: checked.value.document_type,
          document_title: checked.value.document_title,
          observations: checked.value.observations,
          rectifies_invoice_id: checked.value.rectifies_invoice_id,
          rectification_reason: checked.value.rectification_reason,
          show_payment_info: checked.value.show_payment_info,
          status: checked.value.status,
          ...(onboardingLeadId ? { lead_id: onboardingLeadId } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Error al crear factura' }))
        setError(data.error || 'Error al crear factura')
        setLoading(false)
        return
      }

      const data = await res.json()
      setLoading(false)
      setFeedback({
        open: true,
        variant: 'success',
        title: 'Factura guardada',
        description: `${data.invoice_number || formData.invoice_number || suggestedNumber} se ha guardado correctamente.`,
        confirmLabel: 'Abrir factura',
        nextHref: `/invoices/${data.id}/edit`,
      })
    } catch (err) {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  const totals = calculateTotals()
  const linkedOriginal = originals.find((item) => item.id === formData.rectifies_invoice_id)
  const pdfExtras = pdfDocumentFields({
    document_type: formData.document_type,
    document_title: formData.document_title,
    observations: formData.observations,
    rectification_reason: formData.rectification_reason,
    show_payment_info: formData.show_payment_info,
    payment_method: formData.payment_method,
    bank_name: formData.bank_name,
    bank_account_holder: formData.bank_account_holder,
    iban: formData.iban,
    payment_instructions: formData.payment_instructions,
    rectifiesNumber: linkedOriginal?.invoice_number,
    rectifiesDateLabel: linkedOriginal
      ? format(new Date(linkedOriginal.issue_date), 'dd/MM/yyyy')
      : undefined,
  })

  // Función para descargar PDF usando @react-pdf/renderer
  const handleDownloadPDF = async () => {
    try {
      // Importar react-pdf dinámicamente
      const { pdf } = await import('@react-pdf/renderer')
      const { InvoicePDF } = await import('@/components/InvoicePDF')

      // Preparar servicios con totales
      const servicesWithTotals = services.map(service => ({
        description: service.description,
        quantity: asAmount(service.quantity),
        price: asAmount(service.price),
        tax: service.tax,
        total: asAmount(service.quantity) * asAmount(service.price) * (1 + (service.tax || 0) / 100),
      }))

      // Crear el documento PDF
      const doc = (
        <InvoicePDF
          invoiceNumber={formData.invoice_number || suggestedNumber}
          clientName={formData.client_name || ''}
          clientCompanyName={formData.client_company_name || undefined}
          clientEmail={formData.client_email || undefined}
          clientAddress={formData.client_address || undefined}
          clientTaxId={formData.client_tax_id || undefined}
          companyName="BUFFALO AI"
          companyAddress={formData.company_address || undefined}
          issueDate={formData.issue_date}
          dueDate={formData.due_date || undefined}
          services={servicesWithTotals}
          subtotal={totals.subtotal}
          iva={totals.iva}
          total={totals.total}
          {...pdfExtras}
        />
      )

      // Generar y descargar el PDF
      const blob = await pdf(doc).toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `factura-${formData.invoice_number || suggestedNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error al generar PDF:', error)
      setFeedback({
        open: true,
        variant: 'error',
        title: 'No se pudo generar el PDF',
        description: 'Inténtalo de nuevo en unos segundos.',
        confirmLabel: 'Entendido',
      })
    }
  }

  // Preparar servicios con totales para la vista previa
  const servicesWithTotals = services.map((service) => {
    const lineSubtotal = asAmount(service.quantity) * asAmount(service.price)
    const lineIva = lineSubtotal * (service.tax / 100)
    return {
      description: service.description,
      quantity: asAmount(service.quantity),
      price: asAmount(service.price),
      tax: service.tax,
      total: lineSubtotal + lineIva,
    }
  })

  return (
    <FullScreenLayout>
      <div className="flex h-full min-h-0 flex-col bg-zinc-100/90">
        <header className="shrink-0 px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-zinc-200/80 bg-white px-3 py-2.5 shadow-sm sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <Link href="/invoices">
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-semibold tracking-tight text-zinc-900">
                  {formData.document_type === 'credit_note' ? 'Nueva factura rectificativa' : 'Nueva factura'}
                  <span className="ml-2 font-medium text-zinc-500">
                    {formData.invoice_number || suggestedNumber}
                  </span>
                </h1>
                {onboardingLeadId && (
                  <p className="mt-0.5 truncate text-[11px] text-emerald-700">
                    Onboarding · {onboardingLabel || `Lead #${onboardingLeadId}`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadPDF}
                disabled={!formData.client_name || services.some((s) => !s.description)}
                className="rounded-full"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                PDF
              </Button>
              <Link href="/invoices">
                <Button type="button" variant="ghost" size="sm" disabled={loading} className="rounded-full">
                  Cancelar
                </Button>
              </Link>
              <Button
                type="button"
                size="sm"
                disabled={loading}
                className="rounded-full"
                onClick={() => {
                  const form = document.getElementById('invoice-create-form') as HTMLFormElement | null
                  form?.requestSubmit()
                }}
              >
                {loading ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="hide-scrollbar min-h-0 overflow-y-auto overscroll-contain rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:p-5">
            <form id="invoice-create-form" onSubmit={handleSubmit} className="space-y-5 pb-8">
              {rectificaError && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {rectificaError}
                </div>
              )}
              <InvoiceDocumentFields
                values={formData}
                originals={originals}
                disabled={loading}
                onChange={handleDocumentChange}
              />
              {/* Cliente - Estilo minimalista */}
              <Card className="rounded-2xl border border-zinc-200 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Datos del Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact_select">Seleccionar Contacto (Opcional)</Label>
                <select
                  id="contact_select"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2"
                  onChange={(e) => selectContact(e.target.value)}
                  defaultValue="none"
                >
                  <option value="none">Sin contacto</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.nombre || contact.empresa || contact.email || `Contacto #${contact.id}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_name">Nombre Cliente *</Label>
                <Input
                  id="client_name"
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  required
                  disabled={loading}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_company_name">Nombre de la Empresa</Label>
                <Input
                  id="client_company_name"
                  value={formData.client_company_name}
                  onChange={(e) => setFormData({ ...formData, client_company_name: e.target.value })}
                  disabled={loading}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_address">Dirección</Label>
                <Textarea
                  id="client_address"
                  value={formData.client_address}
                  onChange={(e) => setFormData({ ...formData, client_address: e.target.value })}
                  rows={2}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_email">Email</Label>
                <Input
                  id="client_email"
                  type="email"
                  value={formData.client_email}
                  onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_tax_id">CIF/NIF</Label>
                <Input
                  id="client_tax_id"
                  value={formData.client_tax_id}
                  onChange={(e) => setFormData({ ...formData, client_tax_id: e.target.value })}
                  disabled={loading}
                />
              </div>
            </CardContent>
              </Card>

              {/* Servicios - Estilo minimalista */}
              <Card className="rounded-2xl border border-zinc-200 shadow-none">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Servicios / Productos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {services.map((service, index) => (
                <div key={index} className="space-y-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Descripción *</Label>
                    <Input
                      value={service.description}
                      onChange={(e) => updateService(index, 'description', e.target.value)}
                      placeholder="Descripción del servicio"
                      required
                      disabled={loading}
                      className="w-full"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Cantidad *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={service.quantity}
                        onChange={(e) => updateService(index, 'quantity', parseFloat(e.target.value) || 0)}
                        required
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Precio Unit. *</Label>
                      <Input
                        inputMode="decimal"
                        value={service.price}
                        onChange={(e) => {
                          const raw = e.target.value.replace(',', '.')
                          if (!/^-?\d*\.?\d*$/.test(raw)) return
                          updateService(index, 'price', raw)
                        }}
                        required
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">IVA %</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={service.tax}
                        onChange={(e) => updateService(index, 'tax', parseFloat(e.target.value) || 21)}
                        disabled={loading}
                      />
                    </div>
                  </div>
                  {services.length > 1 && (
                    <div className="flex justify-end pt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeService(index)}
                        disabled={loading}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={addService} disabled={loading}>
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar Servicio
                </Button>
                {formData.document_type === 'credit_note' && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading}
                    onClick={() =>
                      setServices((current) =>
                        current.map((service) => ({
                          ...service,
                          price: -Math.abs(Number(service.price) || 0),
                        }))
                      )
                    }
                  >
                    Poner importes en negativo
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

              {/* Totales y Fechas - Estilo minimalista */}
              <Card className="rounded-2xl border border-zinc-200 shadow-none">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Resumen y Fechas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoice_number">Número de Factura</Label>
                <Input
                  id="invoice_number"
                  value={formData.invoice_number}
                  onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                  placeholder={suggestedNumber}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500">Por defecto: {suggestedNumber}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="issue_date">Fecha Emisión *</Label>
                  <Input
                    id="issue_date"
                    type="date"
                    value={formData.issue_date}
                    onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due_date">Fecha Vencimiento</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Estado de la Factura</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: 'draft' | 'sent' | 'cancelled') =>
                    setFormData({ ...formData, status: value })
                  }
                  disabled={loading}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="sent">Emitida / Enviada</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-4 mt-4">
                <div className="flex justify-end">
                  <div className="w-full max-w-sm bg-gray-50 rounded-lg border border-gray-200 p-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Subtotal:</span>
                        <span className="text-sm font-medium text-gray-900">
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                            minimumFractionDigits: 2,
                          }).format(totals.subtotal)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">IVA:</span>
                        <span className="text-sm font-medium text-gray-900">
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                            minimumFractionDigits: 2,
                          }).format(totals.iva)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-2 mt-2 border-t">
                        <span className="text-base font-semibold text-gray-900">Total:</span>
                        <span className="text-lg font-bold text-gray-900">
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                            minimumFractionDigits: 2,
                          }).format(totals.total)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2 lg:hidden">
                <Link href="/invoices">
                  <Button type="button" variant="outline" disabled={loading} className="rounded-full">
                    Cancelar
                  </Button>
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadPDF}
                  disabled={!formData.client_name || services.some((s) => !s.description)}
                  className="rounded-full"
                >
                  <Download className="mr-2 h-4 w-4" />
                  PDF
                </Button>
                <Button type="submit" disabled={loading} className="rounded-full">
                  {loading ? 'Guardando...' : 'Guardar Factura'}
                </Button>
              </div>
            </form>
          </div>

          <div className="hide-scrollbar flex min-h-0 justify-center overflow-y-auto overscroll-contain rounded-3xl border border-zinc-200/70 bg-zinc-200/50 p-4 sm:p-6">
            <div className="w-full max-w-[210mm] pb-8">
              <div
                ref={invoicePreviewRef}
                className="overflow-hidden rounded-2xl bg-white shadow-md"
                style={{ width: '100%', maxWidth: '210mm', minHeight: '297mm' }}
              >
                <InvoicePreview
                  invoiceNumber={formData.invoice_number || suggestedNumber}
                  clientName={formData.client_name || 'Nombre del Cliente'}
                  clientCompanyName={formData.client_company_name || undefined}
                  clientEmail={formData.client_email || undefined}
                  clientAddress={formData.client_address || undefined}
                  clientTaxId={formData.client_tax_id || undefined}
                  companyName={formData.company_name}
                  companyAddress={formData.company_address}
                  issueDate={formData.issue_date}
                  dueDate={formData.due_date || undefined}
                  services={servicesWithTotals}
                  subtotal={totals.subtotal}
                  iva={totals.iva}
                  total={totals.total}
                  status={formData.status}
                  {...pdfExtras}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <InvoiceFeedbackDialog
        open={feedback.open}
        onOpenChange={(open) => setFeedback((prev) => ({ ...prev, open }))}
        title={feedback.title}
        description={feedback.description}
        variant={feedback.variant}
        confirmLabel={feedback.confirmLabel}
        onConfirm={() => {
          if (feedback.nextHref) {
            router.push(feedback.nextHref)
          }
        }}
      />
    </FullScreenLayout>
  )
}

