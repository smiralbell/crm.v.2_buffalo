import { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Link2, Repeat, Unlink } from 'lucide-react'
import Link from 'next/link'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear } from 'date-fns'
import DateRangePicker, { DateRangePickerResult } from '@/components/DateRangePicker'
import PaymentConceptGuide from '@/components/finances/PaymentConceptGuide'
import IncomeLinkInvoiceDialog, {
  type InvoiceForLink,
} from '@/components/finances/IncomeLinkInvoiceDialog'
import { buildIncomeAnalytics, type IncomeAnalytics } from '@/lib/finance/income-analytics'

const ClientCollectionBarChart = dynamic(
  () => import('@/components/finances/ClientCollectionBarChart'),
  { ssr: false }
)
const IncomeTimelineChart = dynamic(() => import('@/components/finances/IncomeTimelineChart'), {
  ssr: false,
})
const FinanceCategoryDonut = dynamic(() => import('@/components/finances/FinanceCategoryDonut'), {
  ssr: false,
})
const MrrByClientChart = dynamic(() => import('@/components/finances/MrrByClientChart'), {
  ssr: false,
})
const IncomeAiPanel = dynamic(() => import('@/components/finances/IncomeAiPanel'), {
  ssr: false,
})

const EMPTY_ANALYTICS: IncomeAnalytics = {
  client_breakdown: [],
  client_collection: [],
  monthly_timeline: [],
  type_breakdown: [],
  mrr_by_client: [],
  totals: {
    period_total: 0,
    matched_total: 0,
    unmatched_total: 0,
    matched_count: 0,
    unmatched_count: 0,
    mrr_monthly: 0,
    recurring_count: 0,
    base_collected: 0,
    iva_collected: 0,
    invoiced_period: 0,
    invoiced_base: 0,
    invoiced_iva: 0,
    has_iva_data: false,
    global_collection_pct: null,
    otros_income: 0,
  },
}

interface LinkedInvoice {
  id: number
  invoice_number: string
  client_name: string
  total: number
  subtotal: number
  iva: number
  issue_date: string
}

interface IncomeRow {
  id: string
  date: string
  amount: number
  description: string
  account_name: string
  matched: boolean
  is_recurring_income: boolean
  linkedInvoice: LinkedInvoice | null
}

interface IncomesPageProps {
  incomes: IncomeRow[]
  invoicesForLink: InvoiceForLink[]
  incomeAnalytics: IncomeAnalytics
  dateRange?: {
    start: string | null
    end: string | null
  }
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  if (!process.env.DATABASE_URL && process.env.NEXT_PHASE === 'phase-production-build') {
    const now = new Date()
    return {
      props: {
        incomes: [],
        invoicesForLink: [],
        incomeAnalytics: EMPTY_ANALYTICS,
        dateRange: {
          start: startOfMonth(now).toISOString(),
          end: endOfMonth(now).toISOString(),
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

    const startStr = format(startDate, 'yyyy-MM-dd')
    const endStr = format(endDate, 'yyyy-MM-dd')

    const incomesResult = await query<{
      id: string
      date: string | Date
      amount: number
      description: string
      account_name: string | null
      is_recurring_income: boolean
    }>(
      `SELECT 
        bt.id,
        bt.date,
        bt.amount,
        bt.description,
        ba.name as account_name,
        COALESCE(bt.is_recurring_income, false) AS is_recurring_income
       FROM bank_transactions bt
       LEFT JOIN bank_accounts ba ON bt.account_id = ba.id
       WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount > 0
       ORDER BY bt.date DESC`,
      [startStr, endStr]
    ).catch(async () => {
      const fallback = await query<{
        id: string
        date: string | Date
        amount: number
        description: string
        account_name: string | null
      }>(
        `SELECT bt.id, bt.date, bt.amount, bt.description, ba.name as account_name
         FROM bank_transactions bt
         LEFT JOIN bank_accounts ba ON bt.account_id = ba.id
         WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount > 0
         ORDER BY bt.date DESC`,
        [startStr, endStr]
      )
      return {
        rows: fallback.rows.map((r) => ({ ...r, is_recurring_income: false })),
      }
    })

    const incomesBase = incomesResult.rows.map((i) => ({
      id: i.id,
      date: i.date instanceof Date ? i.date.toISOString() : (i.date ?? null),
      amount: Number(i.amount),
      description: i.description ?? '',
      account_name: i.account_name ?? '',
      is_recurring_income: Boolean(i.is_recurring_income),
    }))

    let linkedByBtId = new Map<string | null, LinkedInvoice>()
    let invoicesForLinkRaw: Array<{
      id: number
      invoice_number: string
      client_name: string
      total: unknown
      subtotal: unknown
      iva: unknown
      issue_date: Date
      bank_transaction_id: string | null
    }> = []

    try {
      const linkedResult = await query<{
        id: number
        invoice_number: string
        client_name: string
        total: number
        subtotal: number
        iva: number
        issue_date: Date | string
        bank_transaction_id: string
      }>(
        `SELECT id, invoice_number, client_name, total, subtotal, iva, issue_date, bank_transaction_id
         FROM invoices
         WHERE deleted_at IS NULL AND bank_transaction_id IS NOT NULL`
      )
      linkedResult.rows.forEach((inv) => {
        if (inv.bank_transaction_id) {
          const issueDate = inv.issue_date instanceof Date
            ? inv.issue_date.toISOString()
            : String(inv.issue_date)
          linkedByBtId.set(inv.bank_transaction_id, {
            id: inv.id,
            invoice_number: inv.invoice_number,
            client_name: inv.client_name,
            total: Number(inv.total),
            subtotal: Number(inv.subtotal),
            iva: Number(inv.iva),
            issue_date: issueDate,
          })
        }
      })
    } catch (linkError: any) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[INCOMES] Link data skipped:', linkError?.message)
      }
    }

    try {
      const twoYearsAgo = new Date()
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
      invoicesForLinkRaw = await prisma.invoice.findMany({
        where: {
          deleted_at: null,
          status: 'sent',
          issue_date: { gte: twoYearsAgo },
        },
        orderBy: { issue_date: 'desc' },
        select: {
          id: true,
          invoice_number: true,
          client_name: true,
          total: true,
          subtotal: true,
          iva: true,
          issue_date: true,
          bank_transaction_id: true,
        },
      })
    } catch (listError: any) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[INCOMES] Invoice list for dropdown failed:', listError?.message)
      }
    }

    const incomes: IncomeRow[] = incomesBase.map((i) => {
      const linked = linkedByBtId.get(i.id)
      return {
        ...i,
        matched: !!linked,
        linkedInvoice: linked ?? null,
      }
    })

    const analyticsStart = new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1)
    const analyticsStartStr = format(analyticsStart, 'yyyy-MM-dd')
    const timelineResult = await query<{
      id: string
      date: string | Date
      amount: number
      description: string
      is_recurring_income: boolean
    }>(
      `SELECT bt.id, bt.date, bt.amount, bt.description,
              COALESCE(bt.is_recurring_income, false) AS is_recurring_income
       FROM bank_transactions bt
       WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount > 0
       ORDER BY bt.date`,
      [analyticsStartStr, endStr]
    ).catch(async () => {
      const fallback = await query<{
        id: string
        date: string | Date
        amount: number
        description: string
      }>(
        `SELECT bt.id, bt.date, bt.amount, bt.description
         FROM bank_transactions bt
         WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount > 0`,
        [analyticsStartStr, endStr]
      )
      return {
        rows: fallback.rows.map((r) => ({ ...r, is_recurring_income: false })),
      }
    })

    const toInput = (row: {
      id: string
      date: string | Date
      amount: number
      description: string
      is_recurring_income: boolean
    }) => {
      const dateStr =
        row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10)
      const linked = linkedByBtId.get(row.id)
      return {
        description: row.description ?? '',
        amount: Number(row.amount),
        date: dateStr,
        is_recurring_income: Boolean(row.is_recurring_income),
        linked_client_name: linked?.client_name,
      }
    }

    const periodInputs = incomes.map((i) => ({
      description: i.description,
      amount: i.amount,
      date: i.date.slice(0, 10),
      is_recurring_income: i.is_recurring_income,
      linked_client_name: i.linkedInvoice?.client_name ?? undefined,
      linked_invoice_subtotal: i.linkedInvoice?.subtotal,
      linked_invoice_iva: i.linkedInvoice?.iva,
    }))
    const timelineInputs = timelineResult.rows.map(toInput)

    const periodInvoicesRaw = await prisma.invoice.findMany({
      where: {
        deleted_at: null,
        status: 'sent',
        issue_date: { gte: startDate, lte: endDate },
      },
      select: {
        client_name: true,
        total: true,
        subtotal: true,
        iva: true,
        bank_transaction_id: true,
      },
    })
    const periodInvoices = periodInvoicesRaw.map((inv) => ({
      client_name: inv.client_name,
      total: Number(inv.total),
      subtotal: Number(inv.subtotal),
      iva: Number(inv.iva),
      bank_transaction_id: inv.bank_transaction_id,
    }))

    const incomeAnalytics = buildIncomeAnalytics(timelineInputs, periodInputs, periodInvoices)

    return {
      props: {
        incomes,
        invoicesForLink: invoicesForLinkRaw.map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          client_name: inv.client_name,
          total: Number(inv.total),
          subtotal: Number(inv.subtotal),
          iva: Number(inv.iva),
          issue_date: inv.issue_date.toISOString(),
          bank_transaction_id: inv.bank_transaction_id,
        })),
        incomeAnalytics,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      },
    }
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ERROR] Error loading incomes:', error)
    }
    const now = new Date()
    return {
      props: {
        incomes: [],
        invoicesForLink: [],
        incomeAnalytics: EMPTY_ANALYTICS,
        dateRange: {
          start: startOfMonth(now).toISOString(),
          end: endOfMonth(now).toISOString(),
        },
      },
    }
  }
}

export default function IncomesPage({
  incomes: initialIncomes,
  invoicesForLink,
  incomeAnalytics,
  dateRange: initialDateRange,
}: IncomesPageProps) {
  const router = useRouter()
  const [incomes, setIncomes] = useState<IncomeRow[]>(initialIncomes)
  const [invoicesForLinkLocal, setInvoicesForLinkLocal] = useState(invoicesForLink)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [selectedIncomeId, setSelectedIncomeId] = useState<string | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [unlinkLoadingId, setUnlinkLoadingId] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [recurringLoadingId, setRecurringLoadingId] = useState<string | null>(null)

  useEffect(() => {
    setIncomes(initialIncomes)
  }, [initialIncomes])

  useEffect(() => {
    setInvoicesForLinkLocal(invoicesForLink)
  }, [invoicesForLink])

  const now = new Date()
  const defaultRange: DateRangePickerResult = {
    start: startOfYear(now),
    end: endOfMonth(now),
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
      router.push(`/finances/incomes?${params.toString()}`)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const unmatchedIncomes = incomes.filter((i) => !i.matched)
  const unmatchedTotal = unmatchedIncomes.reduce((sum, i) => sum + i.amount, 0)
  const currentDateRange = dateRange || defaultRange

  const totals = incomeAnalytics.totals
  const selectedIncome = selectedIncomeId
    ? incomes.find((i) => i.id === selectedIncomeId) ?? null
    : null

  const handleOpenLinkModal = (incomeId: string) => {
    setSelectedIncomeId(incomeId)
    setLinkError(null)
    setLinkModalOpen(true)
  }

  const handleSubmitLink = async (invoiceId: number, options?: { noInvoiceNote?: string }) => {
    if (!selectedIncomeId) return
    setLinkError(null)
    setLinkLoading(true)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_transaction_id: selectedIncomeId }),
      })
      if (!res.ok) {
        const data = await res.json()
        setLinkError(data.error || 'Error al vincular factura')
        setLinkLoading(false)
        return
      }

      if (options) {
        const driveRes = await fetch(`/api/invoices/${invoiceId}/send-to-drive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ no_invoice_note: options.noInvoiceNote ?? '' }),
        })
        if (!driveRes.ok) {
          const driveData = await driveRes.json().catch(() => ({}))
          setLinkError(
            driveData.error ||
              driveData.details ||
              'Factura vinculada, pero no se pudo enviar el PDF con la nota a Drive'
          )
          setLinkLoading(false)
          return
        }
      }
      const income = incomes.find((i) => i.id === selectedIncomeId)
      const inv = invoicesForLinkLocal.find((f) => f.id === invoiceId)
      if (income && inv) {
        setIncomes((prev) =>
          prev.map((i) =>
            i.id === selectedIncomeId
              ? {
                  ...i,
                  matched: true,
                  linkedInvoice: {
                    id: inv.id,
                    invoice_number: inv.invoice_number,
                    client_name: inv.client_name,
                    total: inv.total,
                    subtotal: inv.subtotal,
                    iva: inv.iva,
                    issue_date: inv.issue_date,
                  },
                }
              : i
          )
        )
        setInvoicesForLinkLocal((prev) =>
          prev.map((f) =>
            f.id === inv.id ? { ...f, bank_transaction_id: selectedIncomeId } : f
          )
        )
      }
      setLinkModalOpen(false)
      setSelectedIncomeId(null)
    } catch {
      setLinkError('Error de conexión')
    }
    setLinkLoading(false)
  }

  const handleUnlink = async (incomeId: string, invoiceId: number) => {
    if (!confirm('¿Desvincular esta factura del cobro del banco?')) return
    setUnlinkLoadingId(incomeId)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_transaction_id: null }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Error al desvincular factura')
        return
      }
      setIncomes((prev) =>
        prev.map((i) =>
          i.id === incomeId ? { ...i, matched: false, linkedInvoice: null } : i
        )
      )
      setInvoicesForLinkLocal((prev) =>
        prev.map((f) => (f.id === invoiceId ? { ...f, bank_transaction_id: null } : f))
      )
    } catch {
      alert('Error de conexión')
    } finally {
      setUnlinkLoadingId(null)
    }
  }

  const handleToggleRecurring = async (incomeId: string, next: boolean) => {
    setRecurringLoadingId(incomeId)
    try {
      const res = await fetch(`/api/finance/bank-transactions/${incomeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_recurring_income: next }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'No se pudo actualizar la mensualidad')
        return
      }
      setIncomes((prev) =>
        prev.map((i) => (i.id === incomeId ? { ...i, is_recurring_income: next } : i))
      )
    } catch {
      alert('Error de conexión')
    } finally {
      setRecurringLoadingId(null)
    }
  }

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
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Ingresos</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Cobros del banco, MRR y vinculación con facturas emitidas
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <PaymentConceptGuide />
            <DateRangePicker onRangeChange={handleDateRangeChange} defaultRange={currentDateRange} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Total cobrado
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatCurrency(totals.period_total)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {formatCurrency(totals.matched_total)} con factura · {totals.matched_count} vinc.
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Base imponible cobrada
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatCurrency(totals.base_collected)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">De facturas vinculadas al banco</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                IVA repercutido
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {totals.has_iva_data ? formatCurrency(totals.iva_collected) : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {totals.has_iva_data
                  ? `Vinculado: base ${formatCurrency(totals.invoiced_base)} + IVA ${formatCurrency(totals.invoiced_iva)}`
                  : 'Sin facturas vinculadas con IVA'}
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Facturado enviado
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatCurrency(totals.invoiced_period)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Facturas «enviadas» en el período</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                % cobro global
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {totals.global_collection_pct != null ? `${totals.global_collection_pct}%` : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {formatCurrency(totals.unmatched_total)} sin vincular ({totals.unmatched_count})
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                MRR · Otros
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatCurrency(totals.mrr_monthly)}
                <span className="text-sm font-normal text-slate-400">/mes</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Plataformas/devoluciones: {formatCurrency(totals.otros_income)}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">
              % cobrado por cliente
            </CardTitle>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Facturas enviadas en el período vs cobro vinculado en el banco · ordenado del peor al mejor
            </p>
          </CardHeader>
          <CardContent className="pt-5">
            <ClientCollectionBarChart data={incomeAnalytics.client_collection} />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="border-slate-200/80 shadow-sm lg:col-span-3">
            <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
              <CardTitle className="text-base font-semibold text-slate-900">Evolución de cobros</CardTitle>
              <p className="text-xs text-slate-500 font-normal mt-0.5">Últimos 12 meses · recurrente vs puntual</p>
            </CardHeader>
            <CardContent className="pt-5">
              <IncomeTimelineChart data={incomeAnalytics.monthly_timeline} />
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm lg:col-span-2">
            <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
              <CardTitle className="text-base font-semibold text-slate-900">Tipo de ingreso</CardTitle>
              <p className="text-xs text-slate-500 font-normal mt-0.5">Mensualidades, setup y otros</p>
            </CardHeader>
            <CardContent className="pt-5 overflow-visible">
              <FinanceCategoryDonut
                data={incomeAnalytics.type_breakdown}
                emptyMessage="Sin ingresos en el período seleccionado"
                variant="income"
                compact
              />
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">MRR por cliente</CardTitle>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Solo cobros marcados con «Marcar MRR» · media mensual últimos meses
            </p>
          </CardHeader>
          <CardContent className="pt-5">
            <MrrByClientChart data={incomeAnalytics.mrr_by_client} />
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">Análisis IA de ingresos</CardTitle>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Conciliación, clientes y MRR · IVA solo si hay facturas vinculadas
            </p>
          </CardHeader>
          <CardContent className="pt-5">
            <IncomeAiPanel
              periodStart={format(currentDateRange.start ?? defaultRange.start!, 'yyyy-MM-dd')}
              periodEnd={format(currentDateRange.end ?? defaultRange.end!, 'yyyy-MM-dd')}
            />
          </CardContent>
        </Card>

        {unmatchedIncomes.length > 0 && (
          <Card className="border-rose-200/60 shadow-sm">
            <CardHeader className="border-b border-rose-100 bg-rose-50/30 pb-4">
              <CardTitle className="text-base font-semibold text-slate-900">
                Cobros sin factura emitida ({unmatchedIncomes.length})
              </CardTitle>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                {formatCurrency(unmatchedTotal)} sin vincular a factura en el CRM
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left p-3 font-medium text-sm text-slate-700">Fecha</th>
                      <th className="text-left p-3 font-medium text-sm text-slate-700">Concepto</th>
                      <th className="text-right p-3 font-medium text-sm text-slate-700">Importe</th>
                      <th className="text-right p-3 font-medium text-sm text-slate-700">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedIncomes.slice(0, 8).map((income) => (
                      <tr key={income.id} className="border-b bg-rose-50/50 hover:bg-rose-50">
                        <td className="p-3 text-sm text-slate-600">
                          {format(new Date(income.date), 'dd/MM/yyyy')}
                        </td>
                        <td className="p-3 text-sm text-slate-900">{income.description || '—'}</td>
                        <td className="p-3 text-right text-sm font-medium text-emerald-700">
                          {formatCurrency(income.amount)}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-indigo-600 hover:text-indigo-800"
                            onClick={() => handleOpenLinkModal(income.id)}
                          >
                            <Link2 className="h-4 w-4 mr-1" />
                            Vincular
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {unmatchedIncomes.length > 8 && (
                  <p className="mt-2 text-xs text-slate-400">
                    Mostrando 8 de {unmatchedIncomes.length} — ver listado completo abajo
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">Todos los ingresos del período</CardTitle>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Marca MRR en mensualidades y vincula cada cobro con su factura emitida
            </p>
          </CardHeader>
          <CardContent className="pt-5">
            {incomes.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-500">No hay ingresos en el rango seleccionado</p>
                <p className="text-xs text-slate-400 mt-2">
                  Sincroniza el banco en Finanzas o amplía el rango de fechas
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left p-3 font-medium text-sm text-slate-700">Fecha</th>
                      <th className="text-left p-3 font-medium text-sm text-slate-700">Concepto</th>
                      <th className="text-left p-3 font-medium text-sm text-slate-700">Cuenta</th>
                      <th className="text-right p-3 font-medium text-sm text-slate-700">Importe</th>
                      <th className="text-left p-3 font-medium text-sm text-slate-700">MRR</th>
                      <th className="text-left p-3 font-medium text-sm text-slate-700">Factura</th>
                      <th className="text-right p-3 font-medium text-sm text-slate-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomes.map((income) => (
                      <tr
                        key={income.id}
                        className={`border-b hover:opacity-95 ${
                          income.matched ? 'bg-emerald-50/60' : 'bg-rose-50/40'
                        }`}
                      >
                        <td className="p-3 text-sm text-slate-600">
                          {format(new Date(income.date), 'dd MMM yyyy')}
                        </td>
                        <td className="p-3 text-sm text-slate-900">{income.description || '—'}</td>
                        <td className="p-3 text-sm text-slate-600">{income.account_name || '—'}</td>
                        <td className="p-3 text-right text-sm font-medium text-emerald-800">
                          {formatCurrency(income.amount)}
                        </td>
                        <td className="p-3 text-sm">
                          <Button
                            type="button"
                            variant={income.is_recurring_income ? 'default' : 'outline'}
                            size="sm"
                            className={
                              income.is_recurring_income
                                ? 'bg-violet-600 hover:bg-violet-700 text-white h-8'
                                : 'h-8 border-slate-200'
                            }
                            disabled={recurringLoadingId === income.id}
                            onClick={() =>
                              handleToggleRecurring(income.id, !income.is_recurring_income)
                            }
                          >
                            <Repeat className="h-3.5 w-3.5 mr-1" />
                            {income.is_recurring_income ? 'MRR' : 'Marcar MRR'}
                          </Button>
                        </td>
                        <td className="p-3 text-sm text-slate-600">
                          {income.linkedInvoice ? (
                            <Link
                              href={`/invoices/${income.linkedInvoice.id}`}
                              className="text-emerald-700 hover:underline font-medium"
                            >
                              {income.linkedInvoice.invoice_number} – {income.linkedInvoice.client_name}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            {income.matched && income.linkedInvoice ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 border-slate-200 text-slate-600"
                                disabled={unlinkLoadingId === income.id}
                                onClick={() => handleUnlink(income.id, income.linkedInvoice!.id)}
                              >
                                <Unlink className="h-3.5 w-3.5 mr-1" />
                                Desvincular
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-indigo-600 hover:text-indigo-800"
                                onClick={() => handleOpenLinkModal(income.id)}
                              >
                                <Link2 className="h-3.5 w-3.5 mr-1" />
                                Vincular
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <IncomeLinkInvoiceDialog
          open={linkModalOpen}
          onOpenChange={setLinkModalOpen}
          income={
            selectedIncome
              ? {
                  id: selectedIncome.id,
                  amount: selectedIncome.amount,
                  description: selectedIncome.description,
                  date: selectedIncome.date,
                }
              : null
          }
          invoices={invoicesForLinkLocal}
          formatCurrency={formatCurrency}
          onSubmit={handleSubmitLink}
          loading={linkLoading}
          error={linkError}
        />
      </div>
    </Layout>
  )
}

