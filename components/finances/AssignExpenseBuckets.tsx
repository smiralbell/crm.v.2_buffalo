'use client'

import { useMemo, useState } from 'react'
import { Loader2, Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  PAYMENT_BUCKET_LABELS,
  PAYMENT_BUCKETS,
  parsePaymentConcept,
  type PaymentBucket,
} from '@/lib/finance/payment-concepts'
import { cn } from '@/lib/utils'

export type AssignableExpense = {
  id: string
  date: string
  amount: number
  description: string
  expense_bucket: PaymentBucket | null
}

type FilterMode = 'needs' | 'all' | PaymentBucket

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount)

const formatDate = (iso: string) => {
  const d = iso.slice(0, 10)
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function effectiveBucket(row: AssignableExpense): PaymentBucket {
  if (row.expense_bucket) return row.expense_bucket
  return parsePaymentConcept(row.description || 'Sin concepto').bucket
}

export default function AssignExpenseBuckets({
  expenses,
  className,
  onChanged,
}: {
  expenses: AssignableExpense[]
  className?: string
  onChanged?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<AssignableExpense[]>(expenses)
  const [filter, setFilter] = useState<FilterMode>('needs')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const openDialog = () => {
    setRows(expenses)
    setFilter('needs')
    setError('')
    setOpen(true)
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const bucket = effectiveBucket(r)
      if (filter === 'all') return true
      if (filter === 'needs') {
        return !r.expense_bucket && bucket === 'other'
      }
      return bucket === filter
    })
  }, [rows, filter])

  const needsCount = useMemo(
    () => rows.filter((r) => !r.expense_bucket && effectiveBucket(r) === 'other').length,
    [rows]
  )

  const assign = async (id: string, next: PaymentBucket | null) => {
    setSavingId(id)
    setError('')
    try {
      const res = await fetch(`/api/finance/bank-transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expense_bucket: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, expense_bucket: next } : r))
      )
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          'h-9 gap-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shrink-0',
          className
        )}
        onClick={openDialog}
      >
        <Tags className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Asignar gastos</span>
        <span className="sm:hidden">Asignar</span>
        {needsCount > 0 ? (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
            {needsCount}
          </span>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0 gap-0 sm:rounded-2xl flex flex-col">
          <DialogHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5 shrink-0">
            <div className="flex flex-col items-center gap-2 pr-6 text-center">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shrink-0">
                <Tags className="h-4 w-4" />
              </span>
              <div>
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                  Asignar gastos
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-1">
                  Plataformas SaaS · personas/servicios · impuestos · marketing…
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="px-5 pt-4 pb-2 shrink-0 space-y-3">
            <p className="text-center text-sm text-slate-600 leading-relaxed">
              Clasifica movimientos que el banco no etiqueta solo (tarjeta, SEPA, etc.). La asignación
              queda guardada y alimenta los gráficos de Gastos.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {(
                [
                  { id: 'needs' as const, label: 'Sin clasificar' },
                  { id: 'all' as const, label: 'Todos' },
                  ...PAYMENT_BUCKETS.map((b) => ({ id: b as FilterMode, label: PAYMENT_BUCKET_LABELS[b] })),
                ] as Array<{ id: FilterMode; label: string }>
              ).map((opt) => (
                <button
                  key={String(opt.id)}
                  type="button"
                  onClick={() => setFilter(opt.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                    filter === opt.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {error ? (
              <p className="text-center text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-5 min-h-0">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-slate-500 py-10">
                No hay movimientos en este filtro.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
                {filtered.map((row) => {
                  const auto = parsePaymentConcept(row.description || 'Sin concepto')
                  const current = row.expense_bucket ?? auto.bucket
                  const isSaving = savingId === row.id
                  return (
                    <li
                      key={row.id}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 px-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[11px] tabular-nums text-slate-400 shrink-0">
                            {formatDate(row.date)}
                          </span>
                          <span className="text-sm font-medium text-slate-900 truncate">
                            {row.description || 'Sin concepto'}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span className="tabular-nums font-semibold text-slate-800">
                            {formatCurrency(row.amount)}
                          </span>
                          {row.expense_bucket ? (
                            <span className="rounded bg-indigo-50 text-indigo-700 px-1.5 py-0.5">
                              Manual
                            </span>
                          ) : (
                            <span className="rounded bg-slate-100 text-slate-500 px-1.5 py-0.5">
                              Auto: {auto.bucket_label}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={current}
                          disabled={isSaving}
                          onValueChange={(v) => {
                            const bucket = v as PaymentBucket
                            void assign(row.id, bucket)
                          }}
                        >
                          <SelectTrigger className="h-9 w-[200px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_BUCKETS.map((b) => (
                              <SelectItem key={b} value={b} className="text-xs">
                                {PAYMENT_BUCKET_LABELS[b]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {row.expense_bucket ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 text-xs text-slate-500"
                            disabled={isSaving}
                            onClick={() => void assign(row.id, null)}
                            title="Volver a detección automática"
                          >
                            Auto
                          </Button>
                        ) : null}
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
