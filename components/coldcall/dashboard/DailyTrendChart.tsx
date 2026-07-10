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

interface DayPoint {
  date: string
  label: string
  calls: number
  interested: number
  meetings: number
}

export default function DailyTrendChart({ data }: { data: DayPoint[] }) {
  const hasData = data.some((d) => d.calls > 0)

  if (!hasData) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-400">
        Aún no hay actividad registrada
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          interval={4}
        />
        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={28} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="calls"
          name="Llamadas"
          stroke="#9CA3AF"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="interested"
          name="Interesados"
          stroke="#6B7280"
          strokeWidth={2}
          dot={false}
          strokeDasharray="4 4"
        />
        <Line
          type="monotone"
          dataKey="meetings"
          name="Reuniones"
          stroke="#111827"
          strokeWidth={2}
          dot={{ r: 2, fill: '#111827', strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
