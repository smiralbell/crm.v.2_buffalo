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
  const [syncDebug, setSyncDebug] = useState<Record<string, unknown> | null>(null)
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
  const [transactionTotal, setTransactionTotal] = useState(0)
  const observerTarget = useRef<HTMLDivElement>(null)

  const runSync = useCallback(async (reloadAfter = false) => {
    setSyncing(true)
    setSyncMessage(null)
    setSyncDebug(null)
    try {
      const response = await fetch('/api/bank/sync?mode=full', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[bank/sync]', data.message || data.error)
        }
        return false
      }

      if (data.api_debug_sample) {
        console.info('[bank/sync] muestra API mes anterior:', data.api_debug_sample)
      }
      if (data.sync_from) {
        console.info(
          `[bank/sync] incremental ${data.sync_from} → ${data.sync_to} ` +
            `(margen ${data.margin_days}d, ancla: ${data.anchor_source})`
        )
      }

      const sample = data.api_debug_sample as {
        month_label?: string
        first_page?: { transaction_count?: number; top_level_keys?: string[] }
        sample_transaction_keys?: string[]
        all_transactions_preview?: unknown[]
      } | null

      if (data.inserted > 0) {
        let msg = `${data.inserted} movimientos nuevos sincronizados`
        const newest = data.db_newest || data.newest_date
        const oldest = data.db_oldest || data.oldest_date
        if (oldest && newest) {
          msg += ` · del ${format(new Date(oldest), 'dd/MM/yyyy')} al ${format(new Date(newest), 'dd/MM/yyyy')}`
        }
        if (data.sync_from) {
          msg += ` · pedido desde ${format(new Date(data.sync_from), 'dd/MM/yyyy')}`
        }
        if (data.sync_mode === 'full') {
          msg += ` · modo completo`
        }
        if (data.truncated) {
          msg += ' · advertencia: paginación incompleta'
        }
        setSyncMessage(msg)
      } else if (data.total > 0) {
        const newest = data.db_newest || data.newest_date
        const oldest = data.db_oldest || data.oldest_date
        if (oldest && newest) {
          setSyncMessage(
            `${data.total} movimientos en banco · ${format(new Date(oldest), 'dd/MM/yyyy')} – ${format(new Date(newest), 'dd/MM/yyyy')}` +
              (data.sync_from ? ` · pedido desde ${format(new Date(data.sync_from), 'dd/MM/yyyy')}` : '')
          )
        }
      } else if (data.db_oldest && data.db_newest) {
        setSyncMessage(
          `Historial en BD: ${format(new Date(data.db_oldest), 'dd/MM/yyyy')} – ${format(new Date(data.db_newest), 'dd/MM/yyyy')}` +
            (data.sync_from ? ` · sync desde ${format(new Date(data.sync_from), 'dd/MM/yyyy')}` : '') +
            (data.inserted === 0 ? ' (sin movimientos nuevos)' : '')
        )
      } else if (data.sync_from) {
        setSyncMessage(
          `Sync incremental desde ${format(new Date(data.sync_from), 'dd/MM/yyyy')} · sin movimientos nuevos`
        )
      } else if (data.db_newest || data.newest_date) {
        const newest = data.db_newest || data.newest_date
        setSyncMessage(
          `Último movimiento en base de datos: ${format(new Date(newest), 'dd/MM/yyyy')}`
        )
      } else if (data.repaired > 0 || data.balance_repaired > 0) {
        const parts: string[] = []
        if (data.repaired > 0) parts.push(`${data.repaired} corregidos`)
        if (data.balance_repaired > 0) parts.push(`${data.balance_repaired} por saldo`)
        setSyncMessage(`Movimientos ${parts.join(', ')} (ingreso/gasto)`)
      }

      setSyncDebug({
        sync_mode: data.sync_mode,
        sync_from: data.sync_from,
        sync_to: data.sync_to,
        margin_days: data.margin_days,
        anchor_source: data.anchor_source,
        last_synced_at_before: data.last_synced_at_before,
        last_synced_at_after: data.last_synced_at_after,
        api_debug_sample: data.api_debug_sample,
        incremental_api_error: data.incremental_api_error,
        api_logs: data.api_logs,
        passes: data.passes,
        inserted: data.inserted,
        total: data.total,
        db_oldest: data.db_oldest,
        db_newest: data.db_newest,
        truncated: data.truncated,
      })

      if (sample?.month_label && !data.inserted && !data.total) {
        setSyncMessage((prev) =>
          prev ??
          `Muestra API mes ${sample.month_label}: ${sample.first_page?.transaction_count ?? 0} movimientos en 1ª página`
        )
      }
      if (
        reloadAfter ||
        data.inserted > 0 ||
        data.repaired > 0 ||
        data.balance_repaired > 0
      ) {
        const { start, end } = periodToQuery(dateRange)
        await router.replace(`/finances?start=${start}&end=${end}`, undefined, { shallow: false })
      }
      return true
    } catch {
      return false
    } finally {
      setSyncing(false)
    }
  }, [router, dateRange])

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
    if (loadingTransactions) return
    if (currentOffset > 0 && !hasMore) return

    setLoadingTransactions(true)
    try {
      let url = `/api/finance/recent-transactions?limit=25&offset=${currentOffset}`
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
        setTransactionTotal(data.total ?? 0)
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
        <div className="flex flex-col gap-2">
          <div className="flex flex-nowrap items-center gap-3 min-w-0">
            <div className="flex shrink-0 items-center gap-2">
              <Button
                className="flex items-center gap-2 h-9 whitespace-nowrap"
                onClick={handleConnect}
                disabled={connecting || syncing}
              >
                {connecting || syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Landmark className="h-4 w-4" />
                )}
                {bankConnection.connected ? 'Reconectar' : 'Conectar CaixaBank'}
              </Button>
              {bankConnection.connected && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => runSync(true)}
                  disabled={syncing}
                  title="Sincronizar movimientos"
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>

            <div className="hidden sm:block h-6 w-px bg-gray-200 shrink-0" />

            <FinancePeriodFilter
              value={dateRange}
              onChange={handlePeriodChange}
              className="flex-1 min-w-0"
            />
          </div>

          {(bankConnection.connected && bankConnection.days_remaining !== null) || syncMessage ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {bankConnection.connected && bankConnection.days_remaining !== null && (
                <p
                  className={
                    bankConnection.expires_soon ? 'text-red-600 font-medium' : 'text-gray-500'
                  }
                >
                  {bankConnection.expires_soon ? (
                    <>
                      Quedan {bankConnection.days_remaining} día
                      {bankConnection.days_remaining === 1 ? '' : 's'} para desconectarse
                    </>
                  ) : (
                    <>
                      Conexión activa · {bankConnection.days_remaining} día
                      {bankConnection.days_remaining === 1 ? '' : 's'} restantes
                    </>
                  )}
                </p>
              )}
              {syncMessage && <p className="text-green-700">{syncMessage}</p>}
              {syncDebug && (
                <details className="w-full text-left text-[11px] text-gray-600">
                  <summary className="cursor-pointer text-violet-700 font-medium">
                    Ver logs Enable Banking (
                    {Array.isArray(syncDebug.api_logs)
                      ? (syncDebug.api_logs as unknown[]).length
                      : 0}{' '}
                    llamadas API)
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-[10px] leading-relaxed">
                    {JSON.stringify(syncDebug, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ) : null}
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
                  <p className="text-xs text-gray-400 font-normal">Ingresos recurrentes detectados en movimientos bancarios</p>
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
            <CardTitle className="text-lg font-semibold">
              Historial de Movimientos
              {transactionTotal > 0 && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({transactionTotal} en el período · scroll para ver más)
                </span>
              )}
            </CardTitle>
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

