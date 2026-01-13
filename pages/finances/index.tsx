import { GetServerSideProps } from 'next'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
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
  Filter,
  Upload,
  ArrowUp,
  ArrowDown,
  Loader2
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
    currentBalance: number
    income: number
    expenses: number
    profit: number
    estimatedCorporateTax: number
    ebitda: number
  }
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  // Durante el build, si DATABASE_URL no está disponible, retornar datos por defecto
  if (!process.env.DATABASE_URL && process.env.NEXT_PHASE === 'phase-production-build') {
    const now = new Date()
    return {
      props: {
        dateRange: {
          start: startOfMonth(now).toISOString(),
          end: endOfMonth(now).toISOString(),
        },
        stats: {
          currentBalance: 0,
          income: 0,
          expenses: 0,
          profit: 0,
          estimatedCorporateTax: 0,
          ebitda: 0,
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

    // Calcular desde bank_transactions (datos reales) con filtro de fechas
    // Dinero actual en cuenta: saldo del último movimiento dentro del período (más reciente)
    const balanceResult = await query<{ balance: number }>(
      `SELECT balance
       FROM bank_transactions
       WHERE balance IS NOT NULL
         AND date >= $1 AND date <= $2
       ORDER BY date DESC, created_at DESC
       LIMIT 1`,
      [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    )
    const currentBalance = balanceResult.rows[0]?.balance 
      ? Number(balanceResult.rows[0].balance) 
      : 0

    // Ingresos del período: suma de transacciones positivas en el rango de fechas
    const incomeResult = await query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM bank_transactions
       WHERE date >= $1 AND date <= $2 AND amount > 0`,
      [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    )
    const income = Number(incomeResult.rows[0]?.total || 0)

    // Gastos del período: suma de transacciones negativas en el rango de fechas
    const expensesResult = await query<{ total: number }>(
      `SELECT COALESCE(ABS(SUM(amount)), 0) as total
       FROM bank_transactions
       WHERE date >= $1 AND date <= $2 AND amount < 0`,
      [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    )
    const expenses = Number(expensesResult.rows[0]?.total || 0)

    // Beneficio del período: ingresos - gastos
    const profit = income - expenses

    // Impuesto de sociedades estimado (15% del beneficio)
    const estimatedCorporateTax = (profit * 15) / 100

    // EBITDA = Beneficio + Impuestos (simplificado)
    const ebitda = profit + estimatedCorporateTax

    return {
      props: {
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        stats: {
          currentBalance,
          income,
          expenses,
          profit,
          estimatedCorporateTax,
          ebitda,
        },
      },
    }
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ERROR] Error loading financial dashboard:', error)
    }
    const now = new Date()
    return {
      props: {
        dateRange: {
          start: startOfMonth(now).toISOString(),
          end: endOfMonth(now).toISOString(),
        },
        stats: {
          currentBalance: 0,
          income: 0,
          expenses: 0,
          profit: 0,
          estimatedCorporateTax: 0,
          ebitda: 0,
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
  const [lastStatementDate, setLastStatementDate] = useState<string | null>(null)
  const [loadingLastDate, setLoadingLastDate] = useState(true)
  const [transactions, setTransactions] = useState<Array<{
    id: string
    date: string
    amount: number
    description: string
    balance: number | null
    account_name: string
    iban: string
  }>>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Cargar la fecha del último extracto
    const fetchLastStatement = async () => {
      try {
        const response = await fetch('/api/finance/latest-statement')
        const data = await response.json()
        
        if (data.has_statements && data.last_date) {
          const date = new Date(data.last_date)
          setLastStatementDate(format(date, 'dd/MM/yyyy'))
        }
      } catch (error) {
        console.error('Error loading last statement:', error)
      } finally {
        setLoadingLastDate(false)
      }
    }

    fetchLastStatement()
  }, [])

  // Cargar movimientos iniciales y cuando cambie el rango de fechas
  useEffect(() => {
    setOffset(0)
    setHasMore(true)
    loadTransactions(0)
  }, [dateRange])

  const loadTransactions = useCallback(async (currentOffset: number) => {
    if (loadingTransactions || !hasMore) return

    setLoadingTransactions(true)
    try {
      // Construir URL con filtro de fechas si está presente
      let url = `/api/finance/recent-transactions?limit=10&offset=${currentOffset}`
      if (dateRange.start && dateRange.end) {
        url += `&start_date=${format(dateRange.start, 'yyyy-MM-dd')}&end_date=${format(dateRange.end, 'yyyy-MM-dd')}`
      }
      
      const response = await fetch(url)
      const data = await response.json()
      
      if (response.ok) {
        if (currentOffset === 0) {
          setTransactions(data.transactions)
        } else {
          setTransactions(prev => [...prev, ...data.transactions])
        }
        setHasMore(data.hasMore)
        setOffset(currentOffset + data.transactions.length)
      }
    } catch (error) {
      console.error('Error loading transactions:', error)
    } finally {
      setLoadingTransactions(false)
    }
  }, [loadingTransactions, hasMore, dateRange])

  // Infinite scroll con Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingTransactions) {
          loadTransactions(offset)
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMore, loadingTransactions, offset, loadTransactions])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const handleDateRangeChange = (range: DateRangePickerResult) => {
    setDateRange(range)
    // Resetear transacciones cuando cambia el rango
    setOffset(0)
    setHasMore(true)
    // Actualizar URL con los nuevos parámetros
    if (range.start && range.end) {
      const params = new URLSearchParams({
        start: format(range.start, 'yyyy-MM-dd'),
        end: format(range.end, 'yyyy-MM-dd'),
      })
      router.push(`/finances?${params.toString()}`)
    } else {
      router.push('/finances')
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
          <div className="flex items-center gap-4">
            <Link href="/finanzas/importar">
              <Button className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Nuevo Extracto
              </Button>
            </Link>
            {!loadingLastDate && lastStatementDate && (
              <p className="text-sm text-gray-600">
                Último extracto: <span className="font-semibold text-gray-900">{lastStatementDate}</span>
              </p>
            )}
          </div>
          <DateRangePicker onRangeChange={handleDateRangeChange} defaultRange={dateRange} />
        </div>

        {/* Stats Cards - Estilo minimalista */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Dinero Actual en Cuenta</p>
              <div className="text-2xl font-semibold text-gray-900 mb-1">
                {formatCurrency(stats.currentBalance)}
              </div>
              <p className="text-xs text-gray-400">Saldo total</p>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Ingresos</p>
              <div className="text-2xl font-semibold text-green-600 mb-1">
                {formatCurrency(stats.income)}
              </div>
              <p className="text-xs text-gray-400">Del período</p>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Gastos</p>
              <div className="text-2xl font-semibold text-red-600 mb-1">
                {formatCurrency(stats.expenses)}
              </div>
              <p className="text-xs text-gray-400">Del período</p>
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
              <p className="text-sm font-medium text-gray-500 mb-2">Imp. Sociedades Est.</p>
              <div className="text-2xl font-semibold text-gray-900 mb-1">
                {formatCurrency(stats.estimatedCorporateTax)}
              </div>
              <p className="text-xs text-gray-400">15% del beneficio</p>
            </CardContent>
          </Card>
        </div>

        {/* EBITDA Card */}
        <div className="grid gap-4 md:grid-cols-1">
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">EBITDA</p>
              <div className="text-2xl font-semibold text-gray-900 mb-1">
                {formatCurrency(stats.ebitda)}
              </div>
              <p className="text-xs text-gray-400">Beneficio + Impuestos</p>
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

        {/* Historial de Movimientos */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Historial de Movimientos</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 && !loadingTransactions ? (
              <div className="text-center py-12 text-gray-500">
                No hay movimientos disponibles
              </div>
            ) : (
              <div className="space-y-2">
                {/* Headers */}
                <div className="flex items-center justify-between pb-2 border-b border-gray-200 font-semibold text-sm text-gray-600">
                  <div className="flex-1">Movimiento</div>
                  <div className="flex items-center gap-4">
                    <div className="text-right min-w-[100px]">Importe</div>
                    <div className="text-right min-w-[100px]">Saldo</div>
                  </div>
                </div>
                {transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between py-3 px-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className={`flex-shrink-0 ${
                          transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {transaction.amount >= 0 ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {transaction.description || '-'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500">
                              {format(new Date(transaction.date), 'dd/MM/yyyy')}
                            </p>
                            {transaction.account_name && (
                              <>
                                <span className="text-gray-300">•</span>
                                <p className="text-xs text-gray-500 truncate">
                                  {transaction.account_name}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`text-right font-semibold ${
                        transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(transaction.amount)}
                      </div>
                      <div className="text-right font-medium text-gray-700 min-w-[100px]">
                        {transaction.balance !== null && transaction.balance !== undefined 
                          ? formatCurrency(transaction.balance) 
                          : '-'}
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Target para infinite scroll */}
                <div ref={observerTarget} className="h-10 flex items-center justify-center py-4">
                  {loadingTransactions && (
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

