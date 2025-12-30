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
import InvoicePreview from '@/components/InvoicePreview'
import { useRef } from 'react'

interface Service {
  description: string
  quantity: number
  price: number
  tax: number
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
  }
  nextInvoiceNumber: string
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

    const invoice = await prisma.invoice.findUnique({
      where: { id, deleted_at: null },
    })

    if (!invoice) {
      return {
        notFound: true,
      }
    }

    // Calcular el siguiente número de factura basándose en borradores
    const year = new Date().getFullYear()
    const lastDraftInvoice = await prisma.invoice.findFirst({
      where: {
        status: 'draft',
        deleted_at: null,
        invoice_number: {
          startsWith: `BUF-${year}-`,
        },
      },
      orderBy: {
        invoice_number: 'desc',
      },
    })

    let nextInvoiceNumber = `BUF-${year}-0001`
    if (lastDraftInvoice) {
      const parts = lastDraftInvoice.invoice_number.split('-')
      if (parts.length >= 3) {
        const lastNum = parseInt(parts[2] || '0')
        if (!isNaN(lastNum)) {
          nextInvoiceNumber = `BUF-${year}-${String(lastNum + 1).padStart(4, '0')}`
        }
      }
    }

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
        nextInvoiceNumber,
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

export default function EditInvoice({ invoice, nextInvoiceNumber }: EditInvoiceProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
  })

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
      const qty = field === 'quantity' ? parseFloat(value) || 0 : newServices[index].quantity
      const price = field === 'price' ? parseFloat(value) || 0 : newServices[index].price
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
      const lineSubtotal = service.quantity * service.price
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

    if (services.some((s) => !s.description || s.quantity <= 0 || s.price <= 0)) {
      setError('Todos los servicios deben tener descripción, cantidad y precio válidos')
      setLoading(false)
      return
    }

    const totals = calculateTotals()
    const servicesWithTotals = services.map((service) => {
      const lineSubtotal = service.quantity * service.price
      const lineIva = lineSubtotal * (service.tax / 100)
      return {
        description: service.description,
        quantity: service.quantity,
        price: service.price,
        tax: service.tax,
        total: lineSubtotal + lineIva,
      }
    })

    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          invoice_number: formData.invoice_number || nextInvoiceNumber,
          services: servicesWithTotals,
          subtotal: totals.subtotal,
          iva: totals.iva,
          total: totals.total,
          status: formData.status,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Error al actualizar factura' }))
        setError(data.error || 'Error al actualizar factura')
        setLoading(false)
        return
      }

      alert('Factura guardada correctamente')
      setLoading(false)
    } catch (err) {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  const totals = calculateTotals()

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
          ...service,
          total: service.quantity * service.price * (1 + (service.tax || 0) / 100),
        }))

      // Crear el documento PDF
      const doc = (
        <InvoicePDF
          invoiceNumber={formData.invoice_number || nextInvoiceNumber}
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
        />
      )

      // Generar y descargar el PDF
      const blob = await pdf(doc).toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `factura-${formData.invoice_number || nextInvoiceNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error al generar PDF:', error)
      alert('Error al generar el PDF. Por favor, intenta de nuevo.')
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
    const lineSubtotal = service.quantity * service.price
    const lineIva = lineSubtotal * (service.tax / 100)
    return {
      description: service.description,
      quantity: service.quantity,
      price: service.price,
      tax: service.tax,
      total: lineSubtotal + lineIva,
    }
  })

  return (
    <FullScreenLayout>
      <div className="h-full flex flex-col">
        {/* Header fijo */}
        <div className="flex-shrink-0 border-b bg-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/invoices">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Editar Factura</h1>
              <p className="text-sm text-gray-600">{formData.invoice_number || nextInvoiceNumber}</p>
            </div>
          </div>
        </div>

        {/* Contenido principal - Layout: 1/3 formulario, 2/3 vista previa */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-0" style={{ height: 'calc(100vh - 80px)', maxHeight: 'calc(100vh - 80px)' }}>
          {/* Columna izquierda: Formulario */}
          <div className="bg-white hide-scrollbar" style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', padding: '24px', boxSizing: 'border-box' }}>
            <form onSubmit={handleSubmit} className="space-y-6" style={{ paddingBottom: 0 }}>
          {/* Cliente - Estilo minimalista */}
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Datos del Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client_name">Nombre Cliente *</Label>
                <Input
                  id="client_name"
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_company_name">Nombre de la Empresa</Label>
                <Input
                  id="client_company_name"
                  value={formData.client_company_name}
                  onChange={(e) => setFormData({ ...formData, client_company_name: e.target.value })}
                  disabled={loading}
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
          <Card className="border border-gray-200 shadow-sm">
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
                        type="number"
                        step="0.01"
                        min="0"
                        value={service.price}
                        onChange={(e) => updateService(index, 'price', parseFloat(e.target.value) || 0)}
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

              <Button type="button" variant="outline" onClick={addService} disabled={loading}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Servicio
              </Button>
            </CardContent>
          </Card>

          {/* Totales y Fechas - Estilo minimalista */}
          <Card className="border border-gray-200 shadow-sm">
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
                  placeholder={nextInvoiceNumber}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500">Por defecto: {nextInvoiceNumber}</p>
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
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 border border-red-200">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-4 pt-4">
                <Link href="/invoices">
                  <Button type="button" variant="outline" disabled={loading}>
                    Cancelar
                  </Button>
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadPDF}
                  disabled={!formData.client_name || services.some((s) => !s.description)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Descargar PDF
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </div>
            </form>
          </div>

          {/* Columna derecha: Vista Previa - Pantalla completa */}
          <div className="bg-gray-100 hide-scrollbar" style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', padding: '32px', boxSizing: 'border-box', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            <div className="w-full max-w-[210mm]">
              <div className="mb-6 flex items-center justify-end sticky top-0 z-10">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPDF}
                  disabled={!formData.client_name || services.some((s) => !s.description)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Descargar PDF
                </Button>
              </div>
              <div
                ref={invoicePreviewRef}
                className="bg-white shadow-lg rounded-lg overflow-hidden"
                style={{ width: '210mm', minHeight: '297mm' }}
              >
                <InvoicePreview
                  invoiceNumber={formData.invoice_number || nextInvoiceNumber}
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
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </FullScreenLayout>
  )
}

