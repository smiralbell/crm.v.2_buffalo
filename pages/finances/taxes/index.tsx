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
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { format, startOfQuarter, endOfQuarter, startOfYear, endOfYear, startOfDay, endOfDay } from 'date-fns'
import DateRangePicker, { DateRangePickerResult } from '@/components/DateRangePicker'

interface TaxesPageProps {
  dateRange: {
    start: string | null
    end: string | null
  }
  vatData: {
    repercutido: number
    soportado: number
    diferencia: number
  }
  corporateTax: {
    percent: number
    estimated: number
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
      // Por defecto: trimestre actual
      const now = new Date()
      startDate = startOfQuarter(now)
      endDate = endOfQuarter(now)
    }

    // IVA Repercutido (de ingresos)
    const incomesWithVat = await prisma.financialIncome.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        deleted_at: null,
      },
      select: { iva_amount: true },
    })
    const vatRepercutido = incomesWithVat.reduce((sum, i) => sum + Number(i.iva_amount), 0)

    // IVA Soportado (de gastos)
    const expensesWithVat = await prisma.expense.findMany({
      where: {
        OR: [
          { date_start: { gte: startDate, lte: endDate } },
          { date_end: { gte: startDate, lte: endDate } },
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

    const vatDiferencia = vatRepercutido - vatSoportado

    // Impuesto de sociedades
    const settings = await prisma.financialSettings.findUnique({
      where: { id: 1 },
    })
    const corporateTaxPercent = settings ? Number(settings.corporate_tax_percent) : 25

    // Calcular beneficio para estimar impuesto de sociedades
    const incomes = await prisma.financialIncome.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        deleted_at: null,
      },
      select: { base_amount: true },
    })
    const income = incomes.reduce((sum, i) => sum + Number(i.base_amount), 0)

    const expensesData = await prisma.expense.findMany({
      where: {
        OR: [
          { date_start: { gte: startDate, lte: endDate } },
          { date_end: { gte: startDate, lte: endDate } },
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

    const profit = income - expenses
    const estimatedCorporateTax = profit * (corporateTaxPercent / 100)

    return {
      props: {
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        vatData: {
          repercutido: vatRepercutido,
          soportado: vatSoportado,
          diferencia: vatDiferencia,
        },
        corporateTax: {
          percent: corporateTaxPercent,
          estimated: estimatedCorporateTax,
        },
      },
    }
  } catch (error: any) {
    console.error('Error loading taxes:', error)
    const now = new Date()
    return {
      props: {
        dateRange: {
          start: startOfQuarter(now).toISOString(),
          end: endOfQuarter(now).toISOString(),
        },
        vatData: {
          repercutido: 0,
          soportado: 0,
          diferencia: 0,
        },
        corporateTax: {
          percent: 25,
          estimated: 0,
        },
      },
    }
  }
}

export default function TaxesPage({ dateRange: initialDateRange, vatData, corporateTax }: TaxesPageProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [corporateTaxPercent, setCorporateTaxPercent] = useState(corporateTax.percent.toString())
  
  const now = new Date()
  const defaultRange: DateRangePickerResult = {
    start: startOfQuarter(now),
    end: endOfQuarter(now),
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
      router.push(`/finances/taxes?${params.toString()}`)
    }
  }

  const handleSaveCorporateTax = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/finances/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corporate_tax_percent: parseFloat(corporateTaxPercent),
        }),
      })

      if (!res.ok) {
        alert('Error al guardar')
        setLoading(false)
        return
      }

      router.reload()
    } catch (err) {
      alert('Error de conexión')
      setLoading(false)
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
              <h1 className="text-3xl font-bold text-gray-900">Impuestos</h1>
              <p className="text-gray-600 mt-1">IVA e Impuesto de Sociedades - Filtrados por rango de fechas</p>
            </div>
          </div>
          <DateRangePicker onRangeChange={handleDateRangeChange} defaultRange={currentDateRange} />
        </div>

        {/* IVA */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">IVA (Impuesto sobre el Valor Añadido)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">IVA Repercutido</p>
                <p className="text-2xl font-semibold text-gray-900">{formatCurrency(vatData.repercutido)}</p>
                <p className="text-xs text-gray-400">De facturas emitidas</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">IVA Soportado</p>
                <p className="text-2xl font-semibold text-gray-900">{formatCurrency(vatData.soportado)}</p>
                <p className="text-xs text-gray-400">De gastos</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">
                  {vatData.diferencia >= 0 ? 'IVA a Pagar' : 'IVA a Devolver'}
                </p>
                <p className={`text-2xl font-semibold ${vatData.diferencia >= 0 ? 'text-gray-900' : 'text-green-600'}`}>
                  {formatCurrency(Math.abs(vatData.diferencia))}
                </p>
                <p className="text-xs text-gray-400">
                  {vatData.diferencia >= 0 ? 'Diferencia a pagar' : 'Diferencia a devolver'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Impuesto de Sociedades */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Impuesto de Sociedades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="corporate_tax_percent">Porcentaje de Impuesto de Sociedades (%)</Label>
                  <Input
                    id="corporate_tax_percent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={corporateTaxPercent}
                    onChange={(e) => setCorporateTaxPercent(e.target.value)}
                    className="max-w-[200px]"
                  />
                </div>
                <Button onClick={handleSaveCorporateTax} disabled={loading}>
                  <Save className="mr-2 h-4 w-4" />
                  {loading ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
              <div className="pt-4 border-t">
                <p className="text-sm font-medium text-gray-500 mb-2">Impuesto Estimado del Período</p>
                <p className="text-2xl font-semibold text-gray-900">{formatCurrency(corporateTax.estimated)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Calculado sobre el beneficio del período seleccionado
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

