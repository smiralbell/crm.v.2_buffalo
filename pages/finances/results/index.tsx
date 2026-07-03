import { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { format, startOfDay, endOfDay, startOfYear, endOfMonth } from 'date-fns'
import DateRangePicker, { DateRangePickerResult } from '@/components/DateRangePicker'
import PaymentConceptGuide from '@/components/finances/PaymentConceptGuide'
import {
  buildFiscalPeriodSummary,
  type FiscalPeriodSummary,
} from '@/lib/finance/fiscal-summary'

const ResultsMonthlyChart = dynamic(() => import('@/components/finances/ResultsMonthlyChart'), {
  ssr: false,
})

const EMPTY_FISCAL: FiscalPeriodSummary = {
  period_label: '',
  income_cash: 0,
  expenses_cash: 0,
  gross_cash: 0,
  has_iva_data: false,
  base_income: 0,
  base_expenses: 0,
  iva_repercutido: 0,
  iva_soportado: 0,
  iva_liquidacion: 0,
  fiscal_gross: 0,
  corporate_tax_percent: 25,
  corporate_tax: 0,
  taxes_total: 0,
  net_result: 0,
  margin_cash_pct: null,
  margin_net_pct: null,
  linked_incomes: 0,
  incomes_with_iva: 0,
  expenses_with_iva: 0,
  monthly: [],
}

interface ResultsPageProps {
  dateRange: { start: string | null; end: string | null }
  fiscal: FiscalPeriodSummary
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  if (!process.env.DATABASE_URL && process.env.NEXT_PHASE === 'phase-production-build') {
    const now = new Date()
    return {
      props: {
        dateRange: { start: startOfYear(now).toISOString(), end: endOfMonth(now).toISOString() },
        fiscal: EMPTY_FISCAL,
      },
    }
  }

  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
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
      endDate = endOfMonth(now)
    }

    const fiscal = await buildFiscalPeriodSummary(startDate, endDate)

    return {
      props: {
        dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
        fiscal,
      },
    }
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ERROR] Error loading results:', error)
    }
    const now = new Date()
    return {
      props: {
        dateRange: { start: startOfYear(now).toISOString(), end: endOfMonth(now).toISOString() },
        fiscal: EMPTY_FISCAL,
      },
    }
  }
}

export default function ResultsPage({ dateRange: initialDateRange, fiscal }: ResultsPageProps) {
  const router = useRouter()
  const now = new Date()
  const defaultRange: DateRangePickerResult = {
    start: startOfYear(now),
    end: endOfMonth(now),
  }

  const [dateRange, setDateRange] = useState<DateRangePickerResult>(
    initialDateRange?.start && initialDateRange?.end
      ? { start: new Date(initialDateRange.start), end: new Date(initialDateRange.end) }
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

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)

  const currentDateRange = dateRange || defaultRange
  const resultColor = (n: number) => (n >= 0 ? 'text-slate-900' : 'text-red-600')

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/finances">
              <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-900">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Resultados</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                P&amp;L del período · caja y resultado neto tras impuestos estimados
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PaymentConceptGuide />
            <DateRangePicker onRangeChange={handleDateRangeChange} defaultRange={currentDateRange} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Ingresos (caja)
              </p>
              <p className="text-2xl font-semibold tabular-nums text-emerald-800">
                {formatCurrency(fiscal.income_cash)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Cobros en banco</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Gastos (caja)
              </p>
              <p className="text-2xl font-semibold tabular-nums text-rose-800">
                {formatCurrency(fiscal.expenses_cash)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Pagos en banco</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Resultado bruto
              </p>
              <p className={`text-2xl font-semibold tabular-nums ${resultColor(fiscal.gross_cash)}`}>
                {formatCurrency(fiscal.gross_cash)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Margen {fiscal.margin_cash_pct != null ? `${fiscal.margin_cash_pct}%` : '—'}
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Impuestos est.
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatCurrency(fiscal.taxes_total)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                <Link href="/finances/taxes" className="hover:underline">
                  Ver desglose
                </Link>
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Resultado neto
              </p>
              <p className={`text-2xl font-semibold tabular-nums ${resultColor(fiscal.net_result)}`}>
                {formatCurrency(fiscal.net_result)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Margen neto {fiscal.margin_net_pct != null ? `${fiscal.margin_net_pct}%` : '—'}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">
              Puente resultado bruto → neto
            </CardTitle>
            <p className="text-xs text-slate-500 font-normal mt-0.5">{fiscal.period_label}</p>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="max-w-lg space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Ingresos − gastos (caja)</span>
                <span className={`font-medium tabular-nums ${resultColor(fiscal.gross_cash)}`}>
                  {formatCurrency(fiscal.gross_cash)}
                </span>
              </div>
              {fiscal.has_iva_data && (
                <>
                  <div className="flex justify-between py-2 border-b border-slate-100 text-slate-500">
                    <span>↳ Base fiscal (sin IVA)</span>
                    <span className="tabular-nums">{formatCurrency(fiscal.fiscal_gross)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">− IVA a ingresar (est.)</span>
                    <span className="tabular-nums text-slate-900">
                      {formatCurrency(Math.max(0, fiscal.iva_liquidacion))}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">− Imp. sociedades ({fiscal.corporate_tax_percent}%)</span>
                <span className="tabular-nums text-slate-900">{formatCurrency(fiscal.corporate_tax)}</span>
              </div>
              <div className="flex justify-between py-2 font-semibold text-slate-900">
                <span>= Resultado neto estimado</span>
                <span className={`tabular-nums ${resultColor(fiscal.net_result)}`}>
                  {formatCurrency(fiscal.net_result)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">Evolución mensual</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <ResultsMonthlyChart data={fiscal.monthly} />
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">Desglose mensual</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-0">
            {fiscal.monthly.length === 0 ? (
              <p className="text-center text-slate-500 py-12 text-sm">Sin datos en el período</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left p-3 font-medium text-slate-700">Mes</th>
                      <th className="text-right p-3 font-medium text-slate-700">Ingresos</th>
                      <th className="text-right p-3 font-medium text-slate-700">Gastos</th>
                      <th className="text-right p-3 font-medium text-slate-700">Bruto</th>
                      <th className="text-right p-3 font-medium text-slate-700">Neto est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fiscal.monthly.map((m) => (
                      <tr key={m.month_key} className="border-b hover:bg-slate-50/80">
                        <td className="p-3 font-medium text-slate-900">{m.month_label}</td>
                        <td className="p-3 text-right tabular-nums text-emerald-800">
                          {formatCurrency(m.income_cash)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-rose-800">
                          {formatCurrency(m.expenses_cash)}
                        </td>
                        <td className={`p-3 text-right tabular-nums font-medium ${resultColor(m.gross_cash)}`}>
                          {formatCurrency(m.gross_cash)}
                        </td>
                        <td className={`p-3 text-right tabular-nums font-medium ${resultColor(m.net_result)}`}>
                          {formatCurrency(m.net_result)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td className="p-3 text-slate-900">Total</td>
                      <td className="p-3 text-right tabular-nums">{formatCurrency(fiscal.income_cash)}</td>
                      <td className="p-3 text-right tabular-nums">{formatCurrency(fiscal.expenses_cash)}</td>
                      <td className={`p-3 text-right tabular-nums ${resultColor(fiscal.gross_cash)}`}>
                        {formatCurrency(fiscal.gross_cash)}
                      </td>
                      <td className={`p-3 text-right tabular-nums ${resultColor(fiscal.net_result)}`}>
                        {formatCurrency(fiscal.net_result)}
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
