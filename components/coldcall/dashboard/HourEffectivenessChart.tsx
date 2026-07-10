'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface HourPoint {
  hour: number
  label: string
  calls: number
  positive: number
  rate: number
}

export default function HourEffectivenessChart({ data }: { data: HourPoint[] }) {
  const hasData = data.some((d) => d.calls > 0)

  if (!hasData) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-gray-400">
        Sin llamadas en los últimos 30 días
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={1}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          interval={2}
        />
        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={24} />
        <Tooltip
          contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
          formatter={(value: number, name: string) => {
            if (name === 'Tasa positiva') return [`${value}%`, name]
            return [value, name]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="calls" name="Llamadas" fill="#E5E7EB" radius={[2, 2, 0, 0]} />
        <Bar dataKey="positive" name="Positivas" fill="#111827" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
