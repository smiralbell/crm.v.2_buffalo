import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { ArrowLeft, Edit, FileText, Download } from 'lucide-react'
import { format } from 'date-fns'
import { useRef, useEffect } from 'react'
import InvoicePreview from '@/components/InvoicePreview'

interface Service {
  description: string
  quantity: number
  price: number
  tax: number
  total: number
}

interface InvoiceDetailProps {
  invoice: {
    id: number
    invoice_number: string
    status: string
    client_name: string
    client_address: string | null
    client_tax_id: string | null
    client_email: string | null
    subtotal: number
    iva: number
    total: number
    issue_date: string
    due_date: string | null
    services: Service[]
    pdf_drive_url: string | null
    created_at: string
  }
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

    return {
      props: {
        invoice: {
          ...invoice,
          subtotal: Number(invoice.subtotal),
          iva: Number(invoice.iva),
          total: Number(invoice.total),
          issue_date: invoice.issue_date.toISOString(),
          due_date: invoice.due_date?.toISOString() || null,
          created_at: invoice.created_at.toISOString(),
          updated_at: invoice.updated_at.toISOString(),
          deleted_at: invoice.deleted_at?.toISOString() || null,
          services: (invoice.services as any) || [],
        },
      },
    }
  } catch (error: any) {
    // Si la tabla no existe, redirigir a la lista con mensaje
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

export default function InvoiceDetail({ invoice }: InvoiceDetailProps) {
  const router = useRouter()
  const invoicePreviewRef = useRef<HTMLDivElement>(null)

  // Función para descargar PDF
  const handleDownloadPDF = async () => {
    if (!invoicePreviewRef.current) return

    try {
      // Importar html2pdf solo en el cliente (dinámicamente)
      const html2pdf = (await import('html2pdf.js')).default

      const element = invoicePreviewRef.current
      const opt = {
        margin: 0,
        filename: `factura-${invoice.invoice_number}.pdf`,
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

  // Auto-descargar si viene el parámetro download
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get('download') === 'true') {
        const timer = setTimeout(() => {
          handleDownloadPDF()
          // Limpiar el parámetro de la URL
          router.replace(`/invoices/${invoice.id}`, undefined, { shallow: true })
        }, 1000)
        return () => clearTimeout(timer)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.download, invoice.id])

  const statusLabels: { [key: string]: string } = {
    draft: 'Borrador',
    sent: 'Enviada',
    cancelled: 'Cancelada',
  }

  const statusColors: { [key: string]: string } = {
    draft: 'bg-gray-100 text-gray-800',
    sent: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/invoices">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{invoice.invoice_number}</h1>
              <p className="text-gray-600 mt-1">Detalle de la factura</p>
            </div>
          </div>
          <div className="flex gap-2">
            {invoice.status === 'draft' && (
              <Link href={`/invoices/${invoice.id}/edit`}>
                <Button>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Button>
              </Link>
            )}
            <Button variant="outline" onClick={handleDownloadPDF}>
              <Download className="mr-2 h-4 w-4" />
              Descargar PDF
            </Button>
            {invoice.pdf_drive_url && (
              <a href={invoice.pdf_drive_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  <FileText className="mr-2 h-4 w-4" />
                  Ver PDF Drive
                </Button>
              </a>
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Información General */}
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Información General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Estado</p>
                <div className="mt-1">
                  <Badge className={statusColors[invoice.status] || 'bg-gray-100 text-gray-800'}>
                    {statusLabels[invoice.status] || invoice.status}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Fecha Emisión</p>
                <p className="mt-1">{format(new Date(invoice.issue_date), 'dd MMM yyyy')}</p>
              </div>
              {invoice.due_date && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Fecha Vencimiento</p>
                  <p className="mt-1">{format(new Date(invoice.due_date), 'dd MMM yyyy')}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-500">Total</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  €{invoice.total.toLocaleString('es-ES', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Cliente */}
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-sm font-medium text-gray-500">Nombre</p>
                <p className="mt-1">{invoice.client_name}</p>
              </div>
              {invoice.client_address && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Dirección</p>
                  <p className="mt-1">{invoice.client_address}</p>
                </div>
              )}
              {invoice.client_tax_id && (
                <div>
                  <p className="text-sm font-medium text-gray-500">CIF/NIF</p>
                  <p className="mt-1">{invoice.client_tax_id}</p>
                </div>
              )}
              {invoice.client_email && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Email</p>
                  <p className="mt-1">{invoice.client_email}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Servicios */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Servicios / Productos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">Descripción</th>
                    <th className="text-center p-4 font-medium">Cantidad</th>
                    <th className="text-right p-4 font-medium">Precio Unit.</th>
                    <th className="text-right p-4 font-medium">IVA</th>
                    <th className="text-right p-4 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.services.map((service, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-4">{service.description}</td>
                      <td className="p-4 text-center">{service.quantity}</td>
                      <td className="p-4 text-right">
                        €{service.price.toLocaleString('es-ES', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="p-4 text-right">{service.tax}%</td>
                      <td className="p-4 text-right font-semibold">
                        €{service.total.toLocaleString('es-ES', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2">
                    <td colSpan={4} className="p-4 text-right font-medium">
                      Subtotal:
                    </td>
                    <td className="p-4 text-right font-semibold">
                      €{invoice.subtotal.toLocaleString('es-ES', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="p-4 text-right font-medium">
                      IVA:
                    </td>
                    <td className="p-4 text-right font-semibold">
                      €{invoice.iva.toLocaleString('es-ES', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-green-500">
                    <td colSpan={4} className="p-4 text-right font-bold text-lg text-green-600">
                      TOTAL:
                    </td>
                    <td className="p-4 text-right font-bold text-lg text-green-600">
                      €{invoice.total.toLocaleString('es-ES', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Vista Previa para descargar PDF - Oculto pero necesario para generar PDF */}
        <div className="hidden">
          <div
            ref={invoicePreviewRef}
            className="bg-white"
            style={{ width: '210mm', minHeight: '297mm' }}
          >
            <InvoicePreview
              invoiceNumber={invoice.invoice_number}
              clientName={invoice.client_name}
              clientEmail={invoice.client_email || undefined}
              clientAddress={invoice.client_address || undefined}
              clientTaxId={invoice.client_tax_id || undefined}
              issueDate={invoice.issue_date}
              dueDate={invoice.due_date || undefined}
              services={invoice.services}
              subtotal={invoice.subtotal}
              iva={invoice.iva}
              total={invoice.total}
              status={invoice.status}
            />
          </div>
        </div>
      </div>
    </Layout>
  )
}

