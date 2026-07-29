'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { OpsRecurringMonthPoint } from '@/lib/finance/expense-analytics'
import { fmtEur } from '@/lib/finance/chart-theme'

const TooltipContent = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; payload?: OpsRecurringMonthPoint }>
  label?: string
}) => {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  const total = payload[0]?.value ?? 0
  return (
    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg max-w-[240px]">
      <p className="text-gray-400 mb-1.5 font-medium">{label}</p>
      <p className="font-semibold mb-2">{fmtEur(total)}</p>
      {point ? (
        <div className="space-y-0.5 text-gray-300">
          {point.platform > 0 ? (
            <div className="flex justify-between gap-3">
              <span>SaaS</span>
              <span>{fmtEur(point.platform)}</span>
            </div>
          ) : null}
          {point.marketing > 0 ? (
            <div className="flex justify-between gap-3">
              <span>Marketing</span>
              <span>{fmtEur(point.marketing)}</span>
            </div>
          ) : null}
          {point.professional > 0 ? (
            <div className="flex justify-between gap-3">
              <span>Profesionales</span>
              <span>{fmtEur(point.professional)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="text-gray-500 mt-2 text-[10px]">Clic para ver el detalle</p>
    </div>
  )
}

export default function OpsRecurringChart({
  data,
  onMonthClick,
}: {
  data: OpsRecurringMonthPoint[]
  onMonthClick?: (monthKey: string) => void
}) {
  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-gray-400 px-4 text-center">
        Sin gastos recurrentes en este período
      </div>
    )
  }

  const handleClick = (state: unknown) => {
    if (!onMonthClick) return
    const s = state as {
      activePayload?: Array<{ payload?: OpsRecurringMonthPoint }>
    } | null
    const point = s?.activePayload?.[0]?.payload
    if (point?.month_key) onMonthClick(point.month_key)
  }

  return (
    <div className={onMonthClick ? 'cursor-pointer' : undefined}>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={handleClick}
        >
          <defs>
            <linearGradient id="opsRecurringFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.02} />
            </linearGradient>
          </defs>
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
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            width={42}
          />
          <Tooltip content={<TooltipContent />} />
          <Area
            type="monotone"
            dataKey="total"
            name="Recurrentes"
            stroke="#4F46E5"
            strokeWidth={2}
            fill="url(#opsRecurringFill)"
            dot={{ r: 4, fill: '#4F46E5', strokeWidth: 0, cursor: 'pointer' }}
            activeDot={{ r: 6, cursor: 'pointer' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
