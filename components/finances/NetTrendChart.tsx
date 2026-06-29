'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { NetTrendPoint } from '@/lib/finance/types'
import { fmtEur } from '@/lib/finance/chart-theme'

const TooltipContent = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) => {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  return (
    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg">
      <p className="text-gray-400 mb-0.5">{label}</p>
      <p className={v >= 0 ? 'text-white' : 'text-gray-300'}>{fmtEur(v)}</p>
    </div>
  )
}

export default function NetTrendChart({ data }: { data: NetTrendPoint[] }) {
  const hasData = data.some((d) => d.net !== 0)

  if (!hasData) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-gray-400">
        Sin datos de beneficio neto mensual
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          width={42}
        />
        <ReferenceLine y={0} stroke="#E5E7EB" strokeWidth={1} />
        <Tooltip content={<TooltipContent />} />
        <Line
          type="monotone"
          dataKey="net"
          stroke="#111827"
          strokeWidth={2}
          dot={{ fill: '#111827', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#111827', stroke: '#fff', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
