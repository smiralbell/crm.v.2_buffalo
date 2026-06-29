'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { MonthlyCashFlow } from '@/lib/finance/types'
import { COLORS, fmtEur } from '@/lib/finance/chart-theme'

const TooltipContent = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; name: string }>
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-gray-100">
          {p.name}: {fmtEur(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function CashFlowChart({ data }: { data: MonthlyCashFlow[] }) {
  const hasData = data.some((d) => d.income > 0 || d.expenses > 0)

  if (!hasData) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-gray-400">
        Conecta el banco y sincroniza para ver el flujo de caja
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          width={42}
        />
        <Tooltip content={<TooltipContent />} cursor={{ fill: '#F9FAFB' }} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
        <Bar dataKey="income" name="Entradas" fill={COLORS.income} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expenses" name="Salidas" fill={COLORS.expense} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}
