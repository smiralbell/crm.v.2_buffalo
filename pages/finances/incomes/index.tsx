import { GetServerSideProps } from 'next'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Link2 } from 'lucide-react'
import Link from 'next/link'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns'
import DateRangePicker, { DateRangePickerResult } from '@/components/DateRangePicker'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface LinkedInvoice {
  id: number
  invoice_number: string
  client_name: string
  total: number
  issue_date: string
}

interface IncomeRow {
  id: string
  date: string
  amount: number
  description: string
  account_name: string
  matched: boolean
  linkedInvoice?: LinkedInvoice
}

interface IncomesPageProps {
  incomes: IncomeRow[]
  invoicesForLink: LinkedInvoice[]
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
      startDate = startOfMonth(now)
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
    }>(
      `SELECT 
        bt.id,
        bt.date,
        bt.amount,
        bt.description,
        ba.name as account_name
       FROM bank_transactions bt
       LEFT JOIN bank_accounts ba ON bt.account_id = ba.id
       WHERE bt.date >= $1 AND bt.date <= $2 AND bt.amount > 0
       ORDER BY bt.date DESC`,
      [startStr, endStr]
    )

    const incomesBase = incomesResult.rows.map((i) => ({
      id: i.id,
      date: i.date instanceof Date ? i.date.toISOString() : (i.date ?? null),
      amount: Number(i.amount),
      description: i.description ?? '',
      account_name: i.account_name ?? '',
    }))

    let linkedByBtId = new Map<string | null, LinkedInvoice>()
    let invoicesForLinkRaw: Array<{
      id: number
      invoice_number: string
      client_name: string
      total: unknown
      issue_date: Date
    }> = []

    try {
      const linkedResult = await query<{
        id: number
        invoice_number: string
        client_name: string
        total: number
        issue_date: Date | string
        bank_transaction_id: string
      }>(
        `SELECT id, invoice_number, client_name, total, issue_date, bank_transaction_id
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
          issue_date: true,
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

    return {
      props: {
        incomes,
        invoicesForLink: invoicesForLinkRaw.map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          client_name: inv.client_name,
          total: Number(inv.total),
          issue_date: inv.issue_date.toISOString(),
        })),
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
  dateRange: initialDateRange,
}: IncomesPageProps) {
  const router = useRouter()
  const [incomes, setIncomes] = useState<IncomeRow[]>(initialIncomes)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [selectedIncomeId, setSelectedIncomeId] = useState<string | null>(null)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    setIncomes(initialIncomes)
  }, [initialIncomes])

  const now = new Date()
  const defaultRange: DateRangePickerResult = {
    start: startOfMonth(now),
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

  const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0)
  const matchedCount = incomes.filter((i) => i.matched).length
  const unmatchedCount = incomes.length - matchedCount
  const currentDateRange = dateRange || defaultRange

  const handleOpenLinkModal = (incomeId: string) => {
    setSelectedIncomeId(incomeId)
    setSelectedInvoiceId('')
    setLinkError(null)
    setLinkModalOpen(true)
  }

  const handleSubmitLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedIncomeId || !selectedInvoiceId) return
    setLinkError(null)
    setLinkLoading(true)
    try {
      const res = await fetch(`/api/invoices/${selectedInvoiceId}`, {
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
      const income = incomes.find((i) => i.id === selectedIncomeId)
      const inv = invoicesForLink.find((f) => f.id === parseInt(selectedInvoiceId, 10))
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
                    issue_date: inv.issue_date,
                  },
                }
              : i
          )
        )
      }
      setLinkModalOpen(false)
      setSelectedIncomeId(null)
      setSelectedInvoiceId('')
    } catch (err) {
      setLinkError('Error de conexión')
    }
    setLinkLoading(false)
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/finances">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <DateRangePicker onRangeChange={handleDateRangeChange} defaultRange={currentDateRange} />
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Total ingresos del período</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(totalIncome)}</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Con factura emitida</p>
              <p className="text-2xl font-semibold text-green-700">{matchedCount}</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Sin factura emitida</p>
              <p className="text-2xl font-semibold text-red-700">{unmatchedCount}</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-500 mb-2">Movimientos</p>
              <p className="text-2xl font-semibold text-gray-900">{incomes.length}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Ingresos del extracto</CardTitle>
          </CardHeader>
          <CardContent>
            {incomes.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No hay ingresos en el rango seleccionado</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-3 font-medium text-sm text-gray-700">Fecha</th>
                      <th className="text-left p-3 font-medium text-sm text-gray-700">Concepto</th>
                      <th className="text-left p-3 font-medium text-sm text-gray-700">Cuenta</th>
                      <th className="text-right p-3 font-medium text-sm text-gray-700">Importe</th>
                      <th className="text-left p-3 font-medium text-sm text-gray-700">Relacionado con factura</th>
                      <th className="text-right p-3 font-medium text-sm text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomes.map((income) => (
                      <tr
                        key={income.id}
                        className={`border-b hover:opacity-90 ${
                          income.matched ? 'bg-green-50' : 'bg-red-50'
                        }`}
                      >
                        <td className="p-3 text-sm text-gray-600">
                          {format(new Date(income.date), 'dd MMM yyyy')}
                        </td>
                        <td className="p-3 text-sm text-gray-900">{income.description || '—'}</td>
                        <td className="p-3 text-sm text-gray-600">{income.account_name || '—'}</td>
                        <td className="p-3 text-right text-sm font-medium text-gray-900">
                          {formatCurrency(income.amount)}
                        </td>
                        <td className="p-3 text-sm text-gray-600">
                          {income.linkedInvoice ? (
                            <Link
                              href={`/invoices/${income.linkedInvoice.id}`}
                              className="text-green-700 hover:underline font-medium"
                            >
                              {income.linkedInvoice.invoice_number} – {income.linkedInvoice.client_name}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end">
                            {!income.matched && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-blue-600 hover:text-blue-800"
                                onClick={() => handleOpenLinkModal(income.id)}
                              >
                                <Link2 className="h-4 w-4 mr-1" />
                                Relacionar con factura
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

        <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Relacionar ingreso con factura emitida</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitLink} className="space-y-4">
              <p className="text-sm text-gray-600">
                Elige la factura emitida que corresponde a este cobro del extracto.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="link-invoice-select">
                  Factura
                </label>
                <select
                  id="link-invoice-select"
                  value={selectedInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Seleccionar factura...</option>
                  {invoicesForLink.map((inv) => (
                    <option key={inv.id} value={String(inv.id)}>
                      {inv.invoice_number} – {inv.client_name} – {formatCurrency(inv.total)}
                    </option>
                  ))}
                </select>
                {invoicesForLink.length === 0 && (
                  <p className="text-sm text-amber-600">
                    No hay facturas enviadas. Ve a Facturas y marca alguna como &quot;Enviada&quot; para poder vincularla aquí.
                  </p>
                )}
              </div>
              {linkError && (
                <p className="text-sm text-red-600">{linkError}</p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLinkModalOpen(false)}
                  disabled={linkLoading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={linkLoading || !selectedInvoiceId}>
                  {linkLoading ? 'Guardando...' : 'Vincular'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}

