import { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Upload } from 'lucide-react'
import Link from 'next/link'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import DateRangePicker, { DateRangePickerResult } from '@/components/DateRangePicker'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import PaymentConceptGuide from '@/components/finances/PaymentConceptGuide'
import { Textarea } from '@/components/ui/textarea'
import { buildExpenseAnalytics, type ExpenseAnalytics } from '@/lib/finance/expense-analytics'
import { createPlaceholderNotePdfBlob } from '@/lib/pdf/placeholder-note-pdf'

const ExpenseVendorBarChart = dynamic(() => import('@/components/finances/ExpenseVendorBarChart'), {
  ssr: false,
})

const ExpenseBucketTimelineChart = dynamic(
  () => import('@/components/finances/ExpenseBucketTimelineChart'),
  { ssr: false }
)
const FinanceCategoryDonut = dynamic(() => import('@/components/finances/FinanceCategoryDonut'), {
  ssr: false,
})
const ExpenseSavingsSimulator = dynamic(
  () => import('@/components/finances/ExpenseSavingsSimulator'),
  { ssr: false }
)
const ProjectSpendChart = dynamic(() => import('@/components/finances/ProjectSpendChart'), {
  ssr: false,
})
const ExpenseAiPanel = dynamic(() => import('@/components/finances/ExpenseAiPanel'), {
  ssr: false,
})

const EMPTY_ANALYTICS: ExpenseAnalytics = {
  bucket_breakdown: [],
  monthly_timeline: [],
  project_spend: [],
  vendor_spend: [],
  recurring: { monthly_total: 0, annual_total: 0, count: 0, items: [], groups: [] },
  cuttable_items: [],
  totals: {
    period_total: 0,
    recurring_monthly: 0,
    platform_period: 0,
    payroll_period: 0,
    developer_period: 0,
    marketing_period: 0,
  },
}
interface ExpensesPageProps {
  expenses: Array<{
    id: string
    date: string
    amount: number
    description: string
    account_name: string
    matched: boolean
  }>
  expenseAnalytics: ExpenseAnalytics
  invoices: Array<{
    id: number
    invoice_number: string
    client_name: string
    issue_date: string
    total: number
    status: string
  }>
  unmatchedExpenses: Array<{
    id: string
    date: string
    amount: number
    description: string
    account_name: string
    matched: boolean
  }>
  dateRange?: {
    start: string | null
    end: string | null
  }
  totalVat: number
  totalIrpf: number
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  // Durante el build, si DATABASE_URL no está disponible, retornar datos por defecto
  if (!process.env.DATABASE_URL && process.env.NEXT_PHASE === 'phase-production-build') {
    const now = new Date()
    return {
      props: {
        expenses: [],
        expenseAnalytics: EMPTY_ANALYTICS,
        invoices: [],
        unmatchedExpenses: [],
        totalVat: 0,
        totalIrpf: 0,
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
    // Obtener rango de fechas de query params o usar mes actual por defecto
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

    // Obtener gastos desde bank_transactions (datos reales)
    const expensesResult = await query<{
      id: string
      date: any
      amount: number
      description: string
      account_name: string
    }>(
      `SELECT 
        bt.id,
        bt.date,
        bt.amount,
        bt.description,
        ba.name as account_name
       FROM bank_transactions bt
       JOIN bank_accounts ba ON bt.account_id = ba.id
       WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount < 0
       ORDER BY bt.date DESC`,
      [startStr, endStr]
    )

    // Normalizar gastos para reutilizarlos
    const normalizeText = (text: string | null) =>
      (text || '')
        .toUpperCase()
        .trim()
        .replace(/\s+/g, ' ')

    const normalizedExpensesBase = expensesResult.rows.map((e) => {
      const dateStr = e.date instanceof Date ? e.date.toISOString() : String(e.date)
      return {
        id: e.id,
        date: dateStr,
        amount: Math.abs(Number(e.amount)),
        description: e.description,
        account_name: e.account_name,
      }
    })

    // Cargar gastos manuales (facturas de gastos) en el mismo rango
    const manualExpenses = await prisma.expense.findMany({
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
      select: {
        id: true,
        name: true,
        date_start: true,
        date_end: true,
        base_amount: true,
        total_amount: true,
        iva_amount: true,
        notes: true,
      },
    })

    const normalizedManualExpenses = manualExpenses.map((m) => ({
      id: m.id,
      nameNorm: normalizeText(m.name),
      total: Number(m.total_amount),
      start: m.date_start,
      end: m.date_end,
      bankTransactionId: m.notes || null,
      baseAmount: Number(m.base_amount),
      ivaAmount: m.iva_amount,
    }))

    // Marcar cada movimiento del banco como "trabajado" (matched) o no
    const normalizedExpenses = normalizedExpensesBase.map((expense) => {
      const descNorm = normalizeText(expense.description)
      const expenseDate = new Date(expense.date)

      const match = normalizedManualExpenses.find((m) => {
        // Enlazado directo por ID del movimiento si existe en notes
        if (m.bankTransactionId && m.bankTransactionId === expense.id) {
          return true
        }
        // Fallback heurístico por concepto / fecha / importe
        const sameConcept = m.nameNorm === descNorm
        const inRange = expenseDate >= m.start && expenseDate <= m.end
        const sameAmount =
          Math.abs(m.total - expense.amount) < 0.01 // pequeña tolerancia en céntimos
        return sameConcept && inRange && sameAmount
      })

      return {
        ...expense,
        matched: !!match,
      }
    })

    // Analytics: últimos 12 meses hasta fin del período (gráficos + proyección)
    const analyticsStart = new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1)
    const analyticsStartStr = format(analyticsStart, 'yyyy-MM-dd')
    const analyticsResult = await query<{ date: string; amount: number; description: string }>(
      `SELECT bt.date::text AS date, bt.amount, bt.description
       FROM bank_transactions bt
       WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount < 0
       ORDER BY bt.date`,
      [analyticsStartStr, endStr]
    )
    const analyticsExpenses = analyticsResult.rows.map((e) => ({
      description: e.description || '',
      amount: Number(e.amount),
      date: e.date.slice(0, 10),
    }))
    const periodExpenses = normalizedExpensesBase.map((e) => ({
      description: e.description,
      amount: -e.amount,
      date: e.date,
    }))
    const expenseAnalytics = buildExpenseAnalytics(analyticsExpenses, periodExpenses)

    // Obtener facturas en el mismo rango de fechas (por fecha de emisión)
    const invoicesRaw = await prisma.invoice.findMany({
      where: {
        deleted_at: null,
        issue_date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { issue_date: 'desc' },
      select: {
        id: true,
        invoice_number: true,
        client_name: true,
        issue_date: true,
        total: true,
        status: true,
      },
    })

    const invoices = invoicesRaw.map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      client_name: inv.client_name,
      issue_date: inv.issue_date.toISOString(),
      total: Number(inv.total),
      status: inv.status,
    }))

    const totalVat = manualExpenses.reduce((sum, m) => {
      // Intentar usar el campo iva_amount si existe y es numérico
      let ivaNum = 0
      if (m.iva_amount !== null && m.iva_amount !== undefined) {
        const parsed = parseFloat(m.iva_amount.toString())
        if (!isNaN(parsed)) {
          ivaNum = parsed
        }
      }

      // Si iva_amount no está bien definido, derivarlo de total - base (nunca negativo)
      if (ivaNum === 0) {
        const base = Number(m.base_amount) || 0
        const total = Number(m.total_amount) || 0
        const diff = total - base
        if (!isNaN(diff) && diff > 0) {
          ivaNum = diff
        }
      }

      return sum + ivaNum
    }, 0)

    const totalIrpf = manualExpenses.reduce((sum, m) => {
      const irpf = (m as any).irpf_amount !== undefined ? Number((m as any).irpf_amount) || 0 : 0
      return sum + irpf
    }, 0)

    // Alertas: gastos bancarios que aún no tienen gasto manual asociado
    const unmatchedExpenses = normalizedExpenses.filter((expense) => !expense.matched)

    return {
      props: {
        expenses: normalizedExpenses,
        expenseAnalytics,
        invoices,
        unmatchedExpenses,
        totalVat,
        totalIrpf,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      },
    }
  } catch (error: any) {
    // Solo loguear errores críticos
    if (process.env.NODE_ENV === 'development') {
      console.error('[ERROR] Error loading expenses:', error)
    }
    const now = new Date()
    return {
      props: {
        expenses: [],
        expenseAnalytics: EMPTY_ANALYTICS,
        invoices: [],
        unmatchedExpenses: [],
        totalVat: 0,
        totalIrpf: 0,
        dateRange: {
          start: startOfMonth(now).toISOString(),
          end: endOfMonth(now).toISOString(),
        },
      },
    }
  }
}

export default function ExpensesPage({
  expenses,
  expenseAnalytics,
  invoices,
  unmatchedExpenses,
  dateRange: initialDateRange,
  totalVat,
  totalIrpf,
}: ExpensesPageProps) {
  const router = useRouter()
  const [displayExpenses, setDisplayExpenses] = useState(expenses)
  const [displayUnmatched, setDisplayUnmatched] = useState(unmatchedExpenses)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadConcept, setUploadConcept] = useState('')
  const [uploadDate, setUploadDate] = useState('')
  const [uploadTotalAmount, setUploadTotalAmount] = useState('')
  const [uploadIvaPercent, setUploadIvaPercent] = useState('21')
  const [uploadIrpfAmount, setUploadIrpfAmount] = useState('0')
  const [amountIncludesVat, setAmountIncludesVat] = useState(true)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadHasInvoice, setUploadHasInvoice] = useState(true)
  const [uploadNoInvoiceNote, setUploadNoInvoiceNote] = useState('')

  useEffect(() => {
    setDisplayExpenses(expenses)
    setDisplayUnmatched(unmatchedExpenses)
  }, [expenses, unmatchedExpenses])
  
  // Valores por defecto si initialDateRange no está definido
  const now = new Date()
  const defaultRange: DateRangePickerResult = {
    // Desde el 1 de enero del año actual hasta fin de mes actual
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

  // Función para formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const handleDateRangeChange = (range: DateRangePickerResult) => {
    setDateRange(range)
    // Actualizar URL con los nuevos parámetros
    if (range.start && range.end) {
      const params = new URLSearchParams({
        start: format(range.start, 'yyyy-MM-dd'),
        end: format(range.end, 'yyyy-MM-dd'),
      })
      router.push(`/finances/expenses?${params.toString()}`)
    }
  }

  const handleOpenUpload = (expenseId: string) => {
    const expense = displayExpenses.find((e) => e.id === expenseId)
    if (!expense) return
    setSelectedExpenseId(expenseId)
    setUploadConcept(expense.description || '')
    setUploadDate(expense.date.split('T')[0])
    setUploadTotalAmount(expense.amount.toFixed(2))
    setUploadIvaPercent('21')
    setUploadIrpfAmount('0')
    setAmountIncludesVat(true)
    setUploadFile(null)
    setUploadHasInvoice(true)
    setUploadNoInvoiceNote('')
    setUploadError(null)
    setUploadOpen(true)
  }

  const handleSubmitUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    setUploadError(null)
    setUploadLoading(true)

    if (uploadHasInvoice && !uploadFile) {
      setUploadError('Debes adjuntar la factura del gasto (archivo).')
      setUploadLoading(false)
      return
    }

    const rawAmount = parseFloat(uploadTotalAmount) || 0
    const ivaPercent = parseFloat(uploadIvaPercent) || 0
    const irpfAmount = parseFloat(uploadIrpfAmount) || 0

    // El importe introducido SIEMPRE es el gasto total real
    // Solo descomponemos en base + IVA cuando "importe con IVA" está activo
    let baseAmount = rawAmount
    let ivaAmount = 0
    const totalAmount = rawAmount

    if (amountIncludesVat && ivaPercent > 0) {
      baseAmount = rawAmount / (1 + ivaPercent / 100)
      ivaAmount = totalAmount - baseAmount
    } else {
      // Sin IVA: todo es base, IVA = 0
      baseAmount = rawAmount
      ivaAmount = 0
    }

    try {
      // 1) Registrar el gasto manual en nuestra BD
      const res = await fetch('/api/finances/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: uploadConcept,
          date_start: uploadDate,
          date_end: uploadDate,
          base_amount: baseAmount,
          iva_amount: ivaAmount,
          irpf_amount: irpfAmount,
          total_amount: totalAmount,
          tags: [],
          person_name: null,
          project: null,
          client_name: null,
          // Guardamos el id del movimiento bancario en notes para enlazarlo de forma persistente
          notes: selectedExpenseId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setUploadError(data.error || 'Error al crear gasto')
        setUploadLoading(false)
        return
      }

      const expenseId = data.expense?.id ?? data.id

      // 2) Enviar la factura (o PDF en blanco con nota) al webhook de n8n
      const uploadData = new FormData()
      const note = uploadNoInvoiceNote.trim()
      const pdfFile = uploadHasInvoice
        ? uploadFile!
        : new File(
            [createPlaceholderNotePdfBlob(note)],
            `sin_factura_${uploadConcept || `GASTO-${expenseId}`}.pdf`,
            { type: 'application/pdf' }
          )

      uploadData.append('pdf', pdfFile)
      uploadData.append('concept', uploadConcept)
      uploadData.append('date', uploadDate)
      uploadData.append('base_amount', String(baseAmount))
      uploadData.append('iva_amount', String(ivaAmount))
      uploadData.append('total_amount', String(totalAmount))
      if (!uploadHasInvoice) {
        uploadData.append('no_invoice', 'true')
        uploadData.append('note', note)
      }

      const filename =
        pdfFile.name || `gasto_${uploadConcept || 'sin_concepto'}_${uploadDate || ''}.pdf`
      const yearMonth = uploadDate ? uploadDate.substring(0, 7) : new Date().toISOString().substring(0, 7)

      const webhookUrlWithParams =
        `https://n8n.agenciabuffalo.es/webhook/c102607d-57a2-43fe-a8c1-55f2e24fc5c0` +
        `?pdf_filename=${encodeURIComponent(filename)}` +
        `&invoice_id=${encodeURIComponent(String(expenseId))}` +
        `&invoice_number=${encodeURIComponent(uploadConcept || `GASTO-${expenseId}`)}` +
        `&year_month=${encodeURIComponent(yearMonth)}` +
        `&type=gasto` +
        (uploadHasInvoice ? '' : `&no_invoice=true&note=${encodeURIComponent(note)}`)

      try {
        const uploadRes = await fetch(webhookUrlWithParams, {
          method: 'POST',
          body: uploadData,
        })

        if (!uploadRes.ok) {
          // No bloqueamos al usuario; solo dejamos constancia en consola
          console.error('Error enviando factura de gasto al webhook', uploadRes.status)
        }
      } catch (webhookError) {
        console.error('Error de red al llamar al webhook de gastos', webhookError)
      }

      // Marcar el gasto bancario como trabajado (verde) en memoria
      if (selectedExpenseId) {
        setDisplayExpenses((prev) =>
          prev.map((e) =>
            e.id === selectedExpenseId
              ? {
                  ...e,
                  matched: true,
                }
              : e
          )
        )
        setDisplayUnmatched((prev) => prev.filter((e) => e.id !== selectedExpenseId))
      }

      setUploadOpen(false)
      setUploadLoading(false)
    } catch (err) {
      setUploadError('Error de conexión')
      setUploadLoading(false)
    }
  }

  // Asegurar que dateRange siempre tenga un valor válido
  const currentDateRange = dateRange || defaultRange

  // Calcular totales
  const expensesTotal = displayExpenses.reduce((sum, e) => sum + e.amount, 0)
  const matchedExpenses = displayExpenses.filter((e) => e.matched)
  const unmatchedExpensesAll = displayExpenses.filter((e) => !e.matched)
  const matchedTotal = matchedExpenses.reduce((sum, e) => sum + e.amount, 0)
  const unmatchedTotal = unmatchedExpensesAll.reduce((sum, e) => sum + e.amount, 0)

  return (
    <Layout>
      <div className="space-y-8">
        {/* Cabecera */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/finances">
              <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-900">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Gastos</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Análisis por categoría, proveedor y proyecto
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <PaymentConceptGuide />
            <DateRangePicker onRangeChange={handleDateRangeChange} defaultRange={currentDateRange} />
          </div>
        </div>

        {/* KPIs del período */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Total del período
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatCurrency(expensesTotal)}</p>
              <p className="text-[11px] text-slate-400 mt-1">{displayExpenses.length} movimientos</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200/60 shadow-sm bg-gradient-to-br from-emerald-50/40 to-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/80 mb-1.5">
                Con factura
              </p>
              <p className="text-2xl font-semibold tabular-nums text-emerald-800">{formatCurrency(matchedTotal)}</p>
              <p className="text-[11px] text-slate-400 mt-1">{matchedExpenses.length} trabajados</p>
            </CardContent>
          </Card>
          <Card className="border-rose-200/60 shadow-sm bg-gradient-to-br from-rose-50/30 to-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700/80 mb-1.5">
                Sin factura
              </p>
              <p className="text-2xl font-semibold tabular-nums text-rose-800">{formatCurrency(unmatchedTotal)}</p>
              <p className="text-[11px] text-slate-400 mt-1">{unmatchedExpensesAll.length} pendientes</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                IVA acumulado
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatCurrency(totalVat)}</p>
              <p className="text-[11px] text-slate-400 mt-1">Facturas de gasto</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm bg-white">
            <CardContent className="pt-5 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                IRPF acumulado
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatCurrency(totalIrpf)}</p>
              <p className="text-[11px] text-slate-400 mt-1">Facturas de gasto</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">En qué gastamos</CardTitle>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Desglose del período por proveedor, nómina, marketing y más
            </p>
          </CardHeader>
          <CardContent className="pt-5">
            <ExpenseVendorBarChart data={expenseAnalytics.vendor_spend} />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="border-slate-200/80 shadow-sm lg:col-span-3">
            <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
              <CardTitle className="text-base font-semibold text-slate-900">Evolución por categoría</CardTitle>
              <p className="text-xs text-slate-500 font-normal mt-0.5">Últimos 12 meses · apilado por tipo</p>
            </CardHeader>
            <CardContent className="pt-5">
              <ExpenseBucketTimelineChart data={expenseAnalytics.monthly_timeline} />
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm lg:col-span-2">
            <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
              <CardTitle className="text-base font-semibold text-slate-900">Distribución del período</CardTitle>
              <p className="text-xs text-slate-500 font-normal mt-0.5">Por concepto bancario normalizado</p>
            </CardHeader>
            <CardContent className="pt-5 overflow-visible">
              <FinanceCategoryDonut
                data={expenseAnalytics.bucket_breakdown}
                emptyMessage="Sin gastos en el período seleccionado"
                variant="expense"
                compact
              />
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">Simulador de ahorro</CardTitle>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Marca plataformas a cancelar y mira el impacto mensual y a 12 meses
            </p>
          </CardHeader>
          <CardContent className="pt-5">
            <ExpenseSavingsSimulator
              items={expenseAnalytics.cuttable_items}
              currentRecurringMonthly={expenseAnalytics.totals.recurring_monthly}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
              <CardTitle className="text-base font-semibold text-slate-900">Gasto por proyecto (DEV)</CardTitle>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Pagos con concepto DEV {`{nombre}`} {`{proyecto-id}`}
              </p>
            </CardHeader>
            <CardContent className="pt-5">
              <ProjectSpendChart data={expenseAnalytics.project_spend} />
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
              <CardTitle className="text-base font-semibold text-slate-900">Análisis IA de gastos</CardTitle>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Brechas, riesgos y oportunidades de ahorro en el período
              </p>
            </CardHeader>
            <CardContent className="pt-5">
              <ExpenseAiPanel
                periodStart={format(currentDateRange.start ?? defaultRange.start!, 'yyyy-MM-dd')}
                periodEnd={format(currentDateRange.end ?? defaultRange.end!, 'yyyy-MM-dd')}
              />
            </CardContent>
          </Card>
        </div>

        {/* Acciones rápidas para gastos */}
        <div className="grid gap-4 md:grid-cols-1">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/30 pb-4">
              <CardTitle className="text-base font-semibold text-slate-900">Alertas sin factura</CardTitle>
            </CardHeader>
            <CardContent>
              {displayUnmatched.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No hay gastos del banco sin una factura de gasto asociada en este rango de fechas.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 font-medium text-sm text-gray-700">Fecha</th>
                        <th className="text-left p-3 font-medium text-sm text-gray-700">Descripción</th>
                        <th className="text-left p-3 font-medium text-sm text-gray-700">Cuenta</th>
                        <th className="text-right p-3 font-medium text-sm text-gray-700">Importe</th>
                        <th className="text-center p-3 font-medium text-sm text-gray-700">Factura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayUnmatched.slice(0, 10).map((expense) => (
                        <tr key={expense.id} className="border-b bg-red-50 hover:bg-red-100">
                          <td className="p-3 text-sm text-gray-600">
                            {format(new Date(expense.date), 'dd/MM/yyyy')}
                          </td>
                          <td className="p-3 text-sm text-gray-900">{expense.description || '-'}</td>
                          <td className="p-3 text-sm text-gray-600">{expense.account_name || '-'}</td>
                          <td className="p-3 text-right text-sm font-medium text-red-700">
                            {formatCurrency(expense.amount)}
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Colgar factura de este gasto"
                              onClick={() => handleOpenUpload(expense.id)}
                            >
                              <Upload className="h-4 w-4 text-gray-600" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {displayUnmatched.length > 10 && (
                    <p className="mt-2 text-xs text-gray-400">
                      Mostrando 10 de {displayUnmatched.length} gastos sin factura de gasto.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Todos los Gastos */}
        <div className="space-y-4 border-t border-gray-200 pt-4">
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Todos los Gastos del Período</CardTitle>
            </CardHeader>
            <CardContent>
              {expenses.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No hay gastos en el rango seleccionado</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 font-medium text-sm text-gray-700">Fecha</th>
                        <th className="text-left p-3 font-medium text-sm text-gray-700">Descripción</th>
                        <th className="text-left p-3 font-medium text-sm text-gray-700">Cuenta</th>
                        <th className="text-right p-3 font-medium text-sm text-gray-700">Importe</th>
                        <th className="text-center p-3 font-medium text-sm text-gray-700">Factura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayExpenses.map((expense) => (
                        <tr
                          key={expense.id}
                          className={`border-b ${
                            expense.matched ? 'bg-green-50 hover:bg-green-100' : 'bg-red-50 hover:bg-red-100'
                          }`}
                        >
                          <td className="p-3 text-sm text-gray-600">
                            {format(new Date(expense.date), 'dd/MM/yyyy')}
                          </td>
                          <td className="p-3 text-sm text-gray-900">{expense.description || '-'}</td>
                          <td className="p-3 text-sm text-gray-600">{expense.account_name || '-'}</td>
                          <td
                            className={`p-3 text-right text-sm font-medium ${
                              expense.matched ? 'text-green-700' : 'text-red-700'
                            }`}
                          >
                            {formatCurrency(expense.amount)}
                          </td>
                          <td className="p-3 text-center">
                            {!expense.matched && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Colgar factura de este gasto"
                                onClick={() => handleOpenUpload(expense.id)}
                              >
                                <Upload className="h-4 w-4 text-gray-600" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Diálogo para colgar factura de gasto */}
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Colgar factura de gasto</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitUpload} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="upload_concept">
                    Concepto
                  </label>
                  <input
                    id="upload_concept"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={uploadConcept}
                    onChange={(e) => setUploadConcept(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="upload_date">
                    Fecha
                  </label>
                  <input
                    id="upload_date"
                    type="date"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={uploadDate}
                    onChange={(e) => setUploadDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Base a la izquierda */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Base (€)</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-medium">
                    {(() => {
                      const total = parseFloat(uploadTotalAmount) || 0
                      const iva = parseFloat(uploadIvaPercent) || 0
                      if (amountIncludesVat && iva > 0) {
                        return formatCurrency(total / (1 + iva / 100))
                      }
                      return formatCurrency(total)
                    })()}
                  </div>
                </div>
                {/* IVA % */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="upload_iva_percent">
                    IVA %
                  </label>
                  <input
                    id="upload_iva_percent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    value={uploadIvaPercent}
                    onChange={(e) => setUploadIvaPercent(e.target.value)}
                    disabled={!amountIncludesVat}
                  />
                </div>
                {/* IRPF */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="upload_irpf_amount">
                    IRPF (€)
                  </label>
                  <input
                    id="upload_irpf_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={uploadIrpfAmount}
                    onChange={(e) => setUploadIrpfAmount(e.target.value)}
                  />
                  <p className="text-xs text-gray-400">Por defecto 0</p>
                </div>
                {/* Total a la derecha */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="upload_total_amount">
                    Total del gasto (€)
                  </label>
                  <input
                    id="upload_total_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={uploadTotalAmount}
                    onChange={(e) => setUploadTotalAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Selector de si el importe incluye IVA o no, a lo ancho */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  className={`flex-1 text-xs sm:text-sm px-3 py-2 rounded-full border transition-colors ${
                    amountIncludesVat
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'border-gray-300 text-gray-700 bg-white'
                  }`}
                  onClick={() => setAmountIncludesVat(true)}
                >
                  Importe con IVA (el total ya incluye IVA)
                </button>
                <button
                  type="button"
                  className={`flex-1 text-xs sm:text-sm px-3 py-2 rounded-full border transition-colors ${
                    !amountIncludesVat
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'border-gray-300 text-gray-700 bg-white'
                  }`}
                  onClick={() => setAmountIncludesVat(false)}
                >
                  Importe sin IVA (total sin impuestos)
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Documento de factura</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex-1 text-xs sm:text-sm px-3 py-2 rounded-full border transition-colors ${
                      uploadHasInvoice
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'border-gray-300 text-gray-700 bg-white'
                    }`}
                    onClick={() => setUploadHasInvoice(true)}
                  >
                    Tengo factura
                  </button>
                  <button
                    type="button"
                    className={`flex-1 text-xs sm:text-sm px-3 py-2 rounded-full border transition-colors ${
                      !uploadHasInvoice
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'border-gray-300 text-gray-700 bg-white'
                    }`}
                    onClick={() => setUploadHasInvoice(false)}
                  >
                    No tengo factura
                  </button>
                </div>

                {uploadHasInvoice ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700" htmlFor="upload_file">
                      Factura adjunta (archivo)
                    </label>
                    <input
                      id="upload_file"
                      type="file"
                      accept="application/pdf,image/*"
                      className="w-full text-sm"
                      onChange={(e) => {
                        const selected = e.target.files?.[0] || null
                        setUploadFile(selected)
                      }}
                    />
                    <p className="text-xs text-gray-500">
                      Sube el PDF o imagen de la factura. Se enviará automáticamente a Drive vía n8n.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700" htmlFor="upload_no_invoice_note">
                      Nota (opcional, aparece debajo del título en el PDF)
                    </label>
                    <Textarea
                      id="upload_no_invoice_note"
                      value={uploadNoInvoiceNote}
                      onChange={(e) => setUploadNoInvoiceNote(e.target.value)}
                      placeholder="Ej: Ticket perdido, pago en efectivo sin factura, abono bancario..."
                      rows={4}
                    />
                    <p className="text-xs text-gray-500">
                      Se generará un PDF con «No hay factura» centrado y tu nota debajo, si la escribes.
                    </p>
                  </div>
                )}
              </div>

              {uploadError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {uploadError}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setUploadOpen(false)}
                  disabled={uploadLoading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={uploadLoading}>
                  {uploadLoading ? 'Subiendo...' : 'Guardar gasto y factura'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}
