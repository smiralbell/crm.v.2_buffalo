'use client'

import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHANNEL_COLORS, type ChannelBreakdownRow } from '@/lib/leads/analytics.types'

function formatEur(n: number) {
  return `${n.toLocaleString('es-ES', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })} €`
}

function ChannelBarTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: ChannelBreakdownRow & { name: string } }>
}) {
  if (!active || !payload?.[0]?.payload) return null
  const row = payload[0].payload
  const fmtRatio = (n: number | null) =>
    n == null ? '—' : `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 shadow-md min-w-[210px]">
      <p className="text-xs font-semibold text-gray-900 mb-2">{row.label || row.name}</p>
      <div className="space-y-1 text-xs text-gray-600">
        <p>
          <span className="text-gray-400">Leads</span>
          <span className="float-right font-semibold text-gray-900">{row.leads}</span>
        </p>
        <p>
          <span className="text-gray-400">Inversión</span>
          <span className="float-right font-semibold text-gray-900">
            {row.spend_eur > 0 ? formatEur(row.spend_eur) : 'Sin coste'}
          </span>
        </p>
        <p>
          <span className="text-gray-400">€ / € (leads)</span>
          <span className="float-right font-semibold text-gray-900">
            {fmtRatio(row.eur_per_euro_leads)}
          </span>
        </p>
        <p>
          <span className="text-gray-400">€ / € (clientes)</span>
          <span className="float-right font-semibold text-gray-900">
            {fmtRatio(row.eur_per_euro_clients)}
          </span>
        </p>
        <p>
          <span className="text-gray-400">ROI clientes</span>
          <span className="float-right font-semibold text-gray-900">
            {row.return_pct != null
              ? `${row.return_pct.toLocaleString('es-ES')}%`
              : '—'}
          </span>
        </p>
      </div>
    </div>
  )
}

type BarShapeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  index?: number
  activeIndex: number | null
}

function GrowingBarShape(props: BarShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, fill, index, activeIndex } = props
  const active = activeIndex != null && index === activeIndex
  const growX = active ? 6 : 0
  const growY = active ? 8 : 0
  return (
    <Rectangle
      x={x - growX / 2}
      y={y - growY}
      width={width + growX}
      height={Math.max(0, height + growY)}
      fill={fill}
      radius={[8, 8, 0, 0] as unknown as number}
      style={{
        transition: 'all 160ms ease-out',
        filter: active ? 'brightness(1.08)' : undefined,
      }}
    />
  )
}

export default function LeadsChannelBarChart({
  rows,
  onBarClick,
}: {
  rows: ChannelBreakdownRow[]
  onBarClick?: (row: ChannelBreakdownRow) => void
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  if (!rows.length) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-gray-400">
        Sin datos por canal
      </div>
    )
  }

  const data = rows.map((r) => ({
    ...r,
    name: r.label,
  }))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={data}
        margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
        onMouseLeave={() => setActiveIndex(null)}
        onClick={(state) => {
          const payload = state?.activePayload?.[0]?.payload as ChannelBreakdownRow | undefined
          if (payload && onBarClick) onBarClick(payload)
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
          cursor={false}
          content={<ChannelBarTooltip />}
          isAnimationActive={false}
        />
        <Bar
          dataKey="leads"
          name="Leads"
          maxBarSize={44}
          cursor={onBarClick ? 'pointer' : 'default'}
          isAnimationActive={false}
          activeBar={false}
          shape={(shapeProps: unknown) => (
            <GrowingBarShape
              {...(shapeProps as BarShapeProps)}
              activeIndex={activeIndex}
            />
          )}
          onMouseEnter={(_, index) => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(null)}
        >
          {data.map((d) => (
            <Cell key={d.channel} fill={CHANNEL_COLORS[d.channel]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
