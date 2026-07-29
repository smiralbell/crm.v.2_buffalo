'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { OpsRecurringSeries } from '@/lib/finance/expense-analytics'
import { PAYMENT_BUCKET_LABELS } from '@/lib/finance/payment-concepts'
import { cn } from '@/lib/utils'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount)

const formatDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export default function OpsRecurringDetailDialog({
  open,
  onOpenChange,
  data,
  highlightMonthKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: OpsRecurringSeries
  /** Si se abre desde “último mes”, expandir ese mes */
  highlightMonthKey?: string
}) {
  const monthsDesc = useMemo(
    () =>
      [...data.months]
        .filter((m) => m.total > 0 || m.month_key === data.last_month_key)
        .sort((a, b) => b.month_key.localeCompare(a.month_key)),
    [data.months, data.last_month_key]
  )

  const [expanded, setExpanded] = useState('')

  useEffect(() => {
    if (!open) return
    setExpanded(highlightMonthKey || monthsDesc[0]?.month_key || '')
  }, [open, highlightMonthKey, monthsDesc])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0 sm:rounded-2xl flex flex-col">
        <DialogHeader className="border-b border-slate-100 px-6 py-5 shrink-0">
          <DialogTitle className="text-lg font-semibold text-slate-900">
            Gastos recurrentes por mes
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 mt-1">
            Plataformas SaaS · marketing · servicios profesionales
          </DialogDescription>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
            <span className="rounded-md bg-indigo-50 text-indigo-800 px-2 py-1 font-medium">
              Media {formatCurrency(data.average_monthly)} / mes
              <span className="text-indigo-500 font-normal">
                {' '}
                ({data.months_with_spend} meses con gasto)
              </span>
            </span>
            <span className="rounded-md bg-slate-100 text-slate-700 px-2 py-1 font-medium">
              Último ({data.last_month_label}): {formatCurrency(data.last_month_total)}
            </span>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0 space-y-2">
          {monthsDesc.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-10">
              Sin movimientos en estas categorías.
            </p>
          ) : (
            monthsDesc.map((month) => {
              const isOpen = expanded === month.month_key
              return (
                <div
                  key={month.month_key}
                  className={cn(
                    'rounded-xl border overflow-hidden',
                    month.month_key === data.last_month_key
                      ? 'border-indigo-200 bg-indigo-50/30'
                      : 'border-slate-200 bg-white'
                  )}
                >
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50/80"
                    onClick={() =>
                      setExpanded((prev) => (prev === month.month_key ? '' : month.month_key))
                    }
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{month.month}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {month.items.length} movimiento{month.items.length === 1 ? '' : 's'}
                        {month.platform > 0 ? ` · SaaS ${formatCurrency(month.platform)}` : ''}
                        {month.marketing > 0
                          ? ` · MKT ${formatCurrency(month.marketing)}`
                          : ''}
                        {month.professional > 0
                          ? ` · Prof. ${formatCurrency(month.professional)}`
                          : ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-slate-900 shrink-0">
                      {formatCurrency(month.total)}
                    </p>
                  </button>

                  {isOpen ? (
                    month.items.length === 0 ? (
                      <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400 bg-white">
                        Sin gastos de estas categorías este mes.
                      </p>
                    ) : (
                      <ul className="border-t border-slate-100 divide-y divide-slate-50 bg-white">
                        {month.items.map((item, idx) => (
                          <li
                            key={`${item.date}-${item.description}-${idx}`}
                            className="flex items-start justify-between gap-3 px-4 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-slate-800 truncate">{item.description}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {formatDate(item.date)} ·{' '}
                                {PAYMENT_BUCKET_LABELS[item.bucket] || item.bucket_label}
                              </p>
                            </div>
                            <span className="text-sm tabular-nums font-medium text-slate-900 shrink-0">
                              {formatCurrency(item.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
