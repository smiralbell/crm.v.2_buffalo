import { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { getBankConnectionStatus, type BankConnectionStatus } from '@/lib/enable-banking/connection-status'
import { getLatestFinanceAiAnalysis } from '@/lib/finance/ai-analysis'
import type { ExecutiveSummary, FinanceAiSummary } from '@/lib/finance/types'
import FinanceAlertsPanel from '@/components/finances/FinanceAlertsPanel'
import FinanceAiPanel from '@/components/finances/FinanceAiPanel'
import FinanceKpiCard from '@/components/finances/FinanceKpiCard'
import AnnualGoalCard from '@/components/finances/AnnualGoalCard'
import PeriodInsightCard from '@/components/finances/PeriodInsightCard'
import { buildPeriodInsights } from '@/lib/finance/kpi-details'

const CashFlowChart = dynamic(() => import('@/components/finances/CashFlowChart'), { ssr: false })
const InvoicedVsCollectedChart = dynamic(() => import('@/components/finances/InvoicedVsCollectedChart'), { ssr: false })
const FinanceCategoryDonut = dynamic(() => import('@/components/finances/FinanceCategoryDonut'), { ssr: false })
const MrrByClientChart = dynamic(() => import('@/components/finances/MrrByClientChart'), { ssr: false })
const NetTrendChart = dynamic(() => import('@/components/finances/NetTrendChart'), { ssr: false })
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Receipt,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Loader2,
  Landmark,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import FinancePeriodFilter, { periodToQuery } from '@/components/finances/FinancePeriodFilter'
import {
  getDefaultPeriodRange,
  parsePeriodFromQuery,
  type PeriodPresetId,
  type PeriodRange,
} from '@/lib/finance/period-presets'

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
    ivaToPay: number
    netProfit: number
    netProfitAfterCorporateTax: number
  }
  bankConnection: BankConnectionStatus
  initialAiAnalysis: {
    summary: FinanceAiSummary
    model: string
    created_at: string
  } | null
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  // Durante el build, si DATABASE_URL no está disponible, retornar datos por defecto
  if (!process.env.DATABASE_URL && process.env.NEXT_PHASE === 'phase-production-build') {
    const defaultRange = getDefaultPeriodRange()
    return {
      props: {
        dateRange: {
          start: defaultRange.start.toISOString(),
          end: defaultRange.end.toISOString(),
        },
        stats: {
          currentBalance: 0,
          income: 0,
          expenses: 0,
          profit: 0,
          estimatedCorporateTax: 0,
          ivaToPay: 0,
          netProfit: 0,
          netProfitAfterCorporateTax: 0,
        },
        bankConnection: {
          connected: false,
          account_uid: null,
          valid_until: null,
          days_remaining: null,
          expires_soon: false,
        },
        initialAiAnalysis: null,
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
    // Obtener rango de fechas de query params o usar año en curso por defecto
    const startParam = context.query.start as string
    const endParam = context.query.end as string
    const { start: startDate, end: endDate } = parsePeriodFromQuery(startParam, endParam)

    // Calcular desde bank_transactions (datos reales) con filtro de fechas
    const startStr = format(startDate, 'yyyy-MM-dd')
    const endStr = format(endDate, 'yyyy-MM-dd')

    // Dinero actual en cuenta: saldo del último movimiento dentro del período (más reciente)
    const balanceResult = await query<{ balance: number }>(
      `SELECT balance
       FROM bank_transactions
       WHERE balance IS NOT NULL
         AND date >= $1 AND date <= $2
       ORDER BY date DESC, created_at DESC
       LIMIT 1`,
      [startStr, endStr]
    )
    const currentBalance = balanceResult.rows[0]?.balance 
      ? Number(balanceResult.rows[0].balance) 
      : 0

    // Ingresos del período: suma de transacciones positivas en el rango de fechas
    const incomeResult = await query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM bank_transactions
       WHERE date >= $1 AND date <= $2 AND amount > 0`,
      [startStr, endStr]
    )
    const income = Number(incomeResult.rows[0]?.total || 0)

    // Gastos del período: suma de transacciones negativas en el rango de fechas
    const expensesResult = await query<{ total: number }>(
      `SELECT COALESCE(ABS(SUM(amount)), 0) as total
       FROM bank_transactions
       WHERE date >= $1 AND date <= $2 AND amount < 0`,
      [startStr, endStr]
    )
    const expenses = Number(expensesResult.rows[0]?.total || 0)

    // Beneficio del período: ingresos - gastos
    const profit = income - expenses

    // IVA de ingresos (facturas emitidas) en el período
    const incomesIvaAgg = await prisma.financialIncome.aggregate({
      _sum: {
        iva_amount: true,
      },
      where: {
        deleted_at: null,
        date: {
          gte: startDate,
          lte: endDate,
        },
        // Consideramos solo facturas reales (no estimadas)
        status: {
          in: ['pending', 'paid'],
        },
      },
    })
    const incomesIva = Number(incomesIvaAgg._sum.iva_amount || 0)

    // IVA de gastos en el período
    const expensesIvaAgg = await prisma.expense.aggregate({
      _sum: {
        iva_amount: true,
      },
      where: {
        deleted_at: null,
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
      },
    })
    const expensesIva = Number(expensesIvaAgg._sum.iva_amount || 0)

    // IVA a deber: IVA de ingresos - IVA de gastos
    const ivaToPay = incomesIva - expensesIva

    // Beneficio neto: beneficio - IVA a deber
    const netProfit = profit - ivaToPay

    // Impuesto de sociedades: 15% del beneficio neto (después del IVA)
    const estimatedCorporateTax = (netProfit * 15) / 100

    // Beneficio neto después de impuesto de sociedades
    const netProfitAfterCorporateTax = netProfit - estimatedCorporateTax

    let bankConnection: BankConnectionStatus = {
      connected: false,
      account_uid: null,
      valid_until: null,
      days_remaining: null,
      expires_soon: false,
    }
    try {
      bankConnection = await getBankConnectionStatus()
    } catch {
      // tabla bank_connections puede no existir aún
    }

    let initialAiAnalysis: DashboardProps['initialAiAnalysis'] = null
    try {
      const latest = await getLatestFinanceAiAnalysis()
      if (latest) {
        initialAiAnalysis = {
          summary: latest.summary,
          model: latest.model,
          created_at: latest.created_at,
        }
      }
    } catch {
      // tabla puede no existir
    }

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
          ivaToPay,
          netProfit,
          netProfitAfterCorporateTax,
        },
        bankConnection,
        initialAiAnalysis,
      },
    }
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ERROR] Error loading financial dashboard:', error)
    }
    const defaultRange = getDefaultPeriodRange()
    return {
      props: {
        dateRange: {
          start: defaultRange.start.toISOString(),
          end: defaultRange.end.toISOString(),
        },
        stats: {
          currentBalance: 0,
          income: 0,
          expenses: 0,
          profit: 0,
          estimatedCorporateTax: 0,
          ivaToPay: 0,
          netProfit: 0,
          netProfitAfterCorporateTax: 0,
        },
        bankConnection: {
          connected: false,
          account_uid: null,
          valid_until: null,
          days_remaining: null,
          expires_soon: false,
        },
        initialAiAnalysis: null,
      },
    }
  }
}

export default function FinancesDashboard({
  dateRange: initialDateRange,
  stats,
  bankConnection: initialBankConnection,
  initialAiAnalysis,
}: DashboardProps) {
  const router = useRouter()
  const [dateRange, setDateRange] = useState<PeriodRange>(() =>
    initialDateRange.start && initialDateRange.end
      ? { start: new Date(initialDateRange.start), end: new Date(initialDateRange.end) }
      : getDefaultPeriodRange()
  )
  const [bankConnection, setBankConnection] = useState(initialBankConnection)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [executive, setExecutive] = useState<ExecutiveSummary | null>(null)
  const [loadingExecutive, setLoadingExecutive] = useState(true)
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

  const runSync = useCallback(async (reloadAfter = false) => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const response = await fetch('/api/bank/sync', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        // No mostrar errores de API (p. ej. límite de consentimiento HUB046) en la UI
        if (process.env.NODE_ENV === 'development') {
          console.warn('[bank/sync]', data.message || data.error)
        }
        return false
      }
      if (data.repaired > 0 || data.balance_repaired > 0) {
        const parts: string[] = []
        if (data.repaired > 0) parts.push(`${data.repaired} corregidos`)
        if (data.balance_repaired > 0) parts.push(`${data.balance_repaired} por saldo`)
        setSyncMessage(`Movimientos ${parts.join(', ')} (ingreso/gasto)`)
      } else if (data.inserted > 0) {
        setSyncMessage(`${data.inserted} movimientos nuevos sincronizados`)
      }
      if (reloadAfter || data.inserted > 0 || data.repaired > 0 || data.balance_repaired > 0) {
        await router.replace('/finances', undefined, { shallow: false })
      }
      return true
    } catch {
      return false
    } finally {
      setSyncing(false)
    }
  }, [router])

  const refreshConnectionStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/bank/connection-status')
      const data = await response.json()
      if (response.ok) {
        setBankConnection(data)
      }
    } catch {
      // ignorar
    }
  }, [])

  useEffect(() => {
    const status = router.query.status as string | undefined
    if (status === 'ok') {
      refreshConnectionStatus()
      runSync(true)
    }
  }, [router.query.status, refreshConnectionStatus, runSync])

  useEffect(() => {
    const loadExecutive = async () => {
      setLoadingExecutive(true)
      try {
        const { start, end } = periodToQuery(dateRange)
        const res = await fetch(`/api/finance/executive-summary?start=${start}&end=${end}`)
        const data = await res.json()
        if (res.ok) setExecutive(data)
      } catch {
        // ignorar
      } finally {
        setLoadingExecutive(false)
      }
    }
    loadExecutive()
  }, [dateRange])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const res = await fetch('/api/bank/test/start')
      const data = await res.json()
      if (!res.ok || !data.url) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[bank/connect]', data.error)
        }
        return
      }
      window.location.href = data.url
    } catch {
      // ignorar
    } finally {
      setConnecting(false)
    }
  }

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
      url += `&start_date=${format(dateRange.start, 'yyyy-MM-dd')}&end_date=${format(dateRange.end, 'yyyy-MM-dd')}`
      
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

  const handlePeriodChange = (range: PeriodRange, _preset: PeriodPresetId) => {
    setDateRange(range)
    setOffset(0)
    setHasMore(true)
    const params = periodToQuery(range)
    router.push(`/finances?start=${params.start}&end=${params.end}`)
  }

  const periodInsights = useMemo(() => {
    const periodDaysCount = Math.max(
      1,
      Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    )
    return buildPeriodInsights({ ...stats, periodDays: periodDaysCount })
  }, [stats, dateRange])

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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="flex items-center gap-2"
                  onClick={handleConnect}
                  disabled={connecting || syncing}
                >
                  {connecting || syncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Landmark className="h-4 w-4" />
                  )}
                  {bankConnection.connected ? 'Reconectar CaixaBank' : 'Conectar CaixaBank'}
                </Button>
                {bankConnection.connected && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => runSync(true)}
                    disabled={syncing}
                    title="Sincronizar movimientos"
                  >
                    <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
              {bankConnection.connected && bankConnection.days_remaining !== null && (
                <p
                  className={`text-xs ${
                    bankConnection.expires_soon ? 'text-red-600 font-medium' : 'text-gray-500'
                  }`}
                >
                  {bankConnection.expires_soon ? (
                    <>
                      Quedan {bankConnection.days_remaining} día
                      {bankConnection.days_remaining === 1 ? '' : 's'} para desconectarse — reconecta
                      pronto
                    </>
                  ) : (
                    <>
                      Conexión activa · quedan {bankConnection.days_remaining} día
                      {bankConnection.days_remaining === 1 ? '' : 's'} para volver a conectar
                    </>
                  )}
                </p>
              )}
              {syncMessage && (
                <p className="text-xs text-green-700">{syncMessage}</p>
              )}
            </div>
          </div>
          <FinancePeriodFilter value={dateRange} onChange={handlePeriodChange} />
        </div>

        {/* Centro de inteligencia financiera */}
        {loadingExecutive && !executive ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando métricas ejecutivas…
          </div>
        ) : executive ? (
          <>
            {/* KPIs ejecutivos */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {executive.kpi_cards.map((card) => (
                <FinanceKpiCard key={card.id} card={card} />
              ))}
            </div>

            <AnnualGoalCard goal={executive.annual_goal} />

            {/* Gráficos */}
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold text-gray-900">Flujo de caja</CardTitle>
                    <p className="text-xs text-gray-400 font-normal">{executive.period_label}</p>
                  </CardHeader>
                  <CardContent>
                    <CashFlowChart data={executive.cash_flow} />
                  </CardContent>
                </Card>
                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold text-gray-900">Facturado vs cobrado</CardTitle>
                    <p className="text-xs text-gray-400 font-normal">{executive.period_label}</p>
                  </CardHeader>
                  <CardContent>
                    <InvoicedVsCollectedChart data={executive.invoiced_vs_collected} />
                  </CardContent>
                </Card>
              </div>

              <Card className="border border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-gray-900">Distribución de gastos</CardTitle>
                  <p className="text-xs text-gray-400 font-normal">
                    {executive.period_label} · {executive.expense_source_label}
                  </p>
                </CardHeader>
                <CardContent>
                  <FinanceCategoryDonut
                    data={executive.expense_breakdown}
                    emptyMessage="Sin gastos en este período — sincroniza el banco o registra gastos en el CRM"
                  />
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold text-gray-900">Origen de ingresos</CardTitle>
                    <p className="text-xs text-gray-400 font-normal">{executive.period_label}</p>
                  </CardHeader>
                  <CardContent>
                    <FinanceCategoryDonut
                      data={executive.income_breakdown}
                      emptyMessage="Sin ingresos en este período — sincroniza el banco"
                    />
                  </CardContent>
                </Card>
                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold text-gray-900">Beneficio neto mensual</CardTitle>
                    <p className="text-xs text-gray-400 font-normal">Entradas − salidas por mes</p>
                  </CardHeader>
                  <CardContent>
                    <NetTrendChart data={executive.net_trend} />
                  </CardContent>
                </Card>
              </div>

              <Card className="border border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-gray-900">MRR por cliente</CardTitle>
                  <p className="text-xs text-gray-400 font-normal">Proyectos activos con mensualidad</p>
                </CardHeader>
                <CardContent>
                  <MrrByClientChart data={executive.mrr_by_client} />
                </CardContent>
              </Card>
            </div>

            {/* Alertas + IA */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2 text-gray-900">
                    <AlertCircle className="h-4 w-4 text-gray-400" />
                    Alertas ({executive.alerts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FinanceAlertsPanel alerts={executive.alerts} />
                </CardContent>
              </Card>
              <Card className="border border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">CFO virtual · IA</CardTitle>
                </CardHeader>
                <CardContent>
                  <FinanceAiPanel initialAnalysis={initialAiAnalysis} />
                </CardContent>
              </Card>
            </div>

            {/* Economía por proyecto */}
            {executive.project_economics.length > 0 && (
              <Card className="border border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Rentabilidad por cliente (MRR vs coste operativo)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b">
                          <th className="pb-2 pr-4">Proyecto</th>
                          <th className="pb-2 pr-4 text-right">MRR</th>
                          <th className="pb-2 pr-4 text-right">Coste LLM+infra</th>
                          <th className="pb-2 pr-4 text-right">Margen</th>
                          <th className="pb-2">Señales</th>
                        </tr>
                      </thead>
                      <tbody>
                        {executive.project_economics.map((p) => (
                          <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 pr-4 font-medium text-gray-900">
                              <Link href={`/retencion/${p.id}`} className="hover:underline">{p.name}</Link>
                            </td>
                            <td className="py-2 pr-4 text-right">{formatCurrency(p.monthly_fee_eur)}</td>
                            <td className="py-2 pr-4 text-right text-gray-600">{formatCurrency(p.total_cost_eur)}</td>
                            <td className={`py-2 pr-4 text-right font-semibold ${p.margin_pct != null && p.margin_pct < 30 ? 'text-gray-900 underline decoration-gray-300' : 'text-gray-700'}`}>
                              {p.margin_pct != null ? `${p.margin_pct}%` : '—'}
                            </td>
                            <td className="py-2 text-xs text-gray-500">
                              {p.days_inactive_streak != null && p.days_inactive_streak > 7 && (
                                <span className="text-amber-600">Inactivo {p.days_inactive_streak}d · </span>
                              )}
                              {p.nps_score_avg != null && <span>NPS {p.nps_score_avg}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}

        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Período seleccionado</p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {periodInsights.map((insight) => (
            <PeriodInsightCard key={insight.label} insight={insight} />
          ))}
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
                        <div className="flex-shrink-0">
                          {transaction.amount >= 0 ? (
                            <ArrowUp className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowDown className="h-4 w-4 text-red-600" />
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
                      <div
                        className={`text-right font-semibold tabular-nums ${
                          transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {transaction.amount >= 0 ? '+' : ''}
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

