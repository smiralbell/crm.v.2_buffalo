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
import type { MonthlyIncomePoint } from '@/lib/finance/income-analytics'
import { fmtEur } from '@/lib/finance/chart-theme'

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
    <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-lg shadow-xl max-w-[220px]">
      <p className="text-slate-400 mb-1.5 font-medium">{label}</p>
      <p className="font-semibold mb-2">{fmtEur(total)} total</p>
      <div className="space-y-0.5">
        {payload
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.name} className="flex justify-between gap-3">
              <span className="text-slate-400">{p.name}</span>
              <span>{fmtEur(p.value)}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

export default function IncomeTimelineChart({ data }: { data: MonthlyIncomePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-400 px-4 text-center">
        Sin ingresos en los últimos 12 meses
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#94A3B8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94A3B8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
        />
        <Tooltip content={<TooltipContent />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value) => <span className="text-slate-600">{value}</span>}
        />
        <Bar dataKey="recurring" name="MRR / recurrente" stackId="a" fill="#7C3AED" radius={[0, 0, 0, 0]} />
        <Bar dataKey="one_off" name="Puntual" stackId="a" fill="#0F172A" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
