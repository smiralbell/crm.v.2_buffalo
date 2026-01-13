import { GetServerSideProps } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import DateRangePicker, { DateRangePickerResult } from '@/components/DateRangePicker'

interface ExpensesPageProps {
  expenses: Array<{
    id: string
    date: string
    amount: number
    description: string
    account_name: string
  }>
  recurringExpenses: Array<{
    description: string
    frequency: string
    averageAmount: number
    count: number
    lastDate: string
  }>
  dateRange?: {
    start: string | null
    end: string | null
  }
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  // Durante el build, si DATABASE_URL no está disponible, retornar datos por defecto
  if (!process.env.DATABASE_URL && process.env.NEXT_PHASE === 'phase-production-build') {
    const now = new Date()
    return {
      props: {
        expenses: [],
        recurringExpenses: [],
        dateRange: {
          start: startOfMonth(now).toISOString(),
          end: endOfMonth(now).toISOString(),
        },
      },
    }
  }

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

    // Obtener gastos desde bank_transactions (datos reales)
    const expensesResult = await query<{
      id: string
      date: string
      amount: number
      description: string
      account_name: string
    }>(
      `SELECT 
        bt.id,
        bt.date,
        bt.amount,
        bt.description,
        ba.name as account_name
       FROM bank_transactions bt
       JOIN bank_accounts ba ON bt.account_id = ba.id
       WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount < 0
       ORDER BY bt.date DESC`,
      [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    )

    // Detectar gastos recurrentes: agrupar por descripción normalizada y analizar frecuencia
    const expensesByDescription = new Map<string, Array<{ date: string; amount: number }>>()
    
    expensesResult.rows.forEach((expense) => {
      const normalizedDesc = expense.description
        .toUpperCase()
        .trim()
        .replace(/\s+/g, ' ')
      
      if (!expensesByDescription.has(normalizedDesc)) {
        expensesByDescription.set(normalizedDesc, [])
      }
      expensesByDescription.get(normalizedDesc)!.push({
        date: expense.date,
        amount: Math.abs(Number(expense.amount))
      })
    })

    // Identificar gastos recurrentes (más de 1 ocurrencia)
    const recurringExpenses: Array<{
      description: string
      frequency: string
      averageAmount: number
      count: number
      lastDate: string
    }> = []

    expensesByDescription.forEach((occurrences, description) => {
      if (occurrences.length > 1) {
        // Ordenar por fecha
        occurrences.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        
        // Calcular frecuencia promedio
        const dates = occurrences.map(o => new Date(o.date).getTime())
        const intervals: number[] = []
        for (let i = 1; i < dates.length; i++) {
          intervals.push(dates[i] - dates[i - 1])
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
        const avgIntervalDays = avgInterval / (1000 * 60 * 60 * 24)
        
        let frequency = 'Variable'
        if (avgIntervalDays >= 25 && avgIntervalDays <= 35) {
          frequency = 'Mensual'
        } else if (avgIntervalDays >= 85 && avgIntervalDays <= 95) {
          frequency = 'Trimestral'
        } else if (avgIntervalDays >= 175 && avgIntervalDays <= 185) {
          frequency = 'Semestral'
        } else if (avgIntervalDays >= 360 && avgIntervalDays <= 370) {
          frequency = 'Anual'
        }

        const averageAmount = occurrences.reduce((sum, o) => sum + o.amount, 0) / occurrences.length

        recurringExpenses.push({
          description,
          frequency,
          averageAmount,
          count: occurrences.length,
          lastDate: occurrences[occurrences.length - 1].date
        })
      }
    })

    // Ordenar gastos recurrentes por frecuencia de ocurrencia
    recurringExpenses.sort((a, b) => b.count - a.count)

    return {
      props: {
        expenses: expensesResult.rows.map((e) => ({
          id: e.id,
          date: e.date,
          amount: Math.abs(Number(e.amount)),
          description: e.description,
          account_name: e.account_name,
        })),
        recurringExpenses,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      },
    }
  } catch (error: any) {
    // Solo loguear errores críticos
    if (process.env.NODE_ENV === 'development') {
      console.error('[ERROR] Error loading expenses:', error)
    }
    const now = new Date()
    return {
      props: {
        expenses: [],
        recurringExpenses: [],
        dateRange: {
          start: startOfMonth(now).toISOString(),
          end: endOfMonth(now).toISOString(),
        },
      },
    }
  }
}

export default function ExpensesPage({ expenses, recurringExpenses, dateRange: initialDateRange }: ExpensesPageProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('all')
  
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

  // Función para formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount)
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
  const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0)
  const recurringTotal = recurringExpenses.reduce((sum, r) => sum + r.averageAmount, 0)

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
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Total Gastos del Período</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(expensesTotal)}</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Gastos Recurrentes Detectados</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(recurringTotal)}</p>
              <p className="text-xs text-gray-400 mt-1">{recurringExpenses.length} patrones detectados</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs con botones - Estilo minimalista */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'border-b-2 border-gray-900 text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Todos los Gastos
          </button>
          <button
            onClick={() => setActiveTab('recurring')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'recurring'
                ? 'border-b-2 border-gray-900 text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Gastos Recurrentes
          </button>
        </div>

        {/* Todos los Gastos */}
        {activeTab === 'all' && (
          <div className="space-y-4">
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Todos los Gastos del Período</CardTitle>
              </CardHeader>
              <CardContent>
                {expenses.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No hay gastos en el rango seleccionado</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Fecha</th>
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Descripción</th>
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Cuenta</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((expense) => (
                          <tr key={expense.id} className="border-b hover:bg-gray-50">
                            <td className="p-3 text-sm text-gray-600">
                              {format(new Date(expense.date), 'dd/MM/yyyy')}
                            </td>
                            <td className="p-3 text-sm text-gray-900">{expense.description || '-'}</td>
                            <td className="p-3 text-sm text-gray-600">{expense.account_name || '-'}</td>
                            <td className="p-3 text-right text-sm font-medium text-red-600">
                              {formatCurrency(expense.amount)}
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

        {/* Gastos Recurrentes */}
        {activeTab === 'recurring' && (
          <div className="space-y-4">
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Gastos Recurrentes Detectados</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Gastos que se repiten periódicamente basados en el concepto
                </p>
              </CardHeader>
              <CardContent>
                {recurringExpenses.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No se detectaron gastos recurrentes</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Concepto</th>
                          <th className="text-center p-3 font-medium text-sm text-gray-700">Frecuencia</th>
                          <th className="text-right p-3 font-medium text-sm text-gray-700">Importe Promedio</th>
                          <th className="text-center p-3 font-medium text-sm text-gray-700">Ocurrencias</th>
                          <th className="text-left p-3 font-medium text-sm text-gray-700">Última Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recurringExpenses.map((recurring, index) => (
                          <tr key={index} className="border-b hover:bg-gray-50">
                            <td className="p-3 text-sm text-gray-900">{recurring.description}</td>
                            <td className="p-3 text-center">
                              <Badge variant="outline" className="text-xs">
                                {recurring.frequency}
                              </Badge>
                            </td>
                            <td className="p-3 text-right text-sm font-medium text-red-600">
                              {formatCurrency(recurring.averageAmount)}
                            </td>
                            <td className="p-3 text-center text-sm text-gray-600">
                              {recurring.count}
                            </td>
                            <td className="p-3 text-sm text-gray-600">
                              {format(new Date(recurring.lastDate), 'dd/MM/yyyy')}
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

      </div>
    </Layout>
  )
}
