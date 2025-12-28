import { GetServerSideProps } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Search, Eye, AlertTriangle, FileText, Download, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

interface Invoice {
  id: number
  invoice_number: string
  status: string
  client_name: string
  subtotal: number
  iva: number
  total: number
  issue_date: string
  created_at: string
}

interface InvoicesPageProps {
  invoices: Invoice[]
  page: number
  totalPages: number
  search: string
  status: string
  stats: {
    total: number
    draft: number
    sent: number
    totalAmount: number
  }
  error?: string
  debugInfo?: {
    code?: string
    message?: string
    suggestion?: string
  }
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  // Verificar autenticación primero
  let authUser
  try {
    authUser = await requireAuth(context)
  } catch (authError: any) {
    // requireAuth ya redirigió, pero por si acaso retornamos redirect
    // El error puede ser 'No session', 'Invalid token', o 'Invalid session data'
    console.log('Auth error in invoices page:', authError?.message)
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  // Si llegamos aquí, la autenticación fue exitosa
  try {
    const page = parseInt(context.query.page as string) || 1
    const search = (context.query.search as string) || ''
    const status = (context.query.status as string) || ''
    const pageSize = 10
    const skip = (page - 1) * pageSize

    const where: any = {
      deleted_at: null,
    }

    if (status && status !== 'all') {
      where.status = status
    }

    if (search) {
      where.OR = [
        { invoice_number: { contains: search, mode: 'insensitive' } },
        { client_name: { contains: search, mode: 'insensitive' } },
        { client_email: { contains: search, mode: 'insensitive' } },
      ]
    }

    try {
      const [invoices, total, allInvoices] = await Promise.all([
        prisma.invoice.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { issue_date: 'desc' },
          select: {
            id: true,
            invoice_number: true,
            status: true,
            client_name: true,
            subtotal: true,
            iva: true,
            total: true,
            issue_date: true,
            created_at: true,
          },
        }),
        prisma.invoice.count({ where }),
        prisma.invoice.findMany({
          where: { deleted_at: null },
          select: {
            status: true,
            total: true,
          },
        }),
      ])

      const totalPages = Math.ceil(total / pageSize)

      // Calcular estadísticas
      const stats = {
        total: allInvoices.length,
        draft: allInvoices.filter((i) => i.status === 'draft').length,
        sent: allInvoices.filter((i) => i.status === 'sent').length,
        totalAmount: allInvoices.reduce((sum, inv) => sum + Number(inv.total), 0),
      }

      return {
        props: {
        invoices: invoices.map((inv) => ({
          ...inv,
          subtotal: Number(inv.subtotal),
          iva: Number(inv.iva),
          total: Number(inv.total),
          issue_date: inv.issue_date.toISOString(),
          created_at: inv.created_at.toISOString(),
        })),
          page,
          totalPages,
          search,
          status: status || 'all',
          stats,
        },
      }
    } catch (dbError: any) {
      // Error de base de datos
      console.error('Error loading invoices from DB:', dbError)
      const errorMessage = dbError?.message || 'Error desconocido'
      const errorCode = dbError?.code || 'UNKNOWN'
      
      // Si es un error de tabla no encontrada
      if (
        errorMessage.includes('does not exist') ||
        errorCode === 'P2021' ||
        errorMessage.includes('relation') ||
        errorMessage.includes('table') ||
        errorMessage.includes('Unknown model')
      ) {
        return {
          props: {
            invoices: [],
            page: 1,
            totalPages: 0,
            search: '',
            status: 'all',
            stats: {
              total: 0,
              draft: 0,
              sent: 0,
              totalAmount: 0,
            },
            error: `La tabla de facturas no existe o Prisma Client no está actualizado. Error: ${errorCode} - ${errorMessage.substring(0, 100)}`,
            debugInfo: {
              code: errorCode,
              message: errorMessage,
              suggestion: 'Ejecuta: npm run prisma:generate (después de detener el servidor)',
            },
          },
        }
      }

      // Otro error de BD
      return {
        props: {
          invoices: [],
          page: 1,
          totalPages: 0,
          search: '',
          status: 'all',
          stats: {
            total: 0,
            draft: 0,
            sent: 0,
            totalAmount: 0,
          },
          error: `Error al cargar facturas. Código: ${errorCode}. Prueba el endpoint /api/test-invoices para más detalles.`,
          debugInfo: {
            code: errorCode,
            message: errorMessage,
          },
        },
      }
    }
  } catch (authError: any) {
    // Error de autenticación - requireAuth ya redirigió, pero por si acaso
    console.error('Auth error in invoices:', authError)
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }
}

export default function InvoicesPage({
  invoices,
  page,
  totalPages,
  search: initialSearch,
  status: initialStatus,
  stats,
  error,
  debugInfo,
}: InvoicesPageProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [status, setStatus] = useState(initialStatus)
  const [loading, setLoading] = useState(false)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<{ id: number; number: string } | null>(null)
  const [deleteConfirmNumber, setDeleteConfirmNumber] = useState('')
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  const safeInvoices = invoices || []
  const safePage = page || 1
  const safeTotalPages = totalPages || 1

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    router.push({
      pathname: '/invoices',
      query: { search, status, page: 1 },
    })
  }

  const handleStatusChange = (value: string) => {
    const statusValue = value === 'all' ? '' : value
    setStatus(value)
    router.push({
      pathname: '/invoices',
      query: { search, status: statusValue, page: 1 },
    })
  }

  const handleDeleteClick = (invoice: Invoice) => {
    setInvoiceToDelete({ id: invoice.id, number: invoice.invoice_number })
    setDeleteConfirmNumber('')
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!invoiceToDelete) return

    if (deleteConfirmNumber !== invoiceToDelete.number) {
      alert('El número de factura no coincide. Por favor, escribe el número exacto para confirmar.')
      return
    }

    try {
      const res = await fetch(`/api/invoices/${invoiceToDelete.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setDeleteDialogOpen(false)
        setInvoiceToDelete(null)
        setDeleteConfirmNumber('')
        router.reload()
      } else {
        alert('Error al eliminar factura')
      }
    } catch (error) {
      alert('Error de conexión')
    }
  }

  // Función para descargar PDF
  const handleDownloadPDF = async (invoiceId: number, invoiceNumber: string) => {
    setDownloadingId(invoiceId)
    try {
      // Redirigir a la página de detalle donde se puede descargar
      window.open(`/invoices/${invoiceId}`, '_blank')
    } catch (error) {
      console.error('Error al descargar PDF:', error)
      alert('Error al descargar el PDF')
    } finally {
      setDownloadingId(null)
    }
  }

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
        {/* Error Message */}
        {error && (
          <Card className="border border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <div className="flex-1">
                  <p className="font-semibold text-yellow-900">Error al cargar facturas</p>
                  <p className="text-sm text-yellow-700 mt-1">{error}</p>
                  {debugInfo && (
                    <div className="mt-3 p-3 bg-yellow-100 rounded text-xs">
                      <p className="font-semibold mb-1">Información de debug:</p>
                      {debugInfo.code && <p>Código: {debugInfo.code}</p>}
                      {debugInfo.message && <p className="break-all">Mensaje: {debugInfo.message}</p>}
                      {debugInfo.suggestion && (
                        <p className="mt-2 font-semibold text-yellow-900">{debugInfo.suggestion}</p>
                      )}
                    </div>
                  )}
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-semibold text-yellow-900">Pasos a seguir:</p>
                    <ol className="text-sm text-yellow-700 list-decimal list-inside space-y-1">
                      <li>Detén el servidor (Ctrl+C)</li>
                      <li>Ejecuta: <code className="bg-yellow-200 px-1 rounded">npm run prisma:generate</code></li>
                      <li>Reinicia el servidor: <code className="bg-yellow-200 px-1 rounded">npm run dev</code></li>
                      <li>Prueba el endpoint: <a href="/api/test-invoices" target="_blank" className="underline">/api/test-invoices</a></li>
                    </ol>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Total Facturas</p>
              <div className="text-3xl font-semibold text-gray-900 mb-1">{stats.total}</div>
              <p className="text-xs text-gray-400 mt-1">Todas las facturas</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Borradores</p>
              <div className="text-3xl font-semibold text-gray-900 mb-1">{stats.draft}</div>
              <p className="text-xs text-gray-400 mt-1">Pendientes de enviar</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Enviadas</p>
              <div className="text-3xl font-semibold text-gray-900 mb-1">{stats.sent}</div>
              <p className="text-xs text-gray-400 mt-1">Facturas enviadas</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Total Facturado</p>
              <div className="text-3xl font-semibold text-gray-900 mb-1">
                €{stats.totalAmount.toLocaleString('es-ES', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1">Suma total</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and New Button */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Buscar por número, cliente..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={status || 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="sent">Enviada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={loading} variant="outline">
                Buscar
              </Button>
              <Link href="/invoices/new">
                <Button type="button">
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva Factura
                </Button>
              </Link>
            </form>
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Confirmar Eliminación
              </DialogTitle>
              <DialogDescription>
                Esta acción no se puede deshacer. Para confirmar, escribe el número de factura:
                <span className="font-semibold text-gray-900 block mt-2">
                  {invoiceToDelete?.number}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <label htmlFor="confirm-number" className="text-sm font-medium">
                Número de factura
              </label>
              <Input
                id="confirm-number"
                value={deleteConfirmNumber}
                onChange={(e) => setDeleteConfirmNumber(e.target.value)}
                placeholder="Escribe el número exacto"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false)
                  setInvoiceToDelete(null)
                  setDeleteConfirmNumber('')
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteConfirmNumber !== invoiceToDelete?.number}
              >
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Table */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            {safeInvoices.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No hay facturas registradas</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-4 font-semibold text-gray-900">Número</th>
                      <th className="text-left p-4 font-semibold text-gray-900">Cliente</th>
                      <th className="text-left p-4 font-semibold text-gray-900">Fecha</th>
                      <th className="text-left p-4 font-semibold text-gray-900">Estado</th>
                      <th className="text-right p-4 font-semibold text-gray-900">Subtotal</th>
                      <th className="text-right p-4 font-semibold text-gray-900">Total con IVA</th>
                      <th className="text-right p-4 font-semibold text-gray-900">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeInvoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b hover:bg-gray-50">
                        <td className="p-4 font-medium text-gray-900">{invoice.invoice_number}</td>
                        <td className="p-4 text-gray-700">{invoice.client_name}</td>
                        <td className="p-4 text-gray-600">
                          {format(new Date(invoice.issue_date), 'dd MMM yyyy')}
                        </td>
                        <td className="p-4">
                          <Badge className={statusColors[invoice.status] || 'bg-gray-100 text-gray-800'}>
                            {statusLabels[invoice.status] || invoice.status}
                          </Badge>
                        </td>
                        <td className="p-4 text-right">
                          <div className="text-sm text-gray-600">
                            €{invoice.subtotal?.toLocaleString('es-ES', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }) || '0.00'}
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="font-semibold text-gray-900">
                            €{invoice.total.toLocaleString('es-ES', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                          {invoice.iva > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              (+€{invoice.iva?.toLocaleString('es-ES', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }) || '0.00'} IVA)
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <Link href={`/invoices/${invoice.id}`}>
                              <Button variant="ghost" size="icon" title="Ver factura">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownloadPDF(invoice.id, invoice.invoice_number)}
                              disabled={downloadingId === invoice.id}
                              title="Descargar PDF"
                            >
                              {downloadingId === invoice.id ? (
                                <div className="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(invoice)}
                              title="Eliminar factura"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {safeTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-600">
                  Página {safePage} de {safeTotalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={safePage === 1}
                    onClick={() =>
                      router.push({
                        pathname: '/invoices',
                        query: { search, status, page: safePage - 1 },
                      })
                    }
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    disabled={safePage === safeTotalPages}
                    onClick={() =>
                      router.push({
                        pathname: '/invoices',
                        query: { search, status, page: safePage + 1 },
                      })
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

