'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts'
import {
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  type ChannelKey,
  type TimelinePoint,
} from '@/lib/leads/analytics.types'

type Props = {
  data: TimelinePoint[]
  channels: ChannelKey[]
}

const ALWAYS_SERIES: ChannelKey[] = ['web', 'email', 'cold_calling']

export default function LeadsTimelineChart({ data, channels }: Props) {
  const series = Array.from(
    new Set<ChannelKey>([...ALWAYS_SERIES, ...channels])
  ).filter((ch) => ch !== 'unknown' || channels.includes('unknown'))

  // Normalize so every day has numeric 0 (never undefined/null) — lines never break
  const chartData = data.map((d) => {
    const row: Record<string, string | number> = {
      day: d.day,
      label: d.label,
      total: Number(d.total) || 0,
    }
    for (const ch of series) {
      row[ch] = Number(d[ch]) || 0
    }
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          domain={[0, 'auto']}
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
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
          dataKey="total"
          name="Total"
          stroke="#111827"
          strokeWidth={2.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        {series.map((ch) => (
          <Line
            key={ch}
            type="monotone"
            dataKey={ch}
            name={CHANNEL_LABELS[ch]}
            stroke={CHANNEL_COLORS[ch]}
            strokeWidth={1.5}
            dot={false}
            strokeOpacity={0.85}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
