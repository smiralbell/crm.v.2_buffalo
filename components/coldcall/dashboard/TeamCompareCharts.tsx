'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const COLORS = ['#111827', '#4B5563', '#9CA3AF', '#D1D5DB', '#6B7280', '#374151']

export function TeamCallsBarChart({
  data,
}: {
  data: { name: string; calls_week: number }[]
}) {
  if (!data.some((d) => d.calls_week > 0)) {
    return <EmptyChart />
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={100}
          tick={{ fontSize: 11, fill: '#374151' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }} />
        <Bar dataKey="calls_week" name="Llamadas esta semana" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TeamDurationBarChart({
  data,
}: {
  data: { name: string; duration_min: number }[]
}) {
  if (!data.some((d) => d.duration_min > 0)) {
    return <EmptyChart />
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={100}
          tick={{ fontSize: 11, fill: '#374151' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(v: number) => [`${v} min`, 'Tiempo en llamadas']}
          contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
        />
        <Bar dataKey="duration_min" name="Minutos (semana)" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TeamActivityTrendChart({
  data,
  series,
}: {
  data: Array<{ date: string; label: string; [key: string]: number | string }>
  series: { key: string; name: string }[]
}) {
  const hasData = data.some((d) => series.some((s) => Number(d[s.key] || 0) > 0))
  if (!hasData) return <EmptyChart tall />

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          interval={2}
        />
        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={28} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function EmptyChart({ tall = false }: { tall?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center text-sm text-gray-400 ${tall ? 'h-[260px]' : 'h-[220px]'}`}
    >
      Sin actividad registrada
    </div>
  )
}
