import { GetServerSideProps } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Receipt,
  ArrowRight,
  Calendar,
  Filter
} from 'lucide-react'
import Link from 'next/link'
import { format, startOfMonth, endOfMonth, startOfYear, startOfDay, endOfDay } from 'date-fns'
import DateRangePicker, { DateRangePickerResult } from '@/components/DateRangePicker'

interface DashboardProps {
  dateRange: {
    start: string | null
    end: string | null
  }
  stats: {
    income: number
    expenses: number
    profit: number
    vat: number
    estimatedCorporateTax: number
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

    // Ingresos del período (sin IVA)
    const incomes = await prisma.financialIncome.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        deleted_at: null,
      },
      select: { base_amount: true },
    })
    const income = incomes.reduce((sum, i) => sum + Number(i.base_amount), 0)

    // Gastos del período (sin IVA) - usando rango de fechas
    const expensesData = await prisma.expense.findMany({
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
      select: { base_amount: true },
    })
    
    // Gastos fijos: calcular cuántos meses cubre el rango
    const monthsDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
    const fixedExpenses = await prisma.fixedExpense.findMany({
      where: {
        is_active: true,
        deleted_at: null,
      },
      select: { amount: true },
    })
    const fixedExpensesAmount = fixedExpenses.reduce((sum, f) => sum + Number(f.amount), 0) * Math.max(1, monthsDiff)
    
    const salaries = await prisma.salary.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        deleted_at: null,
      },
      select: { amount: true },
    })
    const salariesAmount = salaries.reduce((sum, s) => sum + Number(s.amount), 0)
    
    const expenses = expensesData.reduce((sum, e) => sum + Number(e.base_amount), 0) 
      + fixedExpensesAmount 
      + salariesAmount

    // Beneficio del período
    const profit = income - expenses

    // IVA del período
    const incomesWithVat = await prisma.financialIncome.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        deleted_at: null,
      },
      select: { iva_amount: true },
    })
    const vatRepercutido = incomesWithVat.reduce((sum, i) => sum + Number(i.iva_amount), 0)

    const expensesWithVat = await prisma.expense.findMany({
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
      select: { iva_amount: true },
    })
    const vatSoportado = expensesWithVat.reduce((sum, e) => sum + Number(e.iva_amount), 0)
    
    const vat = vatRepercutido - vatSoportado

    // Impuesto de sociedades estimado (sobre el beneficio del período)
    const settings = await prisma.financialSettings.findUnique({
      where: { id: 1 },
    })
    const corporateTaxPercent = settings ? Number(settings.corporate_tax_percent) : 25
    const estimatedCorporateTax = (profit * corporateTaxPercent) / 100

    return {
      props: {
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        stats: {
          income,
          expenses,
          profit,
          vat,
          estimatedCorporateTax,
        },
      },
    }
  } catch (error: any) {
    console.error('Error loading financial dashboard:', error)
    const now = new Date()
    return {
      props: {
        dateRange: {
          start: startOfMonth(now).toISOString(),
          end: endOfMonth(now).toISOString(),
        },
        stats: {
          income: 0,
          expenses: 0,
          profit: 0,
          vat: 0,
          estimatedCorporateTax: 0,
        },
      },
    }
  }
}

export default function FinancesDashboard({ dateRange: initialDateRange, stats }: DashboardProps) {
  const router = useRouter()
  const [dateRange, setDateRange] = useState<DateRangePickerResult>({
    start: initialDateRange.start ? new Date(initialDateRange.start) : null,
    end: initialDateRange.end ? new Date(initialDateRange.end) : null,
  })

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
      router.push(`/finances?${params.toString()}`)
    }
  }

  const quickLinks = [
    { href: '/finances/expenses', label: 'Gastos', icon: TrendingDown, color: 'text-red-600' },
    { href: '/finances/incomes', label: 'Ingresos', icon: TrendingUp, color: 'text-green-600' },
    { href: '/finances/taxes', label: 'Impuestos', icon: Receipt, color: 'text-blue-600' },
    { href: '/finances/results', label: 'Resultados', icon: DollarSign, color: 'text-purple-600' },
  ]

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Finanzas</h1>
            <p className="text-gray-600 mt-1">Dashboard financiero - Gestión visual y manual</p>
          </div>
          <DateRangePicker onRangeChange={handleDateRangeChange} defaultRange={dateRange} />
        </div>

        {/* Stats Cards - Estilo minimalista */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Ingresos</p>
              <div className="text-2xl font-semibold text-gray-900 mb-1">
                {formatCurrency(stats.income)}
              </div>
              <p className="text-xs text-gray-400">Sin IVA</p>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Gastos</p>
              <div className="text-2xl font-semibold text-gray-900 mb-1">
                {formatCurrency(stats.expenses)}
              </div>
              <p className="text-xs text-gray-400">Sin IVA</p>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Beneficio</p>
              <div className={`text-2xl font-semibold mb-1 ${stats.profit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {formatCurrency(stats.profit)}
              </div>
              <p className="text-xs text-gray-400">Ingresos - Gastos</p>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">IVA</p>
              <div className={`text-2xl font-semibold mb-1 ${stats.vat >= 0 ? 'text-gray-900' : 'text-green-600'}`}>
                {formatCurrency(stats.vat)}
              </div>
              <p className="text-xs text-gray-400">
                {stats.vat >= 0 ? 'A pagar' : 'A devolver'}
              </p>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Imp. Sociedades Est.</p>
              <div className="text-2xl font-semibold text-gray-900 mb-1">
                {formatCurrency(stats.estimatedCorporateTax)}
              </div>
              <p className="text-xs text-gray-400">Estimación del período</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links - Estilo minimalista */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link key={link.href} href={link.href}>
                <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-2">
                          {link.label}
                        </p>
                        <Icon className="h-6 w-6 text-gray-400" />
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

        {/* Placeholder para gráficos futuros */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Ingresos vs Gastos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-gray-400">
                <p className="text-sm">Gráfico de barras - Próximamente</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Beneficio Acumulado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-gray-400">
                <p className="text-sm">Gráfico de línea - Próximamente</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  )
}

