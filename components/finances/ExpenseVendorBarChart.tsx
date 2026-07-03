'use client'

import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  BUCKET_CHART_COLORS,
  type VendorSpendRow,
} from '@/lib/finance/expense-analytics'
import type { PaymentBucket } from '@/lib/finance/payment-concepts'
import { PAYMENT_BUCKET_LABELS } from '@/lib/finance/payment-concepts'
import { fmtEur, fmtPct } from '@/lib/finance/chart-theme'

const FILTER_OPTIONS: Array<{ id: 'all' | PaymentBucket; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'platform', label: 'Plataformas' },
  { id: 'payroll', label: 'Nóminas' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'developer', label: 'Developers' },
  { id: 'professional', label: 'Profesionales' },
  { id: 'tax', label: 'Impuestos' },
  { id: 'other', label: 'Otros' },
]

export default function ExpenseVendorBarChart({
  data,
  limit = 14,
}: {
  data: VendorSpendRow[]
  limit?: number
}) {
  const [filter, setFilter] = useState<'all' | PaymentBucket>('all')

  const chartData = useMemo(() => {
    const filtered =
      filter === 'all' ? data : data.filter((d) => d.bucket === filter)
    return filtered.slice(0, limit).map((d) => ({
      ...d,
      fill: BUCKET_CHART_COLORS[d.bucket],
    }))
  }, [data, filter, limit])

  if (data.length === 0) {
    return (
      <div className="h-52 flex flex-col items-center justify-center text-sm text-gray-400 px-4 text-center gap-1">
        <p>Sin gastos clasificados en este período</p>
        <p className="text-xs">Los cargos de tarjeta (Twilio, Cursor…) se detectan solos</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map((opt) => {
          const count =
            opt.id === 'all'
              ? data.length
              : data.filter((d) => d.bucket === opt.id).length
          if (opt.id !== 'all' && count === 0) return null
          const active = filter === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                active
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              {opt.label}
              {opt.id !== 'all' && ` (${count})`}
            </button>
          )
        })}
      </div>

      {chartData.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Sin gastos en esta categoría</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 34)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: '#94A3B8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={130}
              tick={{ fontSize: 11, fill: '#334155' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload as VendorSpendRow & { fill: string }
                return (
                  <div className="bg-slate-900 text-white text-xs px-3 py-2.5 rounded-lg shadow-xl max-w-[240px] border border-slate-700/50">
                    <p className="font-semibold mb-1 leading-snug">{row.label}</p>
                    <p>{fmtEur(row.total)}</p>
                    <p className="text-gray-400 mt-1">
                      {row.bucket_label} · {fmtPct(row.percentage)} del total
                    </p>
                    <p className="text-gray-400">{row.payment_count} pagos</p>
                  </div>
                )
              }}
              cursor={{ fill: '#F9FAFB' }}
            />
            <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {chartData.map((entry) => (
                <Cell key={entry.vendor_key} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className="flex flex-wrap gap-3 pt-1">
        {(Object.keys(PAYMENT_BUCKET_LABELS) as PaymentBucket[]).map((bucket) => {
          const has = data.some((d) => d.bucket === bucket)
          if (!has) return null
          return (
            <span key={bucket} className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: BUCKET_CHART_COLORS[bucket] }}
              />
              {PAYMENT_BUCKET_LABELS[bucket]}
            </span>
          )
        })}
      </div>
    </div>
  )
}
