'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { ClientIncomeRow } from '@/lib/finance/income-analytics'
import { chartColor, fmtEur, fmtPct } from '@/lib/finance/chart-theme'

export default function IncomeClientBarChart({
  data,
  limit = 12,
}: {
  data: ClientIncomeRow[]
  limit?: number
}) {
  const chartData = data.slice(0, limit).map((d, i) => ({
    ...d,
    fill: chartColor(i),
  }))

  if (data.length === 0) {
    return (
      <div className="h-52 flex flex-col items-center justify-center text-sm text-slate-400 px-4 text-center gap-1">
        <p>Sin ingresos en este período</p>
        <p className="text-xs">Usa concepto FAC {'{cliente}'} {'{nº factura}'} en transferencias</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 34)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={{ fontSize: 11, fill: '#334155' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as ClientIncomeRow & { fill: string }
              return (
                <div className="bg-slate-900 text-white text-xs px-3 py-2.5 rounded-lg shadow-xl max-w-[240px]">
                  <p className="font-semibold mb-1 leading-snug">{row.label}</p>
                  <p>{fmtEur(row.total)}</p>
                  <p className="text-slate-400 mt-1">
                    {fmtPct(row.percentage)} del total · {row.payment_count} cobros
                  </p>
                  {row.recurring_total > 0 && (
                    <p className="text-slate-400">{fmtEur(row.recurring_total)} marcados MRR</p>
                  )}
                </div>
              )
            }}
            cursor={{ fill: '#F8FAFC' }}
          />
          <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {chartData.map((entry) => (
              <Cell key={entry.client_key} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
