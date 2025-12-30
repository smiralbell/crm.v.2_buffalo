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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Search, Eye, AlertTriangle, FileText, Download, Trash2, FileDown, ChevronDown, Cloud, CloudOff } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import DateRangePicker, { DateRangePickerResult } from '@/components/DateRangePicker'

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
  sent_to_drive: boolean
}

interface InvoicesPageProps {
  invoices: Invoice[]
  page: number
  totalPages: number
  search: string
  status: string
  dateFrom?: string
  dateTo?: string
  stats: {
    total: number
    draft: number
    sent: number
    totalAmount: number
    totalSinIva: number
    totalConIva: number
    totalIva: number
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
    const dateFrom = context.query.dateFrom as string | undefined
    const dateTo = context.query.dateTo as string | undefined
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

    // Filtro por fechas
    if (dateFrom || dateTo) {
      where.issue_date = {}
      if (dateFrom) {
        where.issue_date.gte = new Date(dateFrom)
      }
      if (dateTo) {
        // Añadir un día completo para incluir el día final
        const endDate = new Date(dateTo)
        endDate.setHours(23, 59, 59, 999)
        where.issue_date.lte = endDate
      }
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
            sent_to_drive: true,
          },
        }),
        prisma.invoice.count({ where }),
        prisma.invoice.findMany({
          where,
          select: {
            status: true,
            subtotal: true,
            iva: true,
            total: true,
          },
        }),
      ])

      const totalPages = Math.ceil(total / pageSize)

      // Calcular estadísticas
      const totalSinIva = allInvoices.reduce((sum, inv) => {
        const subtotal = inv.subtotal ? Number(inv.subtotal) : 0
        return sum + (isNaN(subtotal) ? 0 : subtotal)
      }, 0)
      const totalConIva = allInvoices.reduce((sum, inv) => {
        const total = inv.total ? Number(inv.total) : 0
        return sum + (isNaN(total) ? 0 : total)
      }, 0)
      const totalIva = allInvoices.reduce((sum, inv) => {
        const iva = inv.iva ? Number(inv.iva) : 0
        return sum + (isNaN(iva) ? 0 : iva)
      }, 0)
      
      const stats = {
        total: allInvoices.length || 0,
        draft: allInvoices.filter((i) => i.status === 'draft').length || 0,
        sent: allInvoices.filter((i) => i.status === 'sent').length || 0,
        totalAmount: (isNaN(totalConIva) ? 0 : totalConIva),
        totalSinIva: (isNaN(totalSinIva) ? 0 : totalSinIva),
        totalConIva: (isNaN(totalConIva) ? 0 : totalConIva),
        totalIva: (isNaN(totalIva) ? 0 : totalIva),
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
          ...(dateFrom && { dateFrom }),
          ...(dateTo && { dateTo }),
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
              totalSinIva: 0,
              totalConIva: 0,
              totalIva: 0,
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
  dateFrom: initialDateFrom,
  dateTo: initialDateTo,
  stats,
  error,
  debugInfo,
}: InvoicesPageProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [status, setStatus] = useState(initialStatus)
  const [dateRange, setDateRange] = useState<DateRangePickerResult>({
    start: initialDateFrom ? new Date(initialDateFrom) : null,
    end: initialDateTo ? new Date(initialDateTo) : null,
  })
  const [loading, setLoading] = useState(false)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<{ id: number; number: string } | null>(null)
  const [deleteConfirmNumber, setDeleteConfirmNumber] = useState('')
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [selectedInvoices, setSelectedInvoices] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [sendingToDrive, setSendingToDrive] = useState<Set<number>>(new Set())

  const safeInvoices = invoices || []
  const safePage = page || 1
  const safeTotalPages = totalPages || 1

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const query: any = { search, status, page: 1 }
    if (dateRange.start) {
      query.dateFrom = dateRange.start.toISOString().split('T')[0]
    }
    if (dateRange.end) {
      query.dateTo = dateRange.end.toISOString().split('T')[0]
    }
    router.push({
      pathname: '/invoices',
      query,
    })
  }

  const handleDateRangeChange = (range: DateRangePickerResult) => {
    setDateRange(range)
    // Aplicar filtro automáticamente cuando cambia el rango
    const query: any = { search, status, page: 1 }
    if (range.start) {
      query.dateFrom = range.start.toISOString().split('T')[0]
    }
    if (range.end) {
      query.dateTo = range.end.toISOString().split('T')[0]
    }
    router.push({
      pathname: '/invoices',
      query,
    })
  }

  const handleStatusChange = (value: string) => {
    const statusValue = value === 'all' ? '' : value
    setStatus(value)
    const query: any = { search, status: statusValue, page: 1 }
    if (dateRange.start) {
      query.dateFrom = dateRange.start.toISOString().split('T')[0]
    }
    if (dateRange.end) {
      query.dateTo = dateRange.end.toISOString().split('T')[0]
    }
    router.push({
      pathname: '/invoices',
      query,
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
      // Abrir en nueva pestaña para usar el método de la página de edición
      window.open(`/invoices/${invoiceId}/edit?download=true`, '_blank')
    } catch (error) {
      console.error('Error al descargar PDF:', error)
      alert('Error al generar el PDF. Por favor, intenta de nuevo.')
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

  // Funciones de selección
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInvoices(new Set(safeInvoices.map(inv => inv.id)))
    } else {
      setSelectedInvoices(new Set())
    }
  }

  const handleSelectInvoice = (invoiceId: number, checked: boolean) => {
    const newSelected = new Set(selectedInvoices)
    if (checked) {
      newSelected.add(invoiceId)
    } else {
      newSelected.delete(invoiceId)
    }
    setSelectedInvoices(newSelected)
  }

  // Función para exportar a CSV
  const exportToCSV = async (invoiceIds?: number[], filterStatus?: string, dateFrom?: string, dateTo?: string) => {
    setExporting(true)
    try {
      // Construir query params
      const params = new URLSearchParams()
      if (invoiceIds && invoiceIds.length > 0) {
        params.append('ids', invoiceIds.join(','))
      } else if (filterStatus && filterStatus !== 'all') {
        params.append('status', filterStatus)
      }
      if (dateFrom) {
        params.append('dateFrom', dateFrom)
      }
      if (dateTo) {
        params.append('dateTo', dateTo)
      }

      // Obtener todas las facturas con todos sus datos
      const response = await fetch(`/api/invoices/export?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Error al exportar facturas')
      }

      const data = await response.json()
      
      // Convertir a CSV
      const csv = convertToCSV(data.invoices)
      
      // Descargar archivo con encoding UTF-8 (el BOM ya está incluido en csv)
      const blob = new Blob([csv], { 
        type: 'text/csv;charset=utf-8;' 
      })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      const dateStr = new Date().toISOString().split('T')[0]
      link.setAttribute('download', `facturas_${dateStr}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error al exportar:', error)
      alert('Error al exportar facturas. Por favor, intenta de nuevo.')
    } finally {
      setExporting(false)
    }
  }

  // Función para convertir datos a CSV
  const convertToCSV = (invoices: any[]) => {
    if (!invoices || invoices.length === 0) {
      return 'No hay facturas para exportar'
    }

    // Usar punto y coma como separador para mejor compatibilidad con Excel en español
    const SEPARATOR = ';'

    // Definir columnas
    const headers = [
      'Número de Factura',
      'Estado',
      'Cliente',
      'Empresa Cliente',
      'Email Cliente',
      'Dirección Cliente',
      'CIF/NIF Cliente',
      'Fecha Emisión',
      'Fecha Vencimiento',
      'Subtotal (Sin IVA)',
      'IVA',
      'Total (Con IVA)',
      'Servicios',
      'Fecha Creación',
      'Fecha Actualización'
    ]

    // Función para escapar valores CSV correctamente
    const escapeCSV = (value: any): string => {
      // Convertir a string y manejar valores nulos/undefined
      if (value === null || value === undefined) {
        return ''
      }
      
      const strValue = String(value)
      
      // Si contiene el separador, comillas, saltos de línea o tabulaciones, escapar
      if (strValue.includes(SEPARATOR) || strValue.includes('"') || strValue.includes('\n') || strValue.includes('\r') || strValue.includes('\t')) {
        // Escapar comillas dobles duplicándolas y envolver en comillas
        return `"${strValue.replace(/"/g, '""')}"`
      }
      
      return strValue
    }

    // Crear filas
    const rows = invoices.map(invoice => {
      // Formatear servicios de manera más clara
      let services = ''
      if (Array.isArray(invoice.services) && invoice.services.length > 0) {
        services = invoice.services.map((s: any) => {
          const desc = s.description || 'Sin descripción'
          const qty = s.quantity || 0
          const price = s.price || 0
          const tax = s.tax || 0
          return `${desc} - Cantidad: ${qty} - Precio: ${price.toFixed(2)}€ - IVA: ${tax}%`
        }).join(' | ')
      }
      
      return [
        escapeCSV(invoice.invoice_number || ''),
        escapeCSV(statusLabels[invoice.status] || invoice.status || ''),
        escapeCSV(invoice.client_name || ''),
        escapeCSV(invoice.client_company_name || ''),
        escapeCSV(invoice.client_email || ''),
        escapeCSV(invoice.client_address || ''),
        escapeCSV(invoice.client_tax_id || ''),
        invoice.issue_date ? format(new Date(invoice.issue_date), 'dd/MM/yyyy') : '',
        invoice.due_date ? format(new Date(invoice.due_date), 'dd/MM/yyyy') : '',
        (invoice.subtotal || 0).toFixed(2), // Punto como separador decimal (estándar internacional)
        (invoice.iva || 0).toFixed(2),
        (invoice.total || 0).toFixed(2),
        escapeCSV(services),
        invoice.created_at ? format(new Date(invoice.created_at), 'dd/MM/yyyy HH:mm') : '',
        invoice.updated_at ? format(new Date(invoice.updated_at), 'dd/MM/yyyy HH:mm') : ''
      ]
    })

    // Construir CSV con punto y coma como separador
    const csvContent = [
      headers.map(escapeCSV).join(SEPARATOR),
      ...rows.map(row => row.join(SEPARATOR))
    ].join('\n')

    // Añadir BOM UTF-8 para Excel (importante para caracteres especiales)
    return '\uFEFF' + csvContent
  }

  const handleExportSelected = () => {
    // Activar modo de selección
    setSelectionMode(true)
  }

  const handleExportSelectedConfirm = () => {
    if (selectedInvoices.size === 0) {
      alert('Por favor, selecciona al menos una factura para exportar')
      return
    }
    exportToCSV(Array.from(selectedInvoices))
    setSelectionMode(false)
    setSelectedInvoices(new Set())
  }

  const handleExportAll = () => {
    // Exportar según el filtro actual
    const currentStatus = status === 'all' ? '' : status
    const dateFrom = dateRange.start ? dateRange.start.toISOString().split('T')[0] : undefined
    const dateTo = dateRange.end ? dateRange.end.toISOString().split('T')[0] : undefined
    exportToCSV(undefined, currentStatus, dateFrom, dateTo)
  }

  const handleSendToDrive = async (invoiceId: number) => {
    setSendingToDrive(prev => new Set(prev).add(invoiceId))
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/send-to-drive`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Error al enviar factura')
      }

      // Recargar la página para actualizar el estado
      router.reload()
    } catch (error) {
      console.error('Error al enviar a Google Drive:', error)
      alert(error instanceof Error ? error.message : 'Error al enviar la factura a Google Drive')
    } finally {
      setSendingToDrive(prev => {
        const newSet = new Set(prev)
        newSet.delete(invoiceId)
        return newSet
      })
    }
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

        {/* Stats Cards - Estilo minimalista */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Total Facturas</p>
              <div className="text-2xl font-semibold text-gray-900 mb-1">{stats.total}</div>
              <p className="text-xs text-gray-400">Todas las facturas</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Total Sin IVA</p>
              <div className="text-2xl font-semibold text-gray-900 mb-1">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  minimumFractionDigits: 2,
                }).format(stats.totalSinIva || 0)}
              </div>
              <p className="text-xs text-gray-400">Base imponible</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Total Con IVA</p>
              <div className="text-2xl font-semibold text-gray-900 mb-1">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  minimumFractionDigits: 2,
                }).format(stats.totalConIva || 0)}
              </div>
              <p className="text-xs text-gray-400">Importe total</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">IVA a Pagar</p>
              <div className="text-2xl font-semibold text-gray-900 mb-1">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  minimumFractionDigits: 2,
                }).format(stats.totalIva || 0)}
              </div>
              <p className="text-xs text-gray-400">IVA repercutido</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and New Button - Estilo minimalista */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[250px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Buscar por número, cliente, email..."
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
              <DateRangePicker
                onRangeChange={handleDateRangeChange}
                defaultRange={dateRange}
                className="min-w-[280px]"
              />
              <Button type="submit" disabled={loading} variant="outline">
                <Search className="mr-2 h-4 w-4" />
                Buscar
              </Button>
              <Link href="/invoices/new">
                <Button type="button">
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva Factura
                </Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    type="button" 
                    variant="outline"
                    disabled={exporting}
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    Exportar
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={handleExportSelected}
                    disabled={exporting}
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    Exportar Seleccionadas
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={handleExportAll}
                    disabled={exporting}
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    Exportar Todo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {selectionMode && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleExportSelectedConfirm}
                    disabled={selectedInvoices.size === 0 || exporting}
                  >
                    Exportar {selectedInvoices.size} Seleccionadas
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectionMode(false)
                      setSelectedInvoices(new Set())
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
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

        {/* Table - Estilo minimalista */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="pt-6 p-0">
            {safeInvoices.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-500 mb-2">No hay facturas registradas</p>
                <p className="text-sm text-gray-400 mb-6">Crea tu primera factura para comenzar</p>
                <Link href="/invoices/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Crear Primera Factura
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      {selectionMode && (
                        <th className="text-left p-3 font-medium text-sm text-gray-700 w-12">
                          <input
                            type="checkbox"
                            checked={selectedInvoices.size === safeInvoices.length && safeInvoices.length > 0}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            className="rounded border-gray-300"
                          />
                        </th>
                      )}
                      <th className="text-left p-3 font-medium text-sm text-gray-700">Número</th>
                      <th className="text-left p-3 font-medium text-sm text-gray-700">Cliente</th>
                      <th className="text-left p-3 font-medium text-sm text-gray-700">Fecha</th>
                      <th className="text-center p-3 font-medium text-sm text-gray-700">Estado</th>
                      <th className="text-right p-3 font-medium text-sm text-gray-700">Sin IVA</th>
                      <th className="text-right p-3 font-medium text-sm text-gray-700">Con IVA</th>
                      <th className="text-right p-3 font-medium text-sm text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeInvoices.map((invoice) => (
                      <tr 
                        key={invoice.id} 
                        className="border-b hover:bg-gray-50"
                      >
                        {selectionMode && (
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={selectedInvoices.has(invoice.id)}
                              onChange={(e) => handleSelectInvoice(invoice.id, e.target.checked)}
                              className="rounded border-gray-300"
                            />
                          </td>
                        )}
                        <td className="p-3 text-sm font-medium text-gray-900">{invoice.invoice_number}</td>
                        <td className="p-3 text-sm text-gray-900">{invoice.client_name}</td>
                        <td className="p-3 text-sm text-gray-600">
                          {format(new Date(invoice.issue_date), 'dd MMM yyyy')}
                        </td>
                        <td className="p-3 text-center">
                          <Badge 
                            variant={invoice.status === 'sent' ? 'default' : invoice.status === 'draft' ? 'secondary' : 'outline'}
                            className="text-xs"
                          >
                            {statusLabels[invoice.status] || invoice.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-right text-sm text-gray-600">
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                            minimumFractionDigits: 2,
                          }).format(invoice.subtotal || 0)}
                        </td>
                        <td className="p-3 text-right text-sm font-medium text-gray-900">
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                            minimumFractionDigits: 2,
                          }).format(invoice.total)}
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <Link href={`/invoices/${invoice.id}/edit`}>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                title="Editar factura"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownloadPDF(invoice.id, invoice.invoice_number)}
                              disabled={downloadingId === invoice.id}
                              className="h-8 w-8"
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
                              onClick={() => handleSendToDrive(invoice.id)}
                              disabled={sendingToDrive.has(invoice.id)}
                              className={`h-8 w-8 ${invoice.sent_to_drive ? 'text-green-600 hover:text-green-700' : 'text-red-500 hover:text-red-700'}`}
                              title={invoice.sent_to_drive ? 'Reenviar a Google Drive' : 'Enviar a Google Drive'}
                            >
                              {sendingToDrive.has(invoice.id) ? (
                                <div className="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                              ) : invoice.sent_to_drive ? (
                                <Cloud className="h-4 w-4" />
                              ) : (
                                <CloudOff className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(invoice)}
                              className="h-8 w-8 text-red-500 hover:text-red-700"
                              title="Eliminar factura"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination - Estilo minimalista */}
            {safeTotalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <p className="text-sm text-gray-600">
                  Página <span className="font-medium">{safePage}</span> de{' '}
                  <span className="font-medium">{safeTotalPages}</span>
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
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
                    size="sm"
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

