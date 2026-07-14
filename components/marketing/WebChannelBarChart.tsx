'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WebChannelTotals } from '@/lib/marketing/web-dashboard.types'

const ITEMS = [
  { key: 'form' as const, label: 'Formulario', color: '#374151' },
  { key: 'cal' as const, label: 'Calendario', color: '#8B5CF6' },
  { key: 'chat' as const, label: 'Widget', color: '#3B82F6' },
]

export default function WebChannelBarChart({ totals }: { totals: WebChannelTotals }) {
  const data = ITEMS.map((item) => ({
    name: item.label,
    value: totals[item.key],
    color: item.color,
  }))

  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: '#6B7280' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          domain={[0, max + Math.ceil(max * 0.15)]}
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
          cursor={{ fill: '#f9fafb' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as { name: string; value: number }
            return (
              <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg">
                <p className="text-gray-400">{row.name}</p>
                <p className="font-semibold">{row.value}</p>
              </div>
            )
          }}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
