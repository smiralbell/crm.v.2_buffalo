import { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save, Info } from 'lucide-react'
import Link from 'next/link'
import {
  format,
  startOfQuarter,
  endOfQuarter,
  startOfDay,
  endOfDay,
  startOfYear,
  endOfMonth,
} from 'date-fns'
import DateRangePicker, { DateRangePickerResult } from '@/components/DateRangePicker'
import PaymentConceptGuide from '@/components/finances/PaymentConceptGuide'
import {
  buildFiscalPeriodSummary,
  type FiscalPeriodSummary,
} from '@/lib/finance/fiscal-summary'

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

interface TaxesPageProps {
  dateRange: { start: string | null; end: string | null }
  fiscal: FiscalPeriodSummary
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
      },
    }
  }
}

export default function TaxesPage({ dateRange: initialDateRange, fiscal }: TaxesPageProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [corporateTaxPercent, setCorporateTaxPercent] = useState(
    fiscal.corporate_tax_percent.toString()
  )

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

  const handleSaveCorporateTax = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/finances/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corporate_tax_percent: parseFloat(corporateTaxPercent) }),
      })
      if (!res.ok) {
        alert('Error al guardar')
        return
      }
      router.reload()
    } catch {
      alert('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)

  const ivaToPay = fiscal.iva_liquidacion >= 0
  const currentDateRange = dateRange || defaultRange

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/finances">
              <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-900 shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <PaymentConceptGuide />
            <DateRangePicker onRangeChange={handleDateRangeChange} defaultRange={currentDateRange} className="w-full sm:w-auto" />
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                IVA repercutido
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {fiscal.has_iva_data ? formatCurrency(fiscal.iva_repercutido) : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {fiscal.incomes_with_iva} cobros con factura vinculada
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                IVA soportado
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {fiscal.has_iva_data ? formatCurrency(fiscal.iva_soportado) : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {fiscal.expenses_with_iva} gastos CRM con IVA vinculados
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                {ivaToPay ? 'IVA a ingresar' : 'IVA a compensar'}
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {fiscal.has_iva_data ? formatCurrency(Math.abs(fiscal.iva_liquidacion)) : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Repercutido − soportado</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Imp. sociedades est.
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatCurrency(fiscal.corporate_tax)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {fiscal.corporate_tax_percent}% sobre resultado fiscal
              </p>
            </CardContent>
          </Card>
        </div>

        {!fiscal.has_iva_data && (
          <Card className="border-amber-200/80 bg-amber-50/40 shadow-sm">
            <CardContent className="pt-5 pb-4 flex gap-3">
              <Info className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-950/90">
                <p className="font-medium">Sin datos de IVA en este período</p>
                <p className="text-xs mt-1 text-amber-900/80 leading-relaxed">
                  Vincula cobros con facturas emitidas en{' '}
                  <Link href="/finances/incomes" className="underline font-medium">
                    Ingresos
                  </Link>{' '}
                  y registra gastos con IVA en el CRM para calcular liquidación. El impuesto de
                  sociedades se estima sobre el resultado de caja hasta tener bases fiscales.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
              <CardTitle className="text-base font-semibold text-slate-900">
                Liquidación IVA (modelo simplificado)
              </CardTitle>
              <p className="text-xs text-slate-500 font-normal mt-0.5">{fiscal.period_label}</p>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Base imponible ingresos</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {fiscal.has_iva_data ? formatCurrency(fiscal.base_income) : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">IVA repercutido (ventas)</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {fiscal.has_iva_data ? formatCurrency(fiscal.iva_repercutido) : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Base imponible gastos deducibles</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {fiscal.has_iva_data ? formatCurrency(fiscal.base_expenses) : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">IVA soportado (compras)</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {fiscal.has_iva_data ? formatCurrency(fiscal.iva_soportado) : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-2 font-semibold">
                  <span className="text-slate-900">
                    {ivaToPay ? 'A ingresar en Hacienda' : 'Saldo a favor'}
                  </span>
                  <span className="tabular-nums text-slate-900">
                    {fiscal.has_iva_data ? formatCurrency(Math.abs(fiscal.iva_liquidacion)) : '—'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
              <CardTitle className="text-base font-semibold text-slate-900">
                Impuesto sobre sociedades
              </CardTitle>
              <p className="text-xs text-slate-500 font-normal mt-0.5">Estimación del período</p>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="corporate_tax_percent">Tipo impositivo (%)</Label>
                  <Input
                    id="corporate_tax_percent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={corporateTaxPercent}
                    onChange={(e) => setCorporateTaxPercent(e.target.value)}
                    className="max-w-[140px]"
                  />
                </div>
                <Button onClick={handleSaveCorporateTax} disabled={loading} size="sm">
                  <Save className="mr-2 h-4 w-4" />
                  {loading ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
              <div className="space-y-3 text-sm border-t border-slate-100 pt-4">
                <div className="flex justify-between">
                  <span className="text-slate-600">Resultado fiscal estimado</span>
                  <span className="font-medium tabular-nums">{formatCurrency(fiscal.fiscal_gross)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tipo aplicado</span>
                  <span>{fiscal.corporate_tax_percent}%</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-900">
                  <span>Impuesto estimado</span>
                  <span className="tabular-nums">{formatCurrency(fiscal.corporate_tax)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {fiscal.has_iva_data
                  ? 'Base: ingresos − gastos (sin IVA) de operaciones vinculadas.'
                  : 'Sin IVA vinculado: base = ingresos − gastos de caja (extracto bancario).'}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">Carga fiscal total</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="text-3xl font-semibold tabular-nums text-slate-900">
                {formatCurrency(fiscal.taxes_total)}
              </p>
              <p className="text-sm text-slate-500">
                IVA {fiscal.has_iva_data ? formatCurrency(Math.max(0, fiscal.iva_liquidacion)) : '—'} + IS{' '}
                {formatCurrency(fiscal.corporate_tax)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
