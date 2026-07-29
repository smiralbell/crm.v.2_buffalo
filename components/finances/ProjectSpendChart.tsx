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
import type { ProjectSpendRow } from '@/lib/finance/expense-analytics'
import { chartColor, fmtEur } from '@/lib/finance/chart-theme'

export default function ProjectSpendChart({ data }: { data: ProjectSpendRow[] }) {
  if (data.length === 0) {
    return (
      <div className="h-52 flex flex-col items-center justify-center text-sm text-gray-400 px-4 text-center gap-1">
        <p>Sin pagos a developers por proyecto</p>
        <p className="text-xs">Usa conceptos tipo DEV 3 LAURA BUF-2026-0042</p>
      </div>
    )
  }

  const chartData = data.slice(0, 10).map((d, i) => ({
    ...d,
    fill: chartColor(i),
  }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 36)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
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
          dataKey="project_id"
          width={120}
          tick={{ fontSize: 10, fill: '#6B7280' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as ProjectSpendRow
            return (
              <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg">
                <p className="font-semibold mb-1">{row.project_id}</p>
                <p>Total: {fmtEur(row.total)}</p>
                <p className="text-gray-400">~{fmtEur(row.monthly_avg)}/mes · {row.payment_count} pagos</p>
                {row.developers.length > 0 && (
                  <p className="text-gray-400 mt-1">Devs: {row.developers.join(', ')}</p>
                )}
              </div>
            )
          }}
          cursor={{ fill: '#F9FAFB' }}
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {chartData.map((entry) => (
            <Cell key={entry.project_id} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
