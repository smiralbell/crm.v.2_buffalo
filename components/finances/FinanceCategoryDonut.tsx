'use client'

import { useState, useCallback } from 'react'
import { PieChart, Pie, Cell, Sector, ResponsiveContainer } from 'recharts'
import type { CategorySlice } from '@/lib/finance/types'
import { chartColor, fmtEur, fmtPct } from '@/lib/finance/chart-theme'

interface Props {
  data: CategorySlice[]
  emptyMessage: string
  variant?: 'expense' | 'income'
}

interface ActiveShapeProps {
  cx: number
  cy: number
  innerRadius: number
  outerRadius: number
  startAngle: number
  endAngle: number
  fill: string
}

function ActiveShape(props: ActiveShapeProps) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 10}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke="#fff"
      strokeWidth={2}
    />
  )
}

export default function FinanceCategoryDonut({ data, emptyMessage }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const chartData = data.map((d, i) => ({
    ...d,
    fill: chartColor(i),
  }))

  const active = activeIndex != null ? chartData[activeIndex] : null
  const total = data.reduce((s, d) => s + d.amount, 0)

  const onEnter = useCallback((_: unknown, index: number) => setActiveIndex(index), [])
  const onLeave = useCallback(() => setActiveIndex(null), [])

  if (total <= 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-gray-400 px-4 text-center">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-stretch min-h-[240px]">
      <div className="relative flex-1 min-w-0" style={{ minHeight: 220 }}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="amount"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={2}
              activeIndex={activeIndex ?? undefined}
              activeShape={ActiveShape as unknown as React.ReactElement}
              onMouseEnter={onEnter}
              onMouseLeave={onLeave}
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={entry.id}
                  fill={entry.fill}
                  opacity={activeIndex === null || activeIndex === index ? 1 : 0.28}
                  style={{ transition: 'opacity 0.2s ease', cursor: 'pointer' }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {activeIndex === null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900">{fmtEur(total)}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total</p>
            </div>
          </div>
        )}
      </div>

      <div className="sm:w-[200px] flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-gray-100 pt-4 sm:pt-0 sm:pl-4">
        {active ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: chartData[activeIndex!].fill }}
              />
              <p className="text-sm font-semibold text-gray-900 leading-tight">{active.label}</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{fmtEur(active.amount)}</p>
            <p className="text-xs text-gray-500">{fmtPct(active.percentage)} del total</p>
            <div className="pt-2 space-y-1 border-t border-gray-100">
              <p className="text-[11px] text-gray-500">
                <span className="text-gray-700 font-medium">{active.transaction_count}</span> movimientos
              </p>
              <p className="text-[11px] text-gray-500">
                Media: <span className="text-gray-700 font-medium">{fmtEur(active.avg_transaction)}</span>
              </p>
            </div>
            {active.top_descriptions.length > 0 && (
              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Conceptos frecuentes</p>
                <ul className="space-y-0.5">
                  {active.top_descriptions.map((desc) => (
                    <li key={desc} className="text-[11px] text-gray-600 truncate" title={desc}>
                      {desc}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">Desglose</p>
            {chartData.map((d, i) => (
              <button
                key={d.id}
                type="button"
                className="w-full flex items-center justify-between gap-2 text-left py-1 rounded hover:bg-gray-50 transition-colors"
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.fill }} />
                  <span className="text-xs text-gray-600 truncate">{d.label}</span>
                </span>
                <span className="text-xs font-medium text-gray-900 flex-shrink-0">{fmtPct(d.percentage)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
