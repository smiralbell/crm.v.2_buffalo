'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { MonthlyBucketPoint } from '@/lib/finance/expense-analytics'
import { BUCKET_CHART_COLORS } from '@/lib/finance/expense-analytics'
import { fmtEur } from '@/lib/finance/chart-theme'

const SERIES = [
  { key: 'platform' as const, label: 'Plataformas' },
  { key: 'payroll' as const, label: 'Nóminas' },
  { key: 'developer' as const, label: 'Developers' },
  { key: 'marketing' as const, label: 'Marketing' },
  { key: 'professional' as const, label: 'Profesionales' },
  { key: 'tax' as const, label: 'Impuestos' },
  { key: 'other' as const, label: 'Otros' },
]

const TooltipContent = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg max-w-[220px]">
      <p className="text-gray-400 mb-1.5 font-medium">{label}</p>
      <p className="font-semibold mb-2">{fmtEur(total)} total</p>
      <div className="space-y-0.5">
        {payload
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.name} className="flex justify-between gap-3">
              <span className="text-gray-400">{p.name}</span>
              <span>{fmtEur(p.value)}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

export default function ExpenseBucketTimelineChart({ data }: { data: MonthlyBucketPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-400 px-4 text-center">
        Sin datos temporales en este período
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          width={42}
        />
        <Tooltip content={<TooltipContent />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value) => <span className="text-gray-600">{value}</span>}
        />
        {SERIES.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="expenses"
            fill={BUCKET_CHART_COLORS[s.key]}
            radius={s.key === 'other' ? [4, 4, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
