import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
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
import { useRef } from 'react'
import { getNextDocumentNumber } from '@/lib/invoices/numbers'
import InvoiceFeedbackDialog from '@/components/invoices/InvoiceFeedbackDialog'
import InvoiceDocumentFields, {
  type InvoiceOriginalOption,
} from '@/components/invoices/InvoiceDocumentFields'
import { ensureInvoiceDocumentColumns } from '@/lib/invoices/ensure-columns'
import {
  asAmount,
  asDocumentType,
  isIssuedStatus,
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

interface RelatedInvoice {
  id: number
  invoice_number: string
  issue_date: string
  status: string
  total: number
}

interface EditInvoiceProps {
  invoice: {
    id: number
    invoice_number: string
    status: string
    client_name: string
    client_email: string | null
    client_address: string | null
    client_tax_id: string | null
    company_address: string | null
    issue_date: string
    due_date: string | null
    services: Service[]
    document_type?: string | null
    document_title?: string | null
    observations?: string | null
    rectifies_invoice_id?: number | null
    rectification_reason?: string | null
    show_payment_info?: boolean | null
    payment_method?: string | null
    bank_name?: string | null
    bank_account_holder?: string | null
    iban?: string | null
    payment_instructions?: string | null
    invoice_source?: string | null
  }
  nextNumbers: Record<DocumentType, string>
  originals: InvoiceOriginalOption[]
  rectifications: RelatedInvoice[]
  rectifies: { id: number; invoice_number: string; issue_date: string } | null
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
    const id = parseInt(context.params?.id as string)
    await ensureInvoiceDocumentColumns()

    const invoice = await prisma.invoice.findUnique({
      where: { id, deleted_at: null },
    })

    if (!invoice) {
      return {
        notFound: true,
      }
    }

    await ensureInvoiceDocumentColumns()
    const [nextInvoice, nextCredit, nextProforma, nextQuote, originalRows, rectificationRows, rectifiesRow] =
      await Promise.all([
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
        prisma.invoice.findMany({
          where: { rectifies_invoice_id: id, deleted_at: null },
          select: {
            id: true,
            invoice_number: true,
            issue_date: true,
            status: true,
            total: true,
          },
          orderBy: { issue_date: 'desc' },
        }),
        invoice.rectifies_invoice_id
          ? prisma.invoice.findUnique({
              where: { id: invoice.rectifies_invoice_id },
              select: { id: true, invoice_number: true, issue_date: true },
            })
          : Promise.resolve(null),
      ])

    return {
      props: {
        invoice: {
          ...invoice,
          subtotal: Number(invoice.subtotal),
          iva: Number(invoice.iva),
          total: Number(invoice.total),
          issue_date: invoice.issue_date.toISOString().split('T')[0],
          due_date: invoice.due_date?.toISOString().split('T')[0] || null,
          services: (invoice.services as any) || [],
          created_at: invoice.created_at.toISOString(),
          updated_at: invoice.updated_at.toISOString(),
          deleted_at: invoice.deleted_at?.toISOString() || null,
        },
        nextNumbers: {
          invoice: nextInvoice,
          credit_note: nextCredit,
          proforma: nextProforma,
          quote: nextQuote,
        },
        originals: originalRows.map((row) => ({
          id: row.id,
          invoice_number: row.invoice_number,
          client_name: row.client_name,
          issue_date: row.issue_date.toISOString(),
          total: Number(row.total),
        })),
        rectifications: rectificationRows.map((row) => ({
          id: row.id,
          invoice_number: row.invoice_number,
          issue_date: row.issue_date.toISOString(),
          status: row.status,
          total: Number(row.total),
        })),
        rectifies: rectifiesRow
          ? {
              id: rectifiesRow.id,
              invoice_number: rectifiesRow.invoice_number,
              issue_date: rectifiesRow.issue_date.toISOString(),
            }
          : null,
      },
    }
  } catch (error: any) {
    // Si la tabla no existe, redirigir a la lista
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

export default function EditInvoice({
  invoice,
  nextNumbers,
  originals,
  rectifications,
  rectifies,
}: EditInvoiceProps) {
  const locked = isIssuedStatus(invoice.status)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<{
    open: boolean
    variant: 'success' | 'error'
    title: string
    description?: string
    confirmLabel?: string
  }>({ open: false, variant: 'success', title: '' })

  const [formData, setFormData] = useState({
    invoice_number: invoice.invoice_number,
    client_name: invoice.client_name,
    client_company_name: (invoice as any).client_company_name || '',
    client_address: invoice.client_address || '',
    client_email: invoice.client_email || '',
    client_tax_id: invoice.client_tax_id || '',
    company_name: (invoice as any).company_name || 'BUFFALO AI',
    company_address: (invoice as any).company_address || 'C/ Provença 474, esc B, entr. 2ª, Barcelona (08025), Barcelona, España',
    issue_date: invoice.issue_date,
    due_date: invoice.due_date || '',
    status: invoice.status as 'draft' | 'sent' | 'cancelled',
    document_type: asDocumentType(invoice.document_type),
    document_title: invoice.document_title || '',
    observations: invoice.observations || '',
    rectifies_invoice_id: invoice.rectifies_invoice_id ?? null,
    rectification_reason: invoice.rectification_reason || '',
    show_payment_info: invoice.show_payment_info !== false,
    payment_method: invoice.payment_method || '',
    bank_name: invoice.bank_name || '',
    bank_account_holder: invoice.bank_account_holder || '',
    iban: invoice.iban || '',
    payment_instructions: invoice.payment_instructions || '',
  })
  const suggestedNumber = nextNumbers[formData.document_type]
  const fieldDisabled = loading || locked

  const [services, setServices] = useState<Service[]>(invoice.services)
  const invoicePreviewRef = useRef<HTMLDivElement>(null)

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

  const calculateTotals = () => {
    let subtotal = 0
    let iva = 0

    services.forEach((service) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (locked) {
      setError('Esta factura ya está emitida y no se modifica.')
      setLoading(false)
      return
    }

    const checked = normalizeInvoiceDocument({
      ...formData,
      services: services.map((service) => ({
        ...service,
        quantity: Number(service.quantity) || 0,
        price: Number(service.price),
        tax: Number(service.tax),
      })),
    })
    if (!checked.ok) {
      setError(checked.error)
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
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
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Error al actualizar factura' }))
        setError(data.error || 'Error al actualizar factura')
        setLoading(false)
        return
      }

      setFeedback({
        open: true,
        variant: 'success',
        title: 'Factura guardada',
        description: `${formData.invoice_number || suggestedNumber} se ha actualizado correctamente.`,
        confirmLabel: 'Entendido',
      })
      setLoading(false)
    } catch (err) {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  const totals = calculateTotals()
  const linkedOriginal = originals.find((item) => item.id === formData.rectifies_invoice_id) || rectifies
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
      const servicesWithTotals = services
        .filter((s) => s.description)
        .map((service) => ({
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
          clientName={formData.client_name}
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

  // Auto-descargar si viene el parámetro download
  useEffect(() => {
    if (typeof window !== 'undefined' && router.query.download === 'true') {
      const timer = setTimeout(() => {
        handleDownloadPDF()
        // Limpiar el parámetro de la URL sin recargar
        router.replace(`/invoices/${invoice.id}/edit`, undefined, { shallow: true })
      }, 1500)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.download, invoice.id])

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
                  {locked ? 'Factura emitida' : 'Editar factura'}
                  <span className="ml-2 font-medium text-zinc-500">
                    {formData.invoice_number || suggestedNumber}
                  </span>
                </h1>
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
              {locked && asDocumentType(invoice.document_type) === 'invoice' && invoice.invoice_source !== 'developer' && (
                <Link href={`/invoices/new?rectifica=${invoice.id}`}>
                  <Button type="button" size="sm" className="rounded-full">
                    Crear rectificativa
                  </Button>
                </Link>
              )}
              {!locked && (
                <Button
                  type="button"
                  size="sm"
                  disabled={loading}
                  className="rounded-full"
                  onClick={() => {
                    const form = document.getElementById('invoice-edit-form') as HTMLFormElement | null
                    form?.requestSubmit()
                  }}
                >
                  {loading ? 'Guardando…' : 'Guardar'}
                </Button>
              )}
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="hide-scrollbar min-h-0 overflow-y-auto overscroll-contain rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:p-5">
            <form id="invoice-edit-form" onSubmit={handleSubmit} className="space-y-5 pb-8">
              {locked && (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                  Esta factura ya está emitida. No se modifica ni se elimina. Si hay que corregirla, crea una factura rectificativa: el original se queda igual.
                </div>
              )}
              {rectifies && (
                <p className="text-sm text-zinc-600">
                  Rectifica a{' '}
                  <Link href={`/invoices/${rectifies.id}/edit`} className="font-medium underline">
                    {rectifies.invoice_number}
                  </Link>
                  {' '}del {format(new Date(rectifies.issue_date), 'dd/MM/yyyy')}.
                </p>
              )}
              {rectifications.length > 0 && (
                <div className="rounded-2xl border border-zinc-200 p-3 text-sm">
                  <p className="font-medium text-zinc-900">Rectificativas</p>
                  <ul className="mt-2 space-y-1">
                    {rectifications.map((item) => (
                      <li key={item.id}>
                        <Link href={`/invoices/${item.id}/edit`} className="underline">
                          {item.invoice_number}
                        </Link>
                        {' · '}
                        {format(new Date(item.issue_date), 'dd/MM/yyyy')}
                        {' · '}
                        {item.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <InvoiceDocumentFields
                values={formData}
                originals={originals}
                disabled={fieldDisabled}
                onChange={(patch) => {
                  setFormData((prev) => {
                    if (!patch.document_type || patch.document_type === prev.document_type) {
                      return { ...prev, ...patch }
                    }
                    const keepNumber = numberMatchesDocumentType(prev.invoice_number, patch.document_type)
                    return {
                      ...prev,
                      ...patch,
                      invoice_number: keepNumber ? prev.invoice_number : nextNumbers[patch.document_type],
                      show_payment_info: patch.document_type === 'credit_note' ? false : prev.show_payment_info,
                      rectifies_invoice_id: patch.document_type === 'credit_note' ? prev.rectifies_invoice_id : null,
                    }
                  })
                }}
              />
          {/* Cliente - Estilo minimalista */}
          <Card className="rounded-2xl border border-zinc-200 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Datos del Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client_name">Nombre Cliente *</Label>
                <Input
                  id="client_name"
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  required
                  disabled={fieldDisabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_company_name">Nombre de la Empresa</Label>
                <Input
                  id="client_company_name"
                  value={formData.client_company_name}
                  onChange={(e) => setFormData({ ...formData, client_company_name: e.target.value })}
                  disabled={fieldDisabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_address">Dirección</Label>
                <Textarea
                  id="client_address"
                  value={formData.client_address}
                  onChange={(e) => setFormData({ ...formData, client_address: e.target.value })}
                  rows={2}
                  disabled={fieldDisabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_email">Email</Label>
                <Input
                  id="client_email"
                  type="email"
                  value={formData.client_email}
                  onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                  disabled={fieldDisabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_tax_id">CIF/NIF</Label>
                <Input
                  id="client_tax_id"
                  value={formData.client_tax_id}
                  onChange={(e) => setFormData({ ...formData, client_tax_id: e.target.value })}
                  disabled={fieldDisabled}
                />
              </div>
            </CardContent>
          </Card>

          {/* Servicios - Estilo minimalista */}
          <Card className="rounded-2xl border border-zinc-200 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Servicios / Productos</CardTitle>
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
                      disabled={fieldDisabled}
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
                        disabled={fieldDisabled}
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
                        disabled={fieldDisabled}
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
                        disabled={fieldDisabled}
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
                        disabled={fieldDisabled}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addService} disabled={fieldDisabled}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Servicio
              </Button>
            </CardContent>
          </Card>

          {/* Totales y Fechas - Estilo minimalista */}
          <Card className="rounded-2xl border border-zinc-200 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Resumen y Fechas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoice_number">Número de Factura</Label>
                <Input
                  id="invoice_number"
                  value={formData.invoice_number}
                  onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                  placeholder={suggestedNumber}
                  disabled={fieldDisabled}
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
                    disabled={fieldDisabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due_date">Fecha Vencimiento</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    disabled={fieldDisabled}
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
                  disabled={fieldDisabled}
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
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 border border-red-200">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2 lg:hidden">
                <Link href="/invoices">
                  <Button type="button" variant="outline" disabled={fieldDisabled} className="rounded-full">
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
                {!locked && (
                  <Button type="submit" disabled={loading} className="rounded-full">
                    {loading ? 'Guardando...' : 'Guardar Cambios'}
                  </Button>
                )}
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
                  clientName={formData.client_name}
                  clientCompanyName={formData.client_company_name || undefined}
                  clientEmail={formData.client_email || undefined}
                  clientAddress={formData.client_address || undefined}
                  clientTaxId={formData.client_tax_id || undefined}
                  companyName={formData.company_name}
                  companyAddress={formData.company_address}
                  issueDate={formData.issue_date}
                  dueDate={formData.due_date || undefined}
                  services={servicesWithTotals.filter((s) => s.description)}
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
      />
    </FullScreenLayout>
  )
}

