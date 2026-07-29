'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { FinanceMonthPoint } from '@/lib/finance/dashboard-analytics.types'

function fmtEur(n: number) {
  return `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`
}

export default function FinanceTimelineChart({
  data,
}: {
  data: FinanceMonthPoint[]
  highlightPeriod?: string
}) {
  const chartData = data.map((d) => ({
    ...d,
    name: d.label,
  }))

  const has = chartData.some(
    (d) => d.invoiced_eur > 0 || d.collected_eur > 0 || d.expenses_eur > 0 || d.mensualidad_eur > 0
  )
  if (!has) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-gray-400">
        Sin movimientos en estos meses
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
        />
        <Tooltip
          formatter={(value: number, name: string) => [fmtEur(value), name]}
          contentStyle={{
            borderRadius: 12,
            border: 'none',
            background: '#111827',
            color: '#fff',
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="invoiced_eur"
          name="Facturado"
          stroke="#111827"
          strokeWidth={2.5}
          dot={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="collected_eur"
          name="Cobrado"
          stroke="#059669"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="expenses_eur"
          name="Gastos"
          stroke="#DC2626"
          strokeWidth={1.75}
          strokeOpacity={0.85}
          dot={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="mensualidad_eur"
          name="Mensualidad"
          stroke="#2563EB"
          strokeWidth={1.75}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
