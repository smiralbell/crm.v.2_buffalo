import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { listAspsps, EnableBankingConfigError } from '@/lib/enable-banking/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft, Landmark, Loader2, AlertCircle, CheckCircle2, RefreshCw,
} from 'lucide-react'

interface Aspsp {
  name: string
  country: string
  psu_types?: string[]
}

interface PageProps {
  banks: Aspsp[]
  banksError: string
  initialBank: string
}

interface TxRow {
  date: string
  concept: string
  amount: string
  currency: string
}

function fmtEur(amount: string | number, currency = 'EUR') {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(n)
}

function extractPrimaryBalance(balances: unknown): { label: string; amount: string; currency: string } | null {
  if (!balances || typeof balances !== 'object') return null
  const list = (balances as { balances?: unknown[] }).balances
  if (!Array.isArray(list) || !list.length) return null
  const b = list[0] as {
    name?: string
    balance_amount?: { amount?: string; currency?: string }
  }
  if (!b.balance_amount?.amount) return null
  return {
    label: b.name || 'Saldo',
    amount: b.balance_amount.amount,
    currency: b.balance_amount.currency || 'EUR',
  }
}

function extractTransactions(raw: unknown): TxRow[] {
  if (!raw || typeof raw !== 'object') return []
  const list = (raw as { transactions?: unknown[] }).transactions
  if (!Array.isArray(list)) return []

  return list.map((t) => {
    const tx = t as {
      booking_date?: string
      value_date?: string
      remittance_information?: string[]
      creditor?: { name?: string }
      debtor?: { name?: string }
      transaction_amount?: { amount?: string; currency?: string }
    }
    const date = tx.booking_date || tx.value_date || '—'
    const parts = [
      ...(tx.remittance_information || []),
      tx.creditor?.name,
      tx.debtor?.name,
    ].filter(Boolean)
    const concept = parts[0] || 'Movimiento'
    return {
      date,
      concept,
      amount: tx.transaction_amount?.amount ?? '—',
      currency: tx.transaction_amount?.currency || 'EUR',
    }
  })
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }

  let banks: Aspsp[] = []
  let banksError = ''
  try {
    banks = await listAspsps('ES')
  } catch (e) {
    if (e instanceof EnableBankingConfigError) {
      banksError = e.message
    } else {
      banksError = e instanceof Error ? e.message : 'No se pudo cargar el listado de bancos'
    }
  }

  return {
    props: {
      banks,
      banksError,
      initialBank: pickDefaultBank(banks),
    },
  }
}

function pickDefaultBank(banks: Aspsp[]): string {
  const caixa = banks.find((b) => /caixa/i.test(b.name))
  return caixa?.name || banks[0]?.name || ''
}

export default function FinancesBankTestPage({ banks, banksError, initialBank }: PageProps) {
  const router = useRouter()
  const [selectedBank, setSelectedBank] = useState(initialBank)
  const [connecting, setConnecting] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState(banksError)
  const [balances, setBalances] = useState<unknown>(null)
  const [transactions, setTransactions] = useState<unknown>(null)

  const status = router.query.status as string | undefined
  const statusMessage = router.query.message as string | undefined

  const isOk = status === 'ok'
  const isError = status === 'error'

  useEffect(() => {
    if (isError && statusMessage) {
      setError(decodeURIComponent(statusMessage))
    }
  }, [isError, statusMessage])

  const primaryBalance = useMemo(() => extractPrimaryBalance(balances), [balances])
  const txRows = useMemo(() => extractTransactions(transactions), [transactions])

  const connectBank = useCallback(async () => {
    if (!selectedBank) {
      setError('Selecciona un banco de la lista')
      return
    }
    setConnecting(true)
    setError('')
    try {
      const res = await fetch(`/api/bank/test/start?bank=${encodeURIComponent(selectedBank)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la conexión')
      if (!data.url) throw new Error('Respuesta sin URL de autorización')
      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión')
      setConnecting(false)
    }
  }, [selectedBank])

  const loadData = useCallback(async () => {
    setLoadingData(true)
    setError('')
    try {
      const res = await fetch('/api/bank/test/data')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar datos')
      setBalances(data.balances)
      setTransactions(data.transactions)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    } finally {
      setLoadingData(false)
    }
  }, [])

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/finances"
              className="inline-flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-500 rounded-lg hover:border-gray-300 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Prueba · PSD2</p>
              <h1 className="text-xl font-semibold text-gray-900">Finanzas (prueba banco)</h1>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wide">
            Módulo temporal
          </span>
        </div>

        <Card className="border border-amber-200 bg-amber-50/50 shadow-sm">
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-amber-900">
              Validación de conexión con <strong>Enable Banking</strong> (open banking PSD2).
              Este apartado es independiente del resto de finanzas y se puede eliminar cuando termine la prueba.
            </p>
          </CardContent>
        </Card>

        {isOk && !error && (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <p>Banco conectado correctamente. Pulsa &quot;Cargar movimientos&quot; para ver saldo y transacciones.</p>
          </div>
        )}

        {(error || isError) && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p>{error || statusMessage || 'Error en la autorización bancaria'}</p>
          </div>
        )}

        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Landmark className="h-5 w-5 text-gray-400" />
              Conexión bancaria
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Selecciona el banco</p>
              {banks.length === 0 ? (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {banksError
                    ? banksError
                    : 'No hay bancos disponibles. Revisa las variables ENABLEBANKING_* en EasyPanel.'}
                </p>
              ) : (
                <Select value={selectedBank} onValueChange={setSelectedBank}>
                  <SelectTrigger className="h-10 rounded-xl border-gray-200 bg-white shadow-sm w-full max-w-lg">
                    <SelectValue placeholder="Selecciona un banco" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-gray-200 shadow-lg max-h-72">
                    {banks.map((b) => (
                      <SelectItem key={`${b.country}-${b.name}`} value={b.name}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {banks.length > 0 && (
                <p className="text-[11px] text-gray-400">{banks.length} bancos disponibles en España</p>
              )}
            </div>
            <p className="text-sm text-gray-500">
              Inicia el flujo OAuth. Serás redirigido al banco para autorizar el acceso de lectura.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={connectBank}
                disabled={connecting || !selectedBank}
                className="bg-gray-900 hover:bg-gray-800"
              >
                {connecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Landmark className="h-4 w-4 mr-2" />
                )}
                Conectar banco
              </Button>
              {isOk && (
                <Button variant="outline" onClick={loadData} disabled={loadingData}>
                  {loadingData ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Cargar movimientos
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {primaryBalance && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border border-gray-200 shadow-sm">
              <CardContent className="pt-6">
                <p className="text-sm font-medium text-gray-500">{primaryBalance.label}</p>
                <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">
                  {fmtEur(primaryBalance.amount, primaryBalance.currency)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {txRows.length > 0 && (
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Movimientos</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0 sm:p-6 sm:pt-0">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Concepto</th>
                    <th className="px-4 py-3 font-medium text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {txRows.map((row, i) => (
                    <tr key={`${row.date}-${i}`} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{row.date}</td>
                      <td className="px-4 py-3 text-gray-900">{row.concept}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                        {fmtEur(row.amount, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  )
}
