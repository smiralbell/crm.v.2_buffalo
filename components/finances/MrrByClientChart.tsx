'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import type { MrrClientRow } from '@/lib/finance/types'
import { chartColor, fmtEur } from '@/lib/finance/chart-theme'

const TooltipContent = ({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: MrrClientRow & { fill: string } }>
}) => {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg">
      <p className="text-gray-400 mb-0.5 truncate max-w-[180px]">{row.name}</p>
      <p className="font-semibold">{fmtEur(row.amount)}/mes</p>
    </div>
  )
}

export default function MrrByClientChart({ data }: { data: MrrClientRow[] }) {
  if (data.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-gray-400">
        Sin clientes activos con mensualidad
      </div>
    )
  }

  const chartData = data.map((d, i) => ({ ...d, fill: chartColor(i) }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={100}
          tick={{ fontSize: 11, fill: '#6B7280' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<TooltipContent />} cursor={{ fill: '#F9FAFB' }} />
        <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {chartData.map((entry, index) => (
            <Cell key={entry.name} fill={index === 0 ? '#111827' : entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
