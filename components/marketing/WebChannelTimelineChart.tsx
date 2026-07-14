'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WebTimelinePoint } from '@/lib/marketing/web-dashboard.types'

const SERIES = [
  { key: 'form' as const, label: 'Formulario', stroke: '#111827' },
  { key: 'cal' as const, label: 'Calendario', stroke: '#6B7280' },
  { key: 'chat' as const, label: 'Widget', stroke: '#9CA3AF' },
]

function TooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg space-y-1">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p) => {
        const s = SERIES.find((x) => x.key === p.dataKey)
        return (
          <p key={p.dataKey}>
            {s?.label}: <span className="font-semibold">{p.value}</span>
          </p>
        )
      })}
    </div>
  )
}

export default function WebChannelTimelineChart({ data }: { data: WebTimelinePoint[] }) {
  const hasData = data.some((d) => d.form > 0 || d.cal > 0 || d.chat > 0)

  if (!hasData) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-gray-400">
        Sin actividad en el período seleccionado
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip content={<TooltipContent />} />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.stroke}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: s.stroke }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
