'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { CuttableExpenseItem } from '@/lib/finance/expense-analytics'
import { fmtEur } from '@/lib/finance/chart-theme'
import { Badge } from '@/components/ui/badge'

const DETECTION_LABELS = {
  concept: 'Concepto',
  pattern: 'Auto',
  recurrence: '2+ meses',
} as const

export default function ExpenseSavingsSimulator({
  items,
  currentRecurringMonthly,
}: {
  items: CuttableExpenseItem[]
  currentRecurringMonthly: number
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.vendor_key)))

  const savingsMonthly = useMemo(
    () =>
      items
        .filter((i) => selected.has(i.vendor_key))
        .reduce((s, i) => s + i.monthly_equivalent, 0),
    [items, selected]
  )

  const projection = useMemo(() => {
    const months = ['Hoy', '3m', '6m', '9m', '12m']
    return months.map((label, idx) => {
      const factor = idx === 0 ? 0 : idx * 3
      return {
        label,
        acumulado: Math.round(savingsMonthly * factor * 100) / 100,
      }
    })
  }, [savingsMonthly])

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-500">
        No hay plataformas o marketing recurrentes detectados para simular ahorro.
      </div>
    )
  }

  const savingsAnnual = Math.round(savingsMonthly * 12 * 100) / 100
  const newRecurring = Math.max(0, currentRecurringMonthly - savingsMonthly)
  const pctOfRecurring =
    currentRecurringMonthly > 0
      ? Math.round((savingsMonthly / currentRecurringMonthly) * 100)
      : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
          <p className="text-[10px] uppercase tracking-wide text-emerald-700">Ahorro mensual</p>
          <p className="text-xl font-bold text-emerald-800 tabular-nums">{fmtEur(savingsMonthly)}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
          <p className="text-[10px] uppercase tracking-wide text-emerald-700">Ahorro anual</p>
          <p className="text-xl font-bold text-emerald-800 tabular-nums">{fmtEur(savingsAnnual)}</p>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Gasto recurrente pasaría de{' '}
        <span className="font-medium text-gray-800">{fmtEur(currentRecurringMonthly)}/mes</span> a{' '}
        <span className="font-medium text-gray-800">{fmtEur(newRecurring)}/mes</span>
        {pctOfRecurring > 0 && ` (−${pctOfRecurring}%)`}
      </p>

      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
        {items.map((item) => (
          <label
            key={item.vendor_key}
            className="flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-2 cursor-pointer hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selected.has(item.vendor_key)}
              onChange={() => toggle(item.vendor_key)}
              className="rounded border-gray-300"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 truncate">{item.label}</p>
              <p className="text-[10px] text-gray-400">
                {fmtEur(item.monthly_equivalent)}/mes · {item.months_active} meses activo
              </p>
            </div>
            <Badge variant="outline" className="text-[9px] shrink-0">
              {DETECTION_LABELS[item.detection_source]}
            </Badge>
          </label>
        ))}
      </div>

      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">Proyección de ahorro acumulado</p>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={projection} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16A34A" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              width={36}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg">
                    <p className="text-gray-400">{label}</p>
                    <p className="font-semibold">{fmtEur(payload[0].value as number)} ahorrados</p>
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="acumulado"
              stroke="#16A34A"
              strokeWidth={2}
              fill="url(#savingsGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
