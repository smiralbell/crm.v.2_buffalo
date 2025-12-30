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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ExpensesPageProps {
  fixedExpenses: any[]
  expenses: any[]
  salaries: any[]
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
    // Obtener rango de fechas de query params o usar mes actual por defecto
    const startParam = context.query.start as string
    const endParam = context.query.end as string
    
    let startDate: Date
    let endDate: Date
    
    if (startParam && endParam) {
      startDate = startOfDay(new Date(startParam))
      endDate = endOfDay(new Date(endParam))
    } else {
      // Por defecto: mes actual
      const now = new Date()
      startDate = startOfMonth(now)
      endDate = endOfMonth(now)
    }

    const [fixedExpenses, expenses, salaries] = await Promise.all([
      prisma.fixedExpense.findMany({
        where: { deleted_at: null },
        orderBy: { name: 'asc' },
      }),
      prisma.expense.findMany({
        where: {
          OR: [
            {
              date_start: { gte: startDate, lte: endDate },
            },
            {
              date_end: { gte: startDate, lte: endDate },
            },
            {
              AND: [
                { date_start: { lte: startDate } },
                { date_end: { gte: endDate } },
              ],
            },
          ],
          deleted_at: null,
        },
        orderBy: { date_start: 'desc' },
      }),
      prisma.salary.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          deleted_at: null,
        },
        orderBy: { date: 'desc' },
      }),
    ])

    return {
      props: {
        fixedExpenses: fixedExpenses.map((e) => ({
          id: e.id,
          name: e.name,
          amount: Number(e.amount),
          has_iva: e.has_iva,
          iva_percent: e.iva_percent ? Number(e.iva_percent) : null,
          is_active: e.is_active,
          tags: e.tags || [],
          created_at: e.created_at ? e.created_at.toISOString() : null,
          updated_at: e.updated_at ? e.updated_at.toISOString() : null,
          deleted_at: e.deleted_at ? e.deleted_at.toISOString() : null,
        })),
        expenses: expenses.map((e) => ({
          id: e.id,
          name: e.name,
          base_amount: Number(e.base_amount),
          iva_amount: Number(e.iva_amount),
          total_amount: Number(e.total_amount),
          date_start: e.date_start ? e.date_start.toISOString() : null,
          date_end: e.date_end ? e.date_end.toISOString() : null,
          tags: e.tags || [],
          person_name: e.person_name,
          project: e.project,
          client_name: e.client_name,
          notes: e.notes,
          created_at: e.created_at ? e.created_at.toISOString() : null,
          updated_at: e.updated_at ? e.updated_at.toISOString() : null,
          deleted_at: e.deleted_at ? e.deleted_at.toISOString() : null,
        })),
        salaries: salaries.map((s) => ({
          id: s.id,
          person_name: s.person_name,
          amount: Number(s.amount),
          date: s.date.toISOString(),
          tags: s.tags || [],
          notes: s.notes,
          created_at: s.created_at ? s.created_at.toISOString() : null,
          updated_at: s.updated_at ? s.updated_at.toISOString() : null,
          deleted_at: s.deleted_at ? s.deleted_at.toISOString() : null,
        })),
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      },
    }
  } catch (error: any) {
    console.error('Error loading expenses:', error)
    const now = new Date()
    return {
      props: {
        fixedExpenses: [],
        expenses: [],
        salaries: [],
        dateRange: {
          start: startOfMonth(now).toISOString(),
          end: endOfMonth(now).toISOString(),
        },
      },
    }
  }
}

export default function ExpensesPage({ fixedExpenses, expenses, salaries, dateRange: initialDateRange }: ExpensesPageProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('fixed')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFixedModalOpen, setIsFixedModalOpen] = useState(false)
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingFixed, setLoadingFixed] = useState(false)
  const [loadingSalary, setLoadingSalary] = useState(false)
  
  // Estados para AlertDialog de eliminación
  const [deleteFixedId, setDeleteFixedId] = useState<string | null>(null)
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null)
  const [deleteSalaryId, setDeleteSalaryId] = useState<string | null>(null)
  
  // Valores por defecto si initialDateRange no está definido
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

  // Formulario del modal
  const [formData, setFormData] = useState({
    name: '',
    total_amount: '',
    tags: [] as string[],
    newTag: '',
    expenseDateRange: {
      start: new Date(),
      end: new Date(),
    } as DateRangePickerResult,
    iva_percent: '21',
  })

  // Obtener todas las etiquetas únicas de los gastos existentes
  const allTags = expenses
    .flatMap((e) => (e.tags || []))
    .filter((tag): tag is string => !!tag && tag.trim() !== '')
  const existingTags = Array.from(new Set(allTags)).sort()

  // Función para generar color consistente para etiquetas
  const getTagColor = (tag: string) => {
    const colors = [
      'bg-blue-100 text-blue-800 border-blue-200',
      'bg-green-100 text-green-800 border-green-200',
      'bg-purple-100 text-purple-800 border-purple-200',
      'bg-pink-100 text-pink-800 border-pink-200',
      'bg-yellow-100 text-yellow-800 border-yellow-200',
      'bg-indigo-100 text-indigo-800 border-indigo-200',
      'bg-red-100 text-red-800 border-red-200',
      'bg-orange-100 text-orange-800 border-orange-200',
      'bg-teal-100 text-teal-800 border-teal-200',
      'bg-cyan-100 text-cyan-800 border-cyan-200',
    ]
    // Generar índice consistente basado en el hash del tag
    let hash = 0
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  // Formulario para gastos fijos
  const [fixedFormData, setFixedFormData] = useState({
    name: '',
    amount: '',
    has_iva: false,
    iva_percent: '21',
    is_active: true,
    tags: [] as string[],
    newTag: '',
  })

  // Formulario para nóminas
  const [salaryFormData, setSalaryFormData] = useState({
    person_name: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    tags: [] as string[],
    newTag: '',
  })

  // Obtener todas las etiquetas de todos los tipos de gastos
  const allFixedTags = fixedExpenses
    .flatMap((e) => (e.tags || []))
    .filter((tag): tag is string => !!tag && tag.trim() !== '')
  const allSalaryTags = salaries
    .flatMap((s) => (s.tags || []))
    .filter((tag): tag is string => !!tag && tag.trim() !== '')
  const allExpenseTags = expenses
    .flatMap((e) => (e.tags || []))
    .filter((tag): tag is string => !!tag && tag.trim() !== '')
  
  const allTagsForFixed = Array.from(new Set([...allFixedTags, ...allExpenseTags, ...allSalaryTags])).sort()
  const allTagsForSalary = Array.from(new Set([...allSalaryTags, ...allExpenseTags, ...allFixedTags])).sort()

  const handleAddFixedTag = (tag: string) => {
    const trimmedTag = tag.trim()
    if (trimmedTag && !fixedFormData.tags.includes(trimmedTag)) {
      setFixedFormData({
        ...fixedFormData,
        tags: [...fixedFormData.tags, trimmedTag],
        newTag: '',
      })
    }
  }

  const handleRemoveFixedTag = (tagToRemove: string) => {
    setFixedFormData({
      ...fixedFormData,
      tags: fixedFormData.tags.filter((tag) => tag !== tagToRemove),
    })
  }

  const handleAddSalaryTag = (tag: string) => {
    const trimmedTag = tag.trim()
    if (trimmedTag && !salaryFormData.tags.includes(trimmedTag)) {
      setSalaryFormData({
        ...salaryFormData,
        tags: [...salaryFormData.tags, trimmedTag],
        newTag: '',
      })
    }
  }

  const handleRemoveSalaryTag = (tagToRemove: string) => {
    setSalaryFormData({
      ...salaryFormData,
      tags: salaryFormData.tags.filter((tag) => tag !== tagToRemove),
    })
  }

  const handleDateRangeChange = (range: DateRangePickerResult) => {
    setDateRange(range)
    // Actualizar URL con los nuevos parámetros
    if (range.start && range.end) {
      const params = new URLSearchParams({
        start: format(range.start, 'yyyy-MM-dd'),
        end: format(range.end, 'yyyy-MM-dd'),
      })
      router.push(`/finances/expenses?${params.toString()}`)
    }
  }

  // Asegurar que dateRange siempre tenga un valor válido
  const currentDateRange = dateRange || defaultRange

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
    
    // Si tiene IVA, el importe introducido es el total CON IVA, calculamos el base sin IVA
    // Si no tiene IVA (0%), el importe introducido es el base sin IVA
    if (ivaPercent > 0) {
      const base = total / (1 + ivaPercent / 100)
      const iva = total - base
      return { base, iva, total }
    } else {
      // Sin IVA, el importe introducido es el base
      return { base: total, iva: 0, total }
    }
  }

  const handleAddTag = (tag: string) => {
    const trimmedTag = tag.trim()
    if (trimmedTag && !formData.tags.includes(trimmedTag)) {
      setFormData({
        ...formData,
        tags: [...formData.tags, trimmedTag],
        newTag: '',
      })
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((tag) => tag !== tagToRemove),
    })
  }

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (!formData.expenseDateRange.start || !formData.expenseDateRange.end) {
      alert('Por favor selecciona un rango de fechas')
      setLoading(false)
      return
    }

    const { base, iva, total } = calculateBaseAndIva()

    try {
      const res = await fetch('/api/finances/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          date_start: formData.expenseDateRange.start.toISOString().split('T')[0],
          date_end: formData.expenseDateRange.end.toISOString().split('T')[0],
          base_amount: base,
          iva_amount: iva,
          total_amount: total,
          tags: formData.tags,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Error al crear gasto')
        setLoading(false)
        return
      }

      // Resetear formulario y cerrar modal
      setFormData({
        name: '',
        total_amount: '',
        tags: [],
        newTag: '',
        expenseDateRange: {
          start: new Date(),
          end: new Date(),
        },
        iva_percent: '21',
      })
      setIsModalOpen(false)
      router.reload()
    } catch (err) {
      alert('Error de conexión')
      setLoading(false)
    }
  }

  const handleSubmitFixedExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoadingFixed(true)

    try {
      const res = await fetch('/api/finances/expenses/fixed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fixedFormData.name,
          amount: parseFloat(fixedFormData.amount),
          has_iva: fixedFormData.has_iva,
          iva_percent: fixedFormData.has_iva ? parseFloat(fixedFormData.iva_percent) : null,
          is_active: fixedFormData.is_active,
          tags: fixedFormData.tags,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Error al crear gasto fijo')
        setLoadingFixed(false)
        return
      }

      setFixedFormData({
        name: '',
        amount: '',
        has_iva: false,
        iva_percent: '21',
        is_active: true,
        tags: [],
        newTag: '',
      })
      setIsFixedModalOpen(false)
      router.reload()
    } catch (err) {
      alert('Error de conexión')
      setLoadingFixed(false)
    }
  }

  const handleSubmitSalary = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoadingSalary(true)

    try {
      const res = await fetch('/api/finances/salaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_name: salaryFormData.person_name,
          amount: parseFloat(salaryFormData.amount),
          date: salaryFormData.date,
          notes: salaryFormData.notes || null,
          tags: salaryFormData.tags,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Error al crear nómina')
        setLoadingSalary(false)
        return
      }

      setSalaryFormData({
        person_name: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        notes: '',
        tags: [],
        newTag: '',
      })
      setIsSalaryModalOpen(false)
      router.reload()
    } catch (err) {
      alert('Error de conexión')
      setLoadingSalary(false)
    }
  }

  // Funciones para manejar eliminaciones
  const handleDeleteFixed = async () => {
    if (!deleteFixedId) return
    try {
      await fetch(`/api/finances/expenses/fixed/${deleteFixedId}`, {
        method: 'DELETE',
      })
      setDeleteFixedId(null)
      router.reload()
    } catch (err) {
      alert('Error al eliminar el gasto fijo')
    }
  }

  const handleDeleteExpense = async () => {
    if (!deleteExpenseId) return
    try {
      await fetch(`/api/finances/expenses/${deleteExpenseId}`, {
        method: 'DELETE',
      })
      setDeleteExpenseId(null)
      router.reload()
    } catch (err) {
      alert('Error al eliminar el gasto')
    }
  }

  const handleDeleteSalary = async () => {
    if (!deleteSalaryId) return
    try {
      await fetch(`/api/finances/salaries/${deleteSalaryId}`, {
        method: 'DELETE',
      })
      setDeleteSalaryId(null)
      router.reload()
    } catch (err) {
      alert('Error al eliminar la nómina')
    }
  }

  // Calcular totales
  const fixedTotal = fixedExpenses
    .filter((e) => e.is_active)
    .reduce((sum, e) => sum + e.amount, 0)
  const expensesTotal = expenses.reduce((sum, e) => sum + e.total_amount, 0)
  const expensesBaseTotal = expenses.reduce((sum, e) => sum + e.base_amount, 0)
  const salariesTotal = salaries.reduce((sum, s) => sum + s.amount, 0)
  const grandTotal = fixedTotal + expensesTotal + salariesTotal

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
              <h1 className="text-3xl font-bold text-gray-900">Gastos</h1>
              <p className="text-gray-600 mt-1">Gestión de todos los gastos - Filtrados por rango de fechas</p>
            </div>
          </div>
          <DateRangePicker onRangeChange={handleDateRangeChange} defaultRange={currentDateRange} />
        </div>

        {/* Resumen de totales - Estilo minimalista */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Gastos Fijos</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(fixedTotal)}</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Gastos Variables</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(expensesTotal)}</p>
              <p className="text-xs text-gray-400 mt-1">Base: {formatCurrency(expensesBaseTotal)}</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Nóminas</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(salariesTotal)}</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Total General</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(grandTotal)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs con botones - Estilo minimalista */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('fixed')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'fixed'
                ? 'border-b-2 border-gray-900 text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Gastos Fijos
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'manual'
                ? 'border-b-2 border-gray-900 text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Gastos Variables
          </button>
          <button
            onClick={() => setActiveTab('salaries')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'salaries'
                ? 'border-b-2 border-gray-900 text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Nóminas
          </button>
        </div>

          {/* Gastos Fijos */}
          {activeTab === 'fixed' && (
          <div className="space-y-4">
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-semibold">Gastos Fijos Mensuales</CardTitle>
                <Button size="sm" onClick={() => setIsFixedModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo
                </Button>
              </CardHeader>
              <CardContent>
                {fixedExpenses.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No hay gastos fijos registrados</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Nombre</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Sin IVA</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Con IVA</th>
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Etiquetas</th>
                          <th className="text-center p-3 font-medium text-sm text-gray-700">Estado</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fixedExpenses.map((expense) => {
                          // Si tiene IVA, el importe guardado es el total CON IVA incluido
                          // Si no tiene IVA, el importe guardado es el mismo para ambos
                          let amountWithoutIva: number
                          let amountWithIva: number
                          
                          if (expense.has_iva && expense.iva_percent) {
                            // El importe guardado es el total con IVA, calculamos el base sin IVA
                            const totalWithIva = Number(expense.amount)
                            const ivaPercent = Number(expense.iva_percent)
                            amountWithoutIva = totalWithIva / (1 + ivaPercent / 100)
                            amountWithIva = totalWithIva
                          } else {
                            // Sin IVA, el importe es el mismo
                            amountWithoutIva = Number(expense.amount)
                            amountWithIva = Number(expense.amount)
                          }
                          
                          return (
                            <tr key={expense.id} className="border-b hover:bg-gray-50">
                              <td className="p-3 text-sm text-gray-900">{expense.name}</td>
                              <td className="p-3 text-right text-sm text-gray-600">
                                {formatCurrency(amountWithoutIva)}
                              </td>
                              <td className="p-3 text-right text-sm font-medium text-gray-900">
                                {formatCurrency(amountWithIva)}
                              </td>
                            <td className="p-3">
                              {expense.tags && expense.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {expense.tags.map((tag: string) => (
                                    <Badge
                                      key={tag}
                                      variant="outline"
                                      className={`text-xs border ${getTagColor(tag)}`}
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant={expense.is_active ? 'default' : 'secondary'} className="text-xs">
                                {expense.is_active ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <div className="flex justify-end gap-1">
                                <Link href={`/finances/expenses/fixed/${expense.id}/edit`}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setDeleteFixedId(expense.id)}
                                >
                                  <Trash2 className="h-3 w-3 text-red-500" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Gastos Variables */}
        {activeTab === 'manual' && (
          <div className="space-y-4">
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">Gastos Variables</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">Gastos puntuales con fecha específica (freelancers, proveedores, servicios)</p>
                </div>
                <Button size="sm" onClick={() => setIsModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo
                </Button>
              </CardHeader>
              <CardContent>
                {expenses.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No hay gastos variables en el rango seleccionado</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Fecha</th>
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Concepto</th>
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Etiquetas</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Sin IVA</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Con IVA</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((expense) => (
                          <tr key={expense.id} className="border-b hover:bg-gray-50">
                            <td className="p-3 text-sm text-gray-600">
                              {expense.date_start && expense.date_end ? (
                                expense.date_start === expense.date_end ? (
                                  format(new Date(expense.date_start), 'dd MMM yyyy')
                                ) : (
                                  <>
                                    {format(new Date(expense.date_start), 'dd MMM')} - {format(new Date(expense.date_end), 'dd MMM yyyy')}
                                  </>
                                )
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="p-3 text-sm text-gray-900">{expense.name}</td>
                            <td className="p-3">
                              {expense.tags && expense.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {expense.tags.map((tag: string) => (
                                    <Badge
                                      key={tag}
                                      variant="outline"
                                      className={`text-xs border ${getTagColor(tag)}`}
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-3 text-right text-sm text-gray-600">
                              {formatCurrency(expense.base_amount)}
                            </td>
                            <td className="p-3 text-right text-sm font-medium text-gray-900">
                              {formatCurrency(expense.total_amount)}
                            </td>
                            <td className="p-3">
                              <div className="flex justify-end gap-1">
                                <Link href={`/finances/expenses/manual/${expense.id}/edit`}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setDeleteExpenseId(expense.id)}
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
          </div>
        )}

        {/* Nóminas */}
        {activeTab === 'salaries' && (
          <div className="space-y-4">
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-semibold">Nóminas / Pagos a Socios</CardTitle>
                <Button size="sm" onClick={() => setIsSalaryModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo
                </Button>
              </CardHeader>
              <CardContent>
                {salaries.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No hay nóminas este mes</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Fecha</th>
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Persona</th>
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Etiquetas</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Importe</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salaries.map((salary) => (
                          <tr key={salary.id} className="border-b hover:bg-gray-50">
                            <td className="p-3 text-sm text-gray-600">
                              {format(new Date(salary.date), 'dd MMM yyyy')}
                            </td>
                            <td className="p-3 text-sm text-gray-900">{salary.person_name}</td>
                            <td className="p-3">
                              {salary.tags && salary.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {salary.tags.map((tag: string) => (
                                    <Badge
                                      key={tag}
                                      variant="outline"
                                      className={`text-xs border ${getTagColor(tag)}`}
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-3 text-right text-sm font-medium text-gray-900">
                              {formatCurrency(salary.amount)}
                              <p className="text-xs text-gray-400 mt-0.5">Sin IVA</p>
                            </td>
                            <td className="p-3">
                              <div className="flex justify-end gap-1">
                                <Link href={`/finances/expenses/salaries/${salary.id}/edit`}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setDeleteSalaryId(salary.id)}
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
          </div>
        )}

        {/* Modal para añadir gasto variable */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto hide-scrollbar">
            <DialogHeader>
              <DialogTitle>Nuevo Gasto Variable</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitExpense} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Concepto *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Desarrollo web, Diseño..."
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="total_amount">Importe Total (€) *</Label>
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
                  <p className="text-xs text-gray-500">
                    {parseFloat(formData.iva_percent) > 0 
                      ? `Introduce el importe CON IVA incluido (${formData.iva_percent}%)`
                      : 'Introduce el importe sin IVA'}
                  </p>
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

              {/* Previsualización del cálculo */}
              {formData.total_amount && parseFloat(formData.total_amount) > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">Desglose del importe:</p>
                  {parseFloat(formData.iva_percent) > 0 ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Base sin IVA:</span>
                        <span className="font-medium">{formatCurrency(calculateBaseAndIva().base)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">IVA ({formData.iva_percent}%):</span>
                        <span className="font-medium">{formatCurrency(calculateBaseAndIva().iva)}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t border-gray-300">
                        <span className="text-gray-900 font-medium">Total con IVA:</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(calculateBaseAndIva().total)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total sin IVA:</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(calculateBaseAndIva().total)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Etiquetas</Label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={formData.newTag}
                      onChange={(e) => setFormData({ ...formData, newTag: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddTag(formData.newTag)
                        }
                      }}
                      placeholder="Escribe y presiona Enter para añadir"
                      list="tags-list"
                    />
                    <datalist id="tags-list">
                      {existingTags.map((tag) => (
                        <option key={tag} value={tag} />
                      ))}
                    </datalist>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleAddTag(formData.newTag)}
                      disabled={!formData.newTag.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* Etiquetas añadidas */}
                  {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-md bg-gray-50 min-h-[40px]">
                      {formData.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className={`flex items-center gap-1 pr-1 border ${getTagColor(tag)}`}
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-1 hover:text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Etiquetas existentes sugeridas */}
                  {existingTags.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">Etiquetas existentes:</p>
                      <div className="flex flex-wrap gap-2">
                        {existingTags.slice(0, 8).map((tag) => (
                          <Button
                            key={tag}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleAddTag(tag)}
                            disabled={formData.tags.includes(tag)}
                          >
                            {tag}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Rango de Fechas *</Label>
                <DateRangePicker
                  onRangeChange={(range) => {
                    setFormData({
                      ...formData,
                      expenseDateRange: range,
                    })
                  }}
                  defaultRange={formData.expenseDateRange}
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

        {/* Modal para añadir gasto fijo */}
        <Dialog open={isFixedModalOpen} onOpenChange={setIsFixedModalOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto hide-scrollbar">
            <DialogHeader>
              <DialogTitle>Nuevo Gasto Fijo</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitFixedExpense} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fixed_name">Nombre *</Label>
                <Input
                  id="fixed_name"
                  value={fixedFormData.name}
                  onChange={(e) => setFixedFormData({ ...fixedFormData, name: e.target.value })}
                  placeholder="Ej: Alquiler, Internet..."
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fixed_amount">Importe Mensual (€) *</Label>
                <Input
                  id="fixed_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={fixedFormData.amount}
                  onChange={(e) => setFixedFormData({ ...fixedFormData, amount: e.target.value })}
                  placeholder={fixedFormData.has_iva ? "Importe con IVA incluido" : "0.00"}
                  required
                />
                <p className="text-xs text-gray-500">
                  {fixedFormData.has_iva 
                    ? `Introduce el importe total CON IVA incluido (${fixedFormData.iva_percent}%)`
                    : 'Introduce el importe sin IVA'}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="fixed_has_iva"
                  checked={fixedFormData.has_iva}
                  onChange={(e) => setFixedFormData({ ...fixedFormData, has_iva: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="fixed_has_iva" className="cursor-pointer">
                  Tiene IVA
                </Label>
              </div>

              {fixedFormData.has_iva && (
                <div className="space-y-2">
                  <Label htmlFor="fixed_iva_percent">IVA %</Label>
                  <Input
                    id="fixed_iva_percent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={fixedFormData.iva_percent}
                    onChange={(e) => setFixedFormData({ ...fixedFormData, iva_percent: e.target.value })}
                  />
                </div>
              )}

              {/* Previsualización del cálculo para gastos fijos */}
              {fixedFormData.amount && parseFloat(fixedFormData.amount) > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">Desglose del importe:</p>
                  {fixedFormData.has_iva && parseFloat(fixedFormData.iva_percent) > 0 ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Base sin IVA:</span>
                        <span className="font-medium">
                          {formatCurrency(
                            parseFloat(fixedFormData.amount) / (1 + parseFloat(fixedFormData.iva_percent) / 100)
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">IVA ({fixedFormData.iva_percent}%):</span>
                        <span className="font-medium">
                          {formatCurrency(
                            parseFloat(fixedFormData.amount) - 
                            (parseFloat(fixedFormData.amount) / (1 + parseFloat(fixedFormData.iva_percent) / 100))
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t border-gray-300">
                        <span className="text-gray-900 font-medium">Total con IVA:</span>
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(parseFloat(fixedFormData.amount))}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total sin IVA:</span>
                      <span className="font-semibold text-gray-900">
                        {formatCurrency(parseFloat(fixedFormData.amount))}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="fixed_is_active"
                  checked={fixedFormData.is_active}
                  onChange={(e) => setFixedFormData({ ...fixedFormData, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="fixed_is_active" className="cursor-pointer">
                  Activo
                </Label>
              </div>

              <div className="space-y-2">
                <Label>Etiquetas</Label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={fixedFormData.newTag}
                      onChange={(e) => setFixedFormData({ ...fixedFormData, newTag: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddFixedTag(fixedFormData.newTag)
                        }
                      }}
                      placeholder="Escribe y presiona Enter para añadir"
                      list="fixed-tags-list"
                    />
                    <datalist id="fixed-tags-list">
                      {allTagsForFixed.map((tag) => (
                        <option key={tag} value={tag} />
                      ))}
                    </datalist>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleAddFixedTag(fixedFormData.newTag)}
                      disabled={!fixedFormData.newTag.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {fixedFormData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-md bg-gray-50 min-h-[40px]">
                      {fixedFormData.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className={`flex items-center gap-1 pr-1 border ${getTagColor(tag)}`}
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveFixedTag(tag)}
                            className="ml-1 hover:text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {allTagsForFixed.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">Etiquetas existentes:</p>
                      <div className="flex flex-wrap gap-2">
                        {allTagsForFixed.slice(0, 8).map((tag) => (
                          <Button
                            key={tag}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleAddFixedTag(tag)}
                            disabled={fixedFormData.tags.includes(tag)}
                          >
                            {tag}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsFixedModalOpen(false)}
                  disabled={loadingFixed}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loadingFixed}>
                  {loadingFixed ? 'Guardando...' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal para añadir nómina */}
        <Dialog open={isSalaryModalOpen} onOpenChange={setIsSalaryModalOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto hide-scrollbar">
            <DialogHeader>
              <DialogTitle>Nueva Nómina</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitSalary} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="salary_person">Persona *</Label>
                <Input
                  id="salary_person"
                  value={salaryFormData.person_name}
                  onChange={(e) => setSalaryFormData({ ...salaryFormData, person_name: e.target.value })}
                  placeholder="Nombre de la persona"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="salary_amount">Importe (€) *</Label>
                  <Input
                    id="salary_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={salaryFormData.amount}
                    onChange={(e) => setSalaryFormData({ ...salaryFormData, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary_date">Fecha *</Label>
                  <Input
                    id="salary_date"
                    type="date"
                    value={salaryFormData.date}
                    onChange={(e) => setSalaryFormData({ ...salaryFormData, date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="salary_notes">Notas</Label>
                <Input
                  id="salary_notes"
                  value={salaryFormData.notes}
                  onChange={(e) => setSalaryFormData({ ...salaryFormData, notes: e.target.value })}
                  placeholder="Notas adicionales (opcional)"
                />
              </div>

              <div className="space-y-2">
                <Label>Etiquetas</Label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={salaryFormData.newTag}
                      onChange={(e) => setSalaryFormData({ ...salaryFormData, newTag: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddSalaryTag(salaryFormData.newTag)
                        }
                      }}
                      placeholder="Escribe y presiona Enter para añadir"
                      list="salary-tags-list"
                    />
                    <datalist id="salary-tags-list">
                      {allTagsForSalary.map((tag) => (
                        <option key={tag} value={tag} />
                      ))}
                    </datalist>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleAddSalaryTag(salaryFormData.newTag)}
                      disabled={!salaryFormData.newTag.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {salaryFormData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-md bg-gray-50 min-h-[40px]">
                      {salaryFormData.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className={`flex items-center gap-1 pr-1 border ${getTagColor(tag)}`}
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveSalaryTag(tag)}
                            className="ml-1 hover:text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {allTagsForSalary.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">Etiquetas existentes:</p>
                      <div className="flex flex-wrap gap-2">
                        {allTagsForSalary.slice(0, 8).map((tag) => (
                          <Button
                            key={tag}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleAddSalaryTag(tag)}
                            disabled={salaryFormData.tags.includes(tag)}
                          >
                            {tag}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsSalaryModalOpen(false)}
                  disabled={loadingSalary}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loadingSalary}>
                  {loadingSalary ? 'Guardando...' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* AlertDialog para eliminar gasto fijo */}
        <AlertDialog open={deleteFixedId !== null} onOpenChange={(open) => !open && setDeleteFixedId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar gasto fijo?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El gasto fijo se eliminará permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteFixed} className="bg-red-600 hover:bg-red-700">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* AlertDialog para eliminar gasto variable */}
        <AlertDialog open={deleteExpenseId !== null} onOpenChange={(open) => !open && setDeleteExpenseId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar gasto?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El gasto se eliminará permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteExpense} className="bg-red-600 hover:bg-red-700">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* AlertDialog para eliminar nómina */}
        <AlertDialog open={deleteSalaryId !== null} onOpenChange={(open) => !open && setDeleteSalaryId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar nómina?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. La nómina se eliminará permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteSalary} className="bg-red-600 hover:bg-red-700">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  )
}

