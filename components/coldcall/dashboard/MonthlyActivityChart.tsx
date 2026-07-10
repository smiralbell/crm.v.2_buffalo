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

interface MonthPoint {
  month: string
  label: string
  calls: number
  interested: number
  meetings: number
  avg_duration_min: number
}

export default function MonthlyActivityChart({
  data,
  mode = 'activity',
}: {
  data: MonthPoint[]
  mode?: 'activity' | 'duration'
}) {
  const hasData =
    mode === 'duration'
      ? data.some((d) => d.avg_duration_min > 0)
      : data.some((d) => d.calls > 0)

  if (!hasData) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-gray-400">
        Sin datos mensuales
      </div>
    )
  }

  if (mode === 'duration') {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            width={32}
            unit=" min"
          />
          <Tooltip
            formatter={(v: number) => [`${v} min`, 'Duración media']}
            contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
          />
          <Bar dataKey="avg_duration_min" name="Duración" fill="#111827" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={28} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="calls" name="Llamadas" fill="#D1D5DB" radius={[3, 3, 0, 0]} />
        <Bar dataKey="interested" name="Interesados" fill="#6B7280" radius={[3, 3, 0, 0]} />
        <Bar dataKey="meetings" name="Reuniones" fill="#111827" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
