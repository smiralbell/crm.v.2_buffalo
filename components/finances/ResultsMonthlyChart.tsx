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
import type { FiscalMonthlyRow } from '@/lib/finance/fiscal-summary'
import { fmtEur } from '@/lib/finance/chart-theme'

export default function ResultsMonthlyChart({ data }: { data: FiscalMonthlyRow[] }) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-400">
        Sin datos en el período
      </div>
    )
  }

  const chartData = data.map((m) => ({
    month: m.month_label,
    Ingresos: m.income_cash,
    Gastos: m.expenses_cash,
    Resultado: m.net_result,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: '#94A3B8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${Math.round(v / 1000)}k`}
        />
        <Tooltip
          formatter={(value: number) => fmtEur(value)}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="Ingresos" fill="#475569" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="Gastos" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="Resultado" fill="#1E293B" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}
