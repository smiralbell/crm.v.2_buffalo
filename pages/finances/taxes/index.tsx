import { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Info } from 'lucide-react'
import Link from 'next/link'
import {
  format,
  startOfQuarter,
  endOfQuarter,
  startOfDay,
  endOfDay,
  startOfYear,
  endOfMonth,
  subYears,
} from 'date-fns'
import DateRangePicker, { DateRangePickerResult } from '@/components/DateRangePicker'
import PaymentConceptGuide from '@/components/finances/PaymentConceptGuide'
import type { FiscalPeriodSummary } from '@/lib/finance/fiscal-summary'
import {
  quarterKeySettledBy303Payment,
  type IvaQuarterPoint,
} from '@/lib/finance/iva-quarters'

const IvaQuarterlyChart = dynamic(() => import('@/components/finances/IvaQuarterlyChart'), {
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
  iva_a_deber: 0,
  iva_since_settlement_repercutido: 0,
  iva_since_settlement_soportado: 0,
  last_modelo_303: null,
  modelo_303_in_period: [],
  iva_movements: [],
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

interface TaxesPageProps {
  dateRange: { start: string | null; end: string | null }
  fiscal: FiscalPeriodSummary
  ivaQuarters: IvaQuarterPoint[]
  totalIvaCobrado: number
  totalPagos303: number
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  if (!process.env.DATABASE_URL && process.env.NEXT_PHASE === 'phase-production-build') {
    const now = new Date()
    return {
      props: {
        dateRange: {
          start: startOfQuarter(now).toISOString(),
          end: endOfQuarter(now).toISOString(),
        },
        fiscal: EMPTY_FISCAL,
        ivaQuarters: [],
        totalIvaCobrado: 0,
        totalPagos303: 0,
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
      // IVA a deber / movimientos: mira amplio hasta hoy
      startDate = startOfDay(subYears(now, 2))
      endDate = endOfMonth(now)
    }

    const [{ buildFiscalPeriodSummary, buildIvaByQuarter }] = await Promise.all([
      import('@/lib/finance/fiscal-summary'),
    ])

    const [fiscal, ivaQ] = await Promise.all([
      buildFiscalPeriodSummary(startDate, endDate),
      buildIvaByQuarter(8),
    ])

    return {
      props: {
        dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
        fiscal,
        ivaQuarters: ivaQ.quarters,
        totalIvaCobrado: ivaQ.total_iva_cobrado,
        totalPagos303: ivaQ.total_pagos_303,
      },
    }
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ERROR] Error loading taxes:', error)
    }
    const now = new Date()
    return {
      props: {
        dateRange: {
          start: startOfQuarter(now).toISOString(),
          end: endOfQuarter(now).toISOString(),
        },
        fiscal: EMPTY_FISCAL,
        ivaQuarters: [],
        totalIvaCobrado: 0,
        totalPagos303: 0,
      },
    }
  }
}

export default function TaxesPage({
  dateRange: initialDateRange,
  fiscal,
  ivaQuarters,
  totalIvaCobrado,
  totalPagos303,
}: TaxesPageProps) {
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
      router.push(`/finances/taxes?${params.toString()}`)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)

  const quarterLabel = (key: string | null) => {
    if (!key) return null
    const [y, q] = key.split('-Q')
    return `T${q} ${y}`
  }

  const ivaADeber = fiscal.iva_a_deber
  const debesIva = ivaADeber > 0.009
  const teFavorIva = ivaADeber < -0.009
  const currentDateRange = dateRange || defaultRange
  const last303 = fiscal.last_modelo_303
  const movements = fiscal.iva_movements || []
  const quartersWith303 = ivaQuarters.filter((q) => q.pago_303 > 0)

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/finances">
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-500 hover:text-slate-900 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <PaymentConceptGuide />
            <DateRangePicker
              onRangeChange={handleDateRangeChange}
              defaultRange={currentDateRange}
              className="w-full sm:w-auto"
            />
          </div>
        </div>

        <Card
          className={
            debesIva
              ? 'border-rose-200/80 shadow-sm bg-gradient-to-br from-rose-50/50 to-white'
              : teFavorIva
                ? 'border-emerald-200/80 shadow-sm bg-gradient-to-br from-emerald-50/50 to-white'
                : 'border-indigo-200/70 shadow-sm bg-gradient-to-br from-indigo-50/40 to-white'
          }
        >
          <CardContent className="pt-6 pb-5">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <p
                  className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${
                    debesIva
                      ? 'text-rose-700/80'
                      : teFavorIva
                        ? 'text-emerald-700/80'
                        : 'text-indigo-700/80'
                  }`}
                >
                  {debesIva ? 'Debes IVA a Hacienda' : teFavorIva ? 'IVA a tu favor' : 'IVA en cero'}
                </p>
                <p
                  className={`text-3xl font-semibold tabular-nums ${
                    debesIva
                      ? 'text-rose-950'
                      : teFavorIva
                        ? 'text-emerald-950'
                        : 'text-indigo-950'
                  }`}
                >
                  {formatCurrency(Math.abs(ivaADeber))}
                </p>
                <p className="text-xs text-slate-500 mt-2 max-w-xl leading-relaxed">
                  {debesIva
                    ? 'Exactamente esto es lo que debes ahora (IVA cobrado − IVA de gastos desde el último 303).'
                    : teFavorIva
                      ? 'Tienes este importe a compensar: has soportado más IVA en gastos que el repercutido en cobros.'
                      : 'No hay saldo de IVA pendiente desde el último modelo 303.'}{' '}
                  Concepto de pago:{' '}
                  <span className="font-mono text-[11px] text-slate-700">I.V.A. MODELO 303</span>.
                </p>
              </div>
              <div className="text-sm space-y-1.5 sm:text-right">
                <p className="text-slate-600">
                  + IVA cobros{' '}
                  <span className="font-semibold tabular-nums text-rose-800">
                    {formatCurrency(fiscal.iva_since_settlement_repercutido)}
                  </span>
                </p>
                <p className="text-slate-600">
                  − IVA gastos{' '}
                  <span className="font-semibold tabular-nums text-emerald-800">
                    {formatCurrency(fiscal.iva_since_settlement_soportado)}
                  </span>
                </p>
                <p className="text-slate-900 font-semibold tabular-nums pt-1 border-t border-slate-100">
                  = {debesIva ? 'Debes' : teFavorIva ? 'A favor' : 'Saldo'}{' '}
                  {formatCurrency(Math.abs(ivaADeber))}
                </p>
                {last303 ? (
                  <p className="text-[11px] text-slate-500 pt-1">
                    Último 303: {format(new Date(last303.date + 'T12:00:00'), 'dd/MM/yyyy')} ·{' '}
                    {formatCurrency(last303.amount)}
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-700/90 pt-1">
                    Aún no hay un gasto con concepto I.V.A. MODELO 303
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                IVA cobros (desde 303)
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatCurrency(fiscal.iva_since_settlement_repercutido)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Facturas vinculadas a cobros</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                IVA gastos (desde 303)
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatCurrency(fiscal.iva_since_settlement_soportado)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Gastos CRM con IVA</p>
            </CardContent>
          </Card>
          <Card className="border-rose-200/70 shadow-sm bg-gradient-to-br from-rose-50/40 to-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700/80 mb-1.5">
                IVA total cobrado
              </p>
              <p className="text-2xl font-semibold tabular-nums text-rose-950">
                {formatCurrency(totalIvaCobrado)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Suma trimestres · 303 pagados {formatCurrency(totalPagos303)}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">
              Gestoría vs cálculo CRM
            </CardTitle>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Por cada cobro I.V.A. MODELO 303: lo que te cobró la gestoría (negro) frente a lo que
              calcula el CRM con ingresos y gastos de ese trimestre (rojo). Diferencia = CRM − 303.
            </p>
          </CardHeader>
          <CardContent className="pt-5">
            <IvaQuarterlyChart data={ivaQuarters} />
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ivaQuarters
                .filter((q) => q.pago_303 > 0)
                .map((q) => (
                  <div
                    key={q.quarter_key}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {q.label}
                      {q.pago_303_date
                        ? ` · ${format(new Date(q.pago_303_date + 'T12:00:00'), 'dd/MM/yy')}`
                        : ''}
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-slate-900 mt-0.5">
                      303 {formatCurrency(q.pago_303)}
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-rose-800 mt-0.5">
                      CRM {formatCurrency(q.liquidacion)}
                    </p>
                    <p
                      className={`text-[11px] font-medium tabular-nums mt-0.5 ${
                        Math.abs(q.diferencia) < 0.01
                          ? 'text-emerald-600'
                          : q.diferencia > 0
                            ? 'text-amber-700'
                            : 'text-sky-700'
                      }`}
                    >
                      Diff {q.diferencia > 0 ? '+' : ''}
                      {formatCurrency(q.diferencia)}
                    </p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">
              Pagos I.V.A. MODELO 303
            </CardTitle>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Mismos importes que en el gráfico · liquida el trimestre indicado · compara con CRM
            </p>
          </CardHeader>
          <CardContent className="pt-2 pb-2">
            {quartersWith303.length === 0 && fiscal.modelo_303_in_period.length === 0 ? (
              <p className="text-sm text-slate-500 px-1 py-6 text-center">
                No hay pagos con concepto I.V.A. MODELO 303 todavía.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(quartersWith303.length > 0
                  ? [...quartersWith303].reverse()
                  : []
                ).map((q) => (
                  <li
                    key={q.quarter_key}
                    className="flex items-center justify-between gap-3 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        I.V.A. MODELO 303 · {q.label}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {q.pago_303_date
                          ? format(new Date(q.pago_303_date + 'T12:00:00'), 'dd/MM/yyyy')
                          : '—'}{' '}
                        · liquida {q.label} · CRM {formatCurrency(q.liquidacion)}
                        {Math.abs(q.diferencia) >= 0.01
                          ? ` · diff ${q.diferencia > 0 ? '+' : ''}${formatCurrency(q.diferencia)}`
                          : ' · coincide'}
                      </p>
                    </div>
                    <span className="tabular-nums font-semibold text-slate-900 shrink-0">
                      {formatCurrency(q.pago_303)}
                    </span>
                  </li>
                ))}
                {quartersWith303.length === 0
                  ? fiscal.modelo_303_in_period.map((s) => {
                      const qKey = quarterKeySettledBy303Payment(s.date)
                      return (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-3 py-3 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{s.description}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {format(new Date(s.date + 'T12:00:00'), 'dd/MM/yyyy')}
                              {qKey ? ` · liquida ${quarterLabel(qKey)}` : ''}
                            </p>
                          </div>
                          <span className="tabular-nums font-semibold text-slate-900 shrink-0">
                            {formatCurrency(s.amount)}
                          </span>
                        </li>
                      )
                    })
                  : null}
              </ul>
            )}
          </CardContent>
        </Card>

        {!fiscal.has_iva_data && (
          <Card className="border-amber-200/80 bg-amber-50/40 shadow-sm">
            <CardContent className="pt-5 pb-4 flex gap-3">
              <Info className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-950/90">
                <p className="font-medium">Sin datos de IVA todavía</p>
                <p className="text-xs mt-1 text-amber-900/80 leading-relaxed">
                  Vincula cobros con facturas en{' '}
                  <Link href="/finances/incomes" className="underline font-medium">
                    Ingresos
                  </Link>{' '}
                  y registra gastos con IVA. Cuando pagues a Hacienda, pon el concepto{' '}
                  <span className="font-mono">I.V.A. MODELO 303</span> para poner el contador a 0.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">
              Movimientos de IVA
            </CardTitle>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Cobros (facturas) y gastos con IVA desde el último I.V.A. MODELO 303
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {movements.length === 0 ? (
              <p className="text-sm text-slate-500 px-5 py-8 text-center">
                No hay movimientos de IVA en este tramo. Vincula facturas a cobros e indica IVA en
                gastos.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 font-semibold">Fecha</th>
                      <th className="px-4 py-3 font-semibold">Tipo</th>
                      <th className="px-4 py-3 font-semibold">Concepto</th>
                      <th className="px-4 py-3 font-semibold text-right">Base</th>
                      <th className="px-4 py-3 font-semibold text-right">IVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 tabular-nums text-slate-500 whitespace-nowrap">
                          {format(new Date(m.date + 'T12:00:00'), 'dd/MM/yyyy')}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={
                              m.kind === 'cobro'
                                ? 'rounded-md bg-rose-50 text-rose-800 px-2 py-0.5 text-[11px] font-medium'
                                : m.kind === 'gasto'
                                  ? 'rounded-md bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[11px] font-medium'
                                  : 'rounded-md bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px] font-medium'
                            }
                          >
                            {m.kind === 'cobro'
                              ? 'Cobro'
                              : m.kind === 'gasto'
                                ? 'Gasto'
                                : 'Modelo 303'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-800">
                          <p className="font-medium truncate max-w-[280px]">{m.description}</p>
                          {m.ref ? (
                            <p className="text-[11px] text-slate-400 mt-0.5">{m.ref}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                          {m.base != null ? formatCurrency(m.base) : '—'}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                            m.iva > 0
                              ? 'text-rose-700'
                              : m.iva < 0
                                ? 'text-emerald-700'
                                : 'text-slate-500'
                          }`}
                        >
                          {m.kind === 'modelo_303'
                            ? '→ 0'
                            : `${m.iva > 0 ? '+' : ''}${formatCurrency(m.iva)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50/90 border-t border-slate-200">
                      <td
                        colSpan={4}
                        className="px-4 py-3 text-right text-sm font-semibold text-slate-700"
                      >
                        Saldo IVA
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-semibold ${
                          debesIva
                            ? 'text-rose-800'
                            : teFavorIva
                              ? 'text-emerald-800'
                              : 'text-slate-900'
                        }`}
                      >
                        {debesIva
                          ? `Debes ${formatCurrency(ivaADeber)}`
                          : teFavorIva
                            ? `A favor ${formatCurrency(Math.abs(ivaADeber))}`
                            : formatCurrency(0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
