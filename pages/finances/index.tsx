import { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { getBankConnectionStatus, type BankConnectionStatus } from '@/lib/enable-banking/connection-status'
import { getLatestFinanceAiAnalysis } from '@/lib/finance/ai-analysis'
import type { ExecutiveSummary, FinanceAiSummary } from '@/lib/finance/types'
import FinanceAlertsPanel from '@/components/finances/FinanceAlertsPanel'
import FinanceAiPanel from '@/components/finances/FinanceAiPanel'
import FinanceKpiCard from '@/components/finances/FinanceKpiCard'
import AnnualGoalCard from '@/components/finances/AnnualGoalCard'
import RecurringExpensesPanel from '@/components/finances/RecurringExpensesPanel'
import PaymentConceptGuide from '@/components/finances/PaymentConceptGuide'
import ChannelCostsEditor from '@/components/leads/ChannelCostsEditor'
import { computeOpsRecurringMonthlyAvg } from '@/lib/finance/ops-recurring-burn'

const CashFlowChart = dynamic(() => import('@/components/finances/CashFlowChart'), { ssr: false })
const InvoicedVsCollectedChart = dynamic(() => import('@/components/finances/InvoicedVsCollectedChart'), { ssr: false })
const FinanceCategoryDonut = dynamic(() => import('@/components/finances/FinanceCategoryDonut'), { ssr: false })
const MrrByClientChart = dynamic(() => import('@/components/finances/MrrByClientChart'), { ssr: false })
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  Landmark,
  FileText,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { format, subYears, endOfDay, startOfDay } from 'date-fns'
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
    realBalance: number
    income: number
    expenses: number
    profit: number
    estimatedCorporateTax: number
    ivaToPay: number
    netProfit: number
    netProfitAfterCorporateTax: number
  }
  overviewKpis: {
    income: number
    expenses: number
    taxes: number
    net_result: number
    gross_cash: number
    has_iva_data: boolean
  }
  fiscalMeta: {
    corporate_tax_percent: number
    fiscal_gross: number
  }
  runway: {
    months: number | null
    /** Media mensual gastos recurrentes ops (3 meses) */
    recurring_burn_monthly: number
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
          realBalance: 0,
          income: 0,
          expenses: 0,
          profit: 0,
          estimatedCorporateTax: 0,
          ivaToPay: 0,
          netProfit: 0,
          netProfitAfterCorporateTax: 0,
        },
        overviewKpis: {
          income: 0,
          expenses: 0,
          taxes: 0,
          net_result: 0,
          gross_cash: 0,
          has_iva_data: false,
        },
        fiscalMeta: {
          corporate_tax_percent: 25,
          fiscal_gross: 0,
        },
        runway: {
          months: null,
          recurring_burn_monthly: 0,
        },
        bankConnection: {
          connected: false,
          account_uid: null,
          valid_until: null,
          days_remaining: null,
          expires_soon: false,
          last_synced_at: null,
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

    // Saldo vivo (último movimiento con balance) — no depende del filtro
    const balanceResult = await query<{ balance: number }>(
      `SELECT balance
       FROM bank_transactions
       WHERE balance IS NOT NULL
       ORDER BY date DESC, created_at DESC
       LIMIT 1`
    )
    const currentBalance = balanceResult.rows[0]?.balance
      ? Number(balanceResult.rows[0].balance)
      : 0

    const { buildFiscalPeriodSummary, fiscalToOverviewKpis } = await import(
      '@/lib/finance/fiscal-summary'
    )

    const fiscal = await buildFiscalPeriodSummary(startDate, endDate)
    // IVA vivo a hoy (no depende del filtro) → saldo real y caja Impuestos
    const today = endOfDay(new Date())
    const ivaLiveFiscal = await buildFiscalPeriodSummary(startOfDay(subYears(today, 2)), today)
    const ivaLive = ivaLiveFiscal.iva_a_deber
    // Debes IVA (+) → resta · Te deben / a favor (−) → suma
    const realBalance = Math.round((currentBalance - ivaLive) * 100) / 100

    const opsBurn = await computeOpsRecurringMonthlyAvg(3)
    const runwayMonths =
      opsBurn.avg_monthly > 0 && realBalance > 0
        ? Math.round((realBalance / opsBurn.avg_monthly) * 10) / 10
        : realBalance <= 0 && opsBurn.avg_monthly > 0
          ? 0
          : null

    const overviewKpis = {
      ...fiscalToOverviewKpis(fiscal),
      taxes: ivaLive,
      has_iva_data: ivaLiveFiscal.has_iva_data || fiscal.has_iva_data,
    }

    const income = fiscal.income_cash
    const expenses = fiscal.expenses_cash
    const profit = fiscal.gross_cash
    const ivaToPay = ivaLive
    const estimatedCorporateTax = fiscal.corporate_tax
    const netProfit = fiscal.has_iva_data
      ? fiscal.fiscal_gross - Math.max(0, ivaLive)
      : fiscal.gross_cash
    const netProfitAfterCorporateTax = fiscal.net_result

    let bankConnection: BankConnectionStatus = {
      connected: false,
      account_uid: null,
      valid_until: null,
      days_remaining: null,
      expires_soon: false,
      last_synced_at: null,
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
          realBalance,
          income,
          expenses,
          profit,
          estimatedCorporateTax,
          ivaToPay,
          netProfit,
          netProfitAfterCorporateTax,
        },
        overviewKpis,
        fiscalMeta: {
          corporate_tax_percent: fiscal.corporate_tax_percent,
          fiscal_gross: fiscal.fiscal_gross,
        },
        runway: {
          months: runwayMonths,
          recurring_burn_monthly: opsBurn.avg_monthly,
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
          realBalance: 0,
          income: 0,
          expenses: 0,
          profit: 0,
          estimatedCorporateTax: 0,
          ivaToPay: 0,
          netProfit: 0,
          netProfitAfterCorporateTax: 0,
        },
        overviewKpis: {
          income: 0,
          expenses: 0,
          taxes: 0,
          net_result: 0,
          gross_cash: 0,
          has_iva_data: false,
        },
        fiscalMeta: {
          corporate_tax_percent: 25,
          fiscal_gross: 0,
        },
        runway: {
          months: null,
          recurring_burn_monthly: 0,
        },
        bankConnection: {
          connected: false,
          account_uid: null,
          valid_until: null,
          days_remaining: null,
          expires_soon: false,
          last_synced_at: null,
        },
        initialAiAnalysis: null,
      },
    }
  }
}

export default function FinancesDashboard({
  dateRange: initialDateRange,
  stats,
  overviewKpis,
  runway,
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

  // Auto-sync al abrir Finanzas si el último sync tiene > ~20h
  useEffect(() => {
    if (!bankConnection.connected || syncing) return
    if (router.query.status === 'ok') return // ya sincroniza el efecto de OAuth
    const last = bankConnection.last_synced_at
      ? new Date(bankConnection.last_synced_at).getTime()
      : 0
    const gapMs = 20 * 60 * 60 * 1000
    if (Date.now() - last < gapMs) return

    let cancelled = false
    ;(async () => {
      setSyncing(true)
      try {
        const response = await fetch('/api/bank/sync', { method: 'POST' })
        const data = await response.json().catch(() => ({}))
        if (cancelled || !response.ok) return
        if (data.inserted > 0) {
          setSyncMessage(`${data.inserted} movimientos nuevos (sync automática)`)
        }
        await refreshConnectionStatus()
        const { start, end } = periodToQuery(dateRange)
        const execRes = await fetch(`/api/finance/executive-summary?start=${start}&end=${end}`)
        const execData = await execRes.json()
        if (execRes.ok) setExecutive(execData)
      } catch {
        // silencioso
      } finally {
        if (!cancelled) setSyncing(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankConnection.connected, bankConnection.last_synced_at])

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const handlePeriodChange = (range: PeriodRange, _preset: PeriodPresetId) => {
    setDateRange(range)
    const params = periodToQuery(range)
    router.push(`/finances?start=${params.start}&end=${params.end}`)
  }

  const periodQuery = periodToQuery(dateRange)
  const periodQs = `start=${periodQuery.start}&end=${periodQuery.end}`

  // Prioridad 1: caja + saldo real (IVA vivo) + runway sobre saldo real
  const ivaBalance = overviewKpis.taxes // + debes · − a favor (calculado a hoy)
  const realBalance = stats.realBalance
  const cashCards = [
    {
      key: 'balance',
      href: `/finances?${periodQs}`,
      label: 'Saldo actual',
      value: stats.currentBalance,
      sub: 'Último movimiento sincronizado',
      valueClass: 'text-slate-900',
      display: formatCurrency(stats.currentBalance),
    },
    {
      key: 'real_balance',
      href: `/finances/taxes?${periodQs}`,
      label: 'Saldo real',
      value: realBalance,
      sub:
        ivaBalance > 0.009
          ? `Cuenta − IVA que debes (${formatCurrency(ivaBalance)})`
          : ivaBalance < -0.009
            ? `Cuenta + IVA a tu favor (${formatCurrency(Math.abs(ivaBalance))})`
            : 'Igual al saldo de cuenta',
      valueClass: realBalance < 0 ? 'text-rose-800' : 'text-slate-900',
      display: formatCurrency(realBalance),
    },
    {
      key: 'income',
      href: `/finances/incomes?${periodQs}`,
      label: 'Cobros',
      value: overviewKpis.income,
      sub: 'Entradas banco · período',
      valueClass: 'text-emerald-800',
      display: formatCurrency(overviewKpis.income),
    },
    {
      key: 'expenses',
      href: `/finances/expenses?${periodQs}`,
      label: 'Pagos',
      value: overviewKpis.expenses,
      sub: 'Salidas banco · período',
      valueClass: 'text-rose-800',
      display: formatCurrency(overviewKpis.expenses),
    },
    {
      key: 'runway',
      href: `/finances/expenses?${periodQs}`,
      label: 'Runway',
      value: runway.months ?? 0,
      sub:
        runway.recurring_burn_monthly > 0
          ? `Saldo real ÷ ${formatCurrency(runway.recurring_burn_monthly)}/mes (3m)`
          : 'Sin gastos recurrentes detectados',
      valueClass:
        runway.months != null && runway.months < 3 ? 'text-red-600' : 'text-slate-900',
      display: runway.months != null ? `${runway.months}m` : '—',
    },
    {
      key: 'taxes',
      href: `/finances/taxes?${periodQs}`,
      label: 'Impuestos',
      value: Math.abs(ivaBalance),
      sub: !overviewKpis.has_iva_data
        ? 'Sin IVA vinculado aún'
        : ivaBalance > 0.009
          ? 'Debes este IVA a Hacienda'
          : ivaBalance < -0.009
            ? 'IVA a tu favor (compensar)'
            : 'IVA en cero · al día',
      valueClass:
        ivaBalance > 0.009
          ? 'text-rose-800'
          : ivaBalance < -0.009
            ? 'text-emerald-800'
            : 'text-slate-900',
      display:
        ivaBalance > 0.009
          ? `Debes ${formatCurrency(ivaBalance)}`
          : ivaBalance < -0.009
            ? `A favor ${formatCurrency(Math.abs(ivaBalance))}`
            : formatCurrency(0),
    },
  ]

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center min-w-0">
            <div className="flex shrink-0 items-center gap-2">
              <Button
                className="flex items-center gap-2 h-9 whitespace-nowrap flex-1 sm:flex-initial"
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

            <FinancePeriodFilter
              value={dateRange}
              onChange={handlePeriodChange}
              className="w-full sm:flex-1 min-w-0"
            />

            <div className="flex shrink-0 items-center gap-2">
              <Link href="/invoices" className="flex-1 sm:flex-initial">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-full gap-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Facturas
                </Button>
              </Link>
              <PaymentConceptGuide />
              <ChannelCostsEditor triggerLabel="Costes captación" />
            </div>
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {cashCards.map((card) => (
            <Link key={card.key} href={card.href}>
              <Card className="border-slate-200/80 shadow-sm bg-white hover:border-slate-300 transition-colors h-full">
                <CardContent className="pt-5 pb-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    {card.label}
                  </p>
                  <p className={`text-2xl font-semibold tabular-nums ${card.valueClass}`}>
                    {card.display}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">{card.sub}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {loadingExecutive && !executive ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando métricas…
          </div>
        ) : executive ? (
          <>
            {/* 2. Flujo de caja */}
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-gray-900">Flujo de caja</CardTitle>
                <p className="text-xs text-gray-400 font-normal">
                  Entradas y salidas bancarias · {executive.period_label}
                </p>
              </CardHeader>
              <CardContent>
                <CashFlowChart data={executive.cash_flow} />
              </CardContent>
            </Card>

            {/* 3. Donuts gastos / ingresos */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border border-gray-200 shadow-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-gray-900">
                    Distribución de pagos
                  </CardTitle>
                  <p className="text-xs text-gray-400 font-normal">
                    {executive.period_label} · buckets + Asignar gastos
                  </p>
                </CardHeader>
                <CardContent>
                  <FinanceCategoryDonut
                    data={executive.expense_breakdown}
                    emptyMessage="Sin salidas en este período — sincroniza el banco o cambia el filtro"
                  />
                </CardContent>
              </Card>
              <Card className="border border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-gray-900">
                    Gastos recurrentes
                  </CardTitle>
                  <p className="text-xs text-gray-400 font-normal">
                    Lookback 12 meses hasta fin del filtro · mismo criterio que Gastos
                  </p>
                </CardHeader>
                <CardContent>
                  <RecurringExpensesPanel data={executive.recurring_expenses} compact />
                </CardContent>
              </Card>
            </div>

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-gray-900">Origen de cobros</CardTitle>
                <p className="text-xs text-gray-400 font-normal">
                  {executive.period_label} · por cliente (factura vinculada o concepto)
                </p>
              </CardHeader>
              <CardContent>
                <FinanceCategoryDonut
                  data={executive.income_breakdown}
                  emptyMessage="Sin cobros en este período — sincroniza el banco o cambia el filtro"
                  variant="income"
                />
              </CardContent>
            </Card>
          </>
        ) : null}

        {executive ? (
          <>
            {/* Conciliación facturado vs cobrado */}
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-gray-900">
                  Facturado vs cobrado
                </CardTitle>
                <p className="text-xs text-gray-400 font-normal">
                  Emisión vs fecha de banco · {executive.period_label}
                </p>
              </CardHeader>
              <CardContent>
                <InvoicedVsCollectedChart data={executive.invoiced_vs_collected} />
              </CardContent>
            </Card>

            {/* MRR + KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {executive.kpi_cards.map((card) => (
                <FinanceKpiCard key={card.id} card={card} />
              ))}
            </div>

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-gray-900">MRR por cliente</CardTitle>
                <p className="text-xs text-gray-400 font-normal">
                  Solo cobros marcados como mensualidad en Ingresos
                </p>
              </CardHeader>
              <CardContent>
                <MrrByClientChart data={executive.mrr_by_client} />
              </CardContent>
            </Card>

            {/* Objetivo / alertas / IA */}
            <AnnualGoalCard goal={executive.annual_goal} />

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
                  <FinanceAiPanel
                    initialAnalysis={initialAiAnalysis}
                    periodStart={periodQuery.start}
                    periodEnd={periodQuery.end}
                  />
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </Layout>
  )
}

