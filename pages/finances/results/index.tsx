import { GetServerSideProps } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay } from 'date-fns'
import DateRangePicker, { DateRangePickerResult } from '@/components/DateRangePicker'

interface ResultsPageProps {
  dateRange: {
    start: string | null
    end: string | null
  }
  monthlyData: Array<{
    month: string
    income: number
    expenses: number
    profit: number
    corporateTax: number
    netProfit: number
  }>
  totals: {
    totalIncome: number
    totalExpenses: number
    totalProfit: number
    totalCorporateTax: number
    totalNetProfit: number
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
      startDate = startOfYear(now)
      endDate = endOfYear(now)
    }

    // Obtener configuración de impuesto de sociedades
    const settings = await prisma.financialSettings.findUnique({
      where: { id: 1 },
    })
    const corporateTaxPercent = settings ? Number(settings.corporate_tax_percent) : 25

    // Calcular datos mensuales
    const monthlyData = []
    const currentDate = new Date(startDate)
    
    while (currentDate <= endDate) {
      const monthStart = startOfMonth(currentDate)
      const monthEnd = endOfMonth(currentDate)
      
      // Ingresos del mes
      const incomes = await prisma.financialIncome.findMany({
        where: {
          date: { gte: monthStart, lte: monthEnd },
          deleted_at: null,
        },
        select: { base_amount: true },
      })
      const income = incomes.reduce((sum, i) => sum + Number(i.base_amount), 0)

      // Gastos del mes
      const expensesData = await prisma.expense.findMany({
        where: {
          OR: [
            { date_start: { gte: monthStart, lte: monthEnd } },
            { date_end: { gte: monthStart, lte: monthEnd } },
            {
              AND: [
                { date_start: { lte: monthStart } },
                { date_end: { gte: monthEnd } },
              ],
            },
          ],
          deleted_at: null,
        },
        select: { base_amount: true },
      })
      
      const fixedExpenses = await prisma.fixedExpense.findMany({
        where: {
          is_active: true,
          deleted_at: null,
        },
        select: { amount: true },
      })
      const fixedExpensesAmount = fixedExpenses.reduce((sum, f) => sum + Number(f.amount), 0)
      
      const salaries = await prisma.salary.findMany({
        where: {
          date: { gte: monthStart, lte: monthEnd },
          deleted_at: null,
        },
        select: { amount: true },
      })
      const salariesAmount = salaries.reduce((sum, s) => sum + Number(s.amount), 0)
      
      const expenses = expensesData.reduce((sum, e) => sum + Number(e.base_amount), 0) 
        + fixedExpensesAmount 
        + salariesAmount

      const profit = income - expenses
      const corporateTax = profit * (corporateTaxPercent / 100)
      const netProfit = profit - corporateTax

      monthlyData.push({
        month: format(monthStart, 'MMM yyyy'),
        income,
        expenses,
        profit,
        corporateTax,
        netProfit,
      })

      // Avanzar al siguiente mes
      currentDate.setMonth(currentDate.getMonth() + 1)
    }

    // Calcular totales
    const totals = monthlyData.reduce(
      (acc, month) => ({
        totalIncome: acc.totalIncome + month.income,
        totalExpenses: acc.totalExpenses + month.expenses,
        totalProfit: acc.totalProfit + month.profit,
        totalCorporateTax: acc.totalCorporateTax + month.corporateTax,
        totalNetProfit: acc.totalNetProfit + month.netProfit,
      }),
      {
        totalIncome: 0,
        totalExpenses: 0,
        totalProfit: 0,
        totalCorporateTax: 0,
        totalNetProfit: 0,
      }
    )

    return {
      props: {
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        monthlyData,
        totals,
      },
    }
  } catch (error: any) {
    console.error('Error loading results:', error)
    const now = new Date()
    return {
      props: {
        dateRange: {
          start: startOfYear(now).toISOString(),
          end: endOfYear(now).toISOString(),
        },
        monthlyData: [],
        totals: {
          totalIncome: 0,
          totalExpenses: 0,
          totalProfit: 0,
          totalCorporateTax: 0,
          totalNetProfit: 0,
        },
      },
    }
  }
}

export default function ResultsPage({ dateRange: initialDateRange, monthlyData, totals }: ResultsPageProps) {
  const router = useRouter()
  const now = new Date()
  const defaultRange: DateRangePickerResult = {
    start: startOfYear(now),
    end: endOfYear(now),
  }

  const [dateRange, setDateRange] = useState<DateRangePickerResult>(
    initialDateRange?.start && initialDateRange?.end
      ? {
          start: new Date(initialDateRange.start),
          end: new Date(initialDateRange.end),
        }
      : defaultRange
  )

  const handleDateRangeChange = (range: DateRangePickerResult) => {
    setDateRange(range)
    if (range.start && range.end) {
      const params = new URLSearchParams({
        start: format(range.start, 'yyyy-MM-dd'),
        end: format(range.end, 'yyyy-MM-dd'),
      })
      router.push(`/finances/results?${params.toString()}`)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const currentDateRange = dateRange || defaultRange

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
              <h1 className="text-3xl font-bold text-gray-900">Resultados</h1>
              <p className="text-gray-600 mt-1">Análisis de beneficios y resultados financieros</p>
            </div>
          </div>
          <DateRangePicker onRangeChange={handleDateRangeChange} defaultRange={currentDateRange} />
        </div>

        {/* Resumen de totales */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Ingresos</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(totals.totalIncome)}</p>
              <p className="text-xs text-gray-400 mt-1">Sin IVA</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Gastos</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(totals.totalExpenses)}</p>
              <p className="text-xs text-gray-400 mt-1">Sin IVA</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Beneficio Bruto</p>
              <p className={`text-2xl font-semibold mb-1 ${totals.totalProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {formatCurrency(totals.totalProfit)}
              </p>
              <p className="text-xs text-gray-400">Ingresos - Gastos</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Imp. Sociedades</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(totals.totalCorporateTax)}</p>
              <p className="text-xs text-gray-400 mt-1">Estimado</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Beneficio Neto</p>
              <p className={`text-2xl font-semibold mb-1 ${totals.totalNetProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {formatCurrency(totals.totalNetProfit)}
              </p>
              <p className="text-xs text-gray-400">Después de impuestos</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabla mensual */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Desglose Mensual</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No hay datos para el período seleccionado</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-3 font-medium text-sm text-gray-700">Mes</th>
                      <th className="text-right p-3 font-medium text-sm text-gray-700">Ingresos</th>
                      <th className="text-right p-3 font-medium text-sm text-gray-700">Gastos</th>
                      <th className="text-right p-3 font-medium text-sm text-gray-700">Beneficio Bruto</th>
                      <th className="text-right p-3 font-medium text-sm text-gray-700">Imp. Sociedades</th>
                      <th className="text-right p-3 font-medium text-sm text-gray-700">Beneficio Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((month, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-sm font-medium text-gray-900">{month.month}</td>
                        <td className="p-3 text-right text-sm text-gray-600">{formatCurrency(month.income)}</td>
                        <td className="p-3 text-right text-sm text-gray-600">{formatCurrency(month.expenses)}</td>
                        <td className={`p-3 text-right text-sm font-medium ${month.profit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                          {formatCurrency(month.profit)}
                        </td>
                        <td className="p-3 text-right text-sm text-gray-600">{formatCurrency(month.corporateTax)}</td>
                        <td className={`p-3 text-right text-sm font-medium ${month.netProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                          {formatCurrency(month.netProfit)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <td className="p-3 text-sm text-gray-900">Total</td>
                      <td className="p-3 text-right text-sm text-gray-900">{formatCurrency(totals.totalIncome)}</td>
                      <td className="p-3 text-right text-sm text-gray-900">{formatCurrency(totals.totalExpenses)}</td>
                      <td className={`p-3 text-right text-sm ${totals.totalProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                        {formatCurrency(totals.totalProfit)}
                      </td>
                      <td className="p-3 text-right text-sm text-gray-900">{formatCurrency(totals.totalCorporateTax)}</td>
                      <td className={`p-3 text-right text-sm ${totals.totalNetProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                        {formatCurrency(totals.totalNetProfit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

