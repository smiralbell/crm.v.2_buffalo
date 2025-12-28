import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useState, useRef } from 'react'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import FullScreenLayout from '@/components/FullScreenLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Plus, Trash2, Download } from 'lucide-react'
import Link from 'next/link'
import InvoicePreview from '@/components/InvoicePreview'

interface Service {
  description: string
  quantity: number
  price: number
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

    return {
      props: {
        contacts,
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
}

export default function NewInvoice({ contacts }: NewInvoiceProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const invoicePreviewRef = useRef<HTMLDivElement>(null)

  const [formData, setFormData] = useState({
    client_name: '',
    client_email: '',
    client_address: '',
    client_tax_id: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
  })

  const [services, setServices] = useState<Service[]>([
    { description: '', quantity: 1, price: 0, tax: 21, total: 0 },
  ])

  // Generar número de factura temporal para la vista previa
  const getPreviewInvoiceNumber = () => {
    const year = new Date().getFullYear()
    return `BUF-${year}-0000`
  }

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

    // Validar servicios
    if (services.some((s) => !s.description || s.quantity <= 0 || s.price <= 0)) {
      setError('Todos los servicios deben tener descripción, cantidad y precio válidos')
      setLoading(false)
      return
    }

    // Calcular totales y preparar servicios con totales
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
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          services: servicesWithTotals,
          subtotal: totals.subtotal,
          iva: totals.iva,
          total: totals.total,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al crear factura')
        setLoading(false)
        return
      }

      router.push(`/invoices/${data.id}`)
    } catch (err) {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  const totals = calculateTotals()

  // Función para descargar PDF
  const handleDownloadPDF = async () => {
    if (!invoicePreviewRef.current) return

    try {
      // Importar html2pdf solo en el cliente (dinámicamente)
      const html2pdf = (await import('html2pdf.js')).default

      const element = invoicePreviewRef.current
      const opt = {
        margin: 0,
        filename: `factura-${getPreviewInvoiceNumber()}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      }

      await html2pdf().set(opt).from(element).save()
    } catch (error) {
      console.error('Error al generar PDF:', error)
      alert('Error al generar el PDF. Por favor, intenta de nuevo.')
    }
  }

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
        <div className="flex-shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/invoices">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Nueva Factura</h1>
              <p className="text-sm text-gray-600">Crea una nueva factura</p>
            </div>
          </div>
        </div>

        {/* Contenido principal - Layout: 1/3 formulario, 2/3 vista previa */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-0">
          {/* Columna izquierda: Formulario */}
          <div className="overflow-y-auto bg-white p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Cliente */}
              <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Datos del Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact_select">Seleccionar Contacto (Opcional)</Label>
                <select
                  id="contact_select"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
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

              <div className="grid grid-cols-2 gap-4">
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
                  <Label htmlFor="client_email">Email</Label>
                  <Input
                    id="client_email"
                    type="email"
                    value={formData.client_email}
                    onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                    disabled={loading}
                  />
                </div>
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

              {/* Servicios */}
              <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Servicios / Productos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {services.map((service, index) => (
                <div key={index} className="grid grid-cols-12 gap-3 items-end p-4 border rounded-lg">
                  <div className="col-span-5 space-y-2">
                    <Label>Descripción *</Label>
                    <Input
                      value={service.description}
                      onChange={(e) => updateService(index, 'description', e.target.value)}
                      placeholder="Descripción del servicio"
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Cantidad *</Label>
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
                  <div className="col-span-2 space-y-2">
                    <Label>Precio Unit. *</Label>
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
                  <div className="col-span-2 space-y-2">
                    <Label>IVA %</Label>
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
                  <div className="col-span-1">
                    {services.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeService(index)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addService} disabled={loading}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Servicio
              </Button>
            </CardContent>
          </Card>

              {/* Totales y Fechas */}
              <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Resumen y Fechas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
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

              <div className="border-t pt-4">
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-semibold">
                        €{totals.subtotal.toLocaleString('es-ES', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">IVA:</span>
                      <span className="font-semibold">
                        €{totals.iva.toLocaleString('es-ES', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-lg font-bold text-gray-900">TOTAL:</span>
                      <span className="text-lg font-bold text-green-600">
                        €{totals.total.toLocaleString('es-ES', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-4">
                <Link href="/invoices">
                  <Button type="button" variant="outline" disabled={loading}>
                    Cancelar
                  </Button>
                </Link>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Creando...' : 'Crear Factura'}
                </Button>
              </div>
            </form>
          </div>

          {/* Columna derecha: Vista Previa */}
          <div className="overflow-y-auto bg-gray-100 p-6 flex items-start justify-center">
            <div className="w-full max-w-[210mm]">
              <div className="mb-4 flex items-center justify-between sticky top-0 bg-gray-100 z-10 py-2">
                <h3 className="text-lg font-semibold text-gray-900">Vista Previa</h3>
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
                className="bg-white shadow-2xl"
                style={{ width: '210mm', minHeight: '297mm' }}
              >
                <InvoicePreview
                  invoiceNumber={getPreviewInvoiceNumber()}
                  clientName={formData.client_name || 'Nombre del Cliente'}
                  clientEmail={formData.client_email || undefined}
                  clientAddress={formData.client_address || undefined}
                  clientTaxId={formData.client_tax_id || undefined}
                  issueDate={formData.issue_date}
                  dueDate={formData.due_date || undefined}
                  services={servicesWithTotals.filter((s) => s.description)}
                  subtotal={totals.subtotal}
                  iva={totals.iva}
                  total={totals.total}
                  status="draft"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </FullScreenLayout>
  )
}

