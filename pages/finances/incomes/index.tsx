import { GetServerSideProps } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Edit, Trash2, ArrowLeft, X } from 'lucide-react'
import Link from 'next/link'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import DateRangePicker, { DateRangePickerResult } from '@/components/DateRangePicker'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface IncomesPageProps {
  incomes: any[]
  dateRange?: {
    start: string | null
    end: string | null
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
    const startParam = context.query.start as string
    const endParam = context.query.end as string
    
    let startDate: Date
    let endDate: Date
    
    if (startParam && endParam) {
      startDate = startOfDay(new Date(startParam))
      endDate = endOfDay(new Date(endParam))
    } else {
      const now = new Date()
      startDate = startOfMonth(now)
      endDate = endOfMonth(now)
    }

    const incomes = await prisma.financialIncome.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        deleted_at: null,
      },
      orderBy: { date: 'desc' },
    })

    return {
      props: {
        incomes: incomes.map((i) => ({
          ...i,
          base_amount: Number(i.base_amount),
          iva_amount: Number(i.iva_amount),
          total_amount: Number(i.total_amount),
          date: i.date.toISOString(),
        })),
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      },
    }
  } catch (error: any) {
    console.error('Error loading incomes:', error)
    const now = new Date()
    return {
      props: {
        incomes: [],
        dateRange: {
          start: startOfMonth(now).toISOString(),
          end: endOfMonth(now).toISOString(),
        },
      },
    }
  }
}

export default function IncomesPage({ incomes, dateRange: initialDateRange }: IncomesPageProps) {
  const router = useRouter()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const now = new Date()
  const defaultRange: DateRangePickerResult = {
    start: startOfMonth(now),
    end: endOfMonth(now),
  }
  
  const [dateRange, setDateRange] = useState<DateRangePickerResult>(
    initialDateRange?.start && initialDateRange?.end
      ? {
          start: new Date(initialDateRange.start),
          end: new Date(initialDateRange.end),
        }
      : defaultRange
  )

  const [formData, setFormData] = useState({
    client_name: '',
    total_amount: '',
    date: new Date().toISOString().split('T')[0],
    iva_percent: '21',
    status: 'pending',
    project: '',
  })

  const handleDateRangeChange = (range: DateRangePickerResult) => {
    setDateRange(range)
    if (range.start && range.end) {
      const params = new URLSearchParams({
        start: format(range.start, 'yyyy-MM-dd'),
        end: format(range.end, 'yyyy-MM-dd'),
      })
      router.push(`/finances/incomes?${params.toString()}`)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const calculateBaseAndIva = () => {
    const total = parseFloat(formData.total_amount) || 0
    const ivaPercent = parseFloat(formData.iva_percent) || 0
    const base = total / (1 + ivaPercent / 100)
    const iva = total - base
    return { base, iva, total }
  }

  const handleSubmitIncome = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { base, iva, total } = calculateBaseAndIva()

    try {
      const res = await fetch('/api/finances/incomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: formData.client_name,
          date: formData.date,
          base_amount: base,
          iva_amount: iva,
          total_amount: total,
          status: formData.status,
          project: formData.project || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Error al crear ingreso')
        setLoading(false)
        return
      }

      setFormData({
        client_name: '',
        total_amount: '',
        date: new Date().toISOString().split('T')[0],
        iva_percent: '21',
        status: 'pending',
        project: '',
      })
      setIsModalOpen(false)
      router.reload()
    } catch (err) {
      alert('Error de conexión')
      setLoading(false)
    }
  }

  const totalIncome = incomes.reduce((sum, i) => sum + i.total_amount, 0)
  const totalBase = incomes.reduce((sum, i) => sum + i.base_amount, 0)
  const currentDateRange = dateRange || defaultRange

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      pending: { label: 'Pendiente', variant: 'outline' },
      paid: { label: 'Cobrado', variant: 'default' },
      estimated: { label: 'Estimado', variant: 'secondary' },
    }
    const statusInfo = statusMap[status] || statusMap.pending
    return <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/finances">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Ingresos</h1>
              <p className="text-gray-600 mt-1">Gestión de facturas e ingresos - Filtrados por rango de fechas</p>
            </div>
          </div>
          <DateRangePicker onRangeChange={handleDateRangeChange} defaultRange={currentDateRange} />
        </div>

        {/* Resumen */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Total Ingresos</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(totalIncome)}</p>
              <p className="text-xs text-gray-400 mt-1">Con IVA</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Base Imponible</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(totalBase)}</p>
              <p className="text-xs text-gray-400 mt-1">Sin IVA</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Total Facturas</p>
              <p className="text-2xl font-semibold text-gray-900">{incomes.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabla de ingresos */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">Facturas e Ingresos</CardTitle>
            <Button size="sm" onClick={() => setIsModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo
            </Button>
          </CardHeader>
          <CardContent>
            {incomes.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No hay ingresos en el rango seleccionado</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Fecha</th>
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Cliente</th>
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Proyecto</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Sin IVA</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Con IVA</th>
                          <th className="text-center p-3 font-medium text-sm text-gray-700">Estado</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incomes.map((income) => (
                          <tr key={income.id} className="border-b hover:bg-gray-50">
                            <td className="p-3 text-sm text-gray-600">
                              {format(new Date(income.date), 'dd MMM yyyy')}
                            </td>
                            <td className="p-3 text-sm text-gray-900">{income.client_name}</td>
                            <td className="p-3 text-sm text-gray-600">{income.project || '-'}</td>
                            <td className="p-3 text-right text-sm text-gray-600">
                              {formatCurrency(income.base_amount)}
                            </td>
                            <td className="p-3 text-right text-sm font-medium text-gray-900">
                              {formatCurrency(income.total_amount)}
                            </td>
                        <td className="p-3 text-center">
                          {getStatusBadge(income.status)}
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <Link href={`/finances/incomes/${income.id}/edit`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Edit className="h-3 w-3" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={async () => {
                                if (confirm('¿Eliminar este ingreso?')) {
                                  await fetch(`/api/finances/incomes/${income.id}`, {
                                    method: 'DELETE',
                                  })
                                  router.reload()
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal para añadir ingreso */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nuevo Ingreso</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitIncome} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client_name">Cliente *</Label>
                <Input
                  id="client_name"
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  placeholder="Nombre del cliente"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="total_amount">Precio Total (€) *</Label>
                  <Input
                    id="total_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.total_amount}
                    onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="iva_percent">IVA %</Label>
                  <Input
                    id="iva_percent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.iva_percent}
                    onChange={(e) => setFormData({ ...formData, iva_percent: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Fecha *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Estado</Label>
                  <select
                    id="status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="pending">Pendiente</option>
                    <option value="paid">Cobrado</option>
                    <option value="estimated">Estimado</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project">Proyecto</Label>
                <Input
                  id="project"
                  value={formData.project}
                  onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                  placeholder="Proyecto asociado (opcional)"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Guardando...' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}

