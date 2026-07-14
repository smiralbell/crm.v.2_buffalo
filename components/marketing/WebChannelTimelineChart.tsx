'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WebTimelinePoint } from '@/lib/marketing/web-dashboard.types'

const CHANNELS = [
  { key: 'form' as const, label: 'Formulario', color: '#374151' },
  { key: 'cal' as const, label: 'Calendario', color: '#8B5CF6' },
  { key: 'chat' as const, label: 'Widget chat', color: '#3B82F6' },
]

function TooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg space-y-1">
      <p className="text-gray-400">{label}</p>
      {payload.map((p) => {
        const ch = CHANNELS.find((c) => c.key === p.dataKey)
        return (
          <p key={p.dataKey} style={{ color: p.color }}>
            {ch?.label}: <span className="font-semibold text-white">{p.value}</span>
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
      <div className="h-56 flex items-center justify-center text-sm text-gray-400">
        Sin actividad en el período seleccionado
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {CHANNELS.map((c) => (
            <linearGradient key={c.key} id={`web-${c.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={c.color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={c.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#9CA3AF' }}
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
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value) => CHANNELS.find((c) => c.key === value)?.label || value}
        />
        {CHANNELS.map((c) => (
          <Area
            key={c.key}
            type="monotone"
            dataKey={c.key}
            name={c.key}
            stroke={c.color}
            fill={`url(#web-${c.key})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
