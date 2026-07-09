'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { DeveloperDailyHoursPoint } from '@/lib/developer/work-charts'

const STROKE = '#111827'

const TooltipContent = ({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: DeveloperDailyHoursPoint }>
}) => {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg">
      <p className="text-gray-400 mb-0.5 capitalize">{row.label}</p>
      <p className="font-semibold">{row.hours}h completadas</p>
      {row.tasks > 0 && (
        <p className="text-gray-400 mt-0.5">
          {row.tasks} tarea{row.tasks === 1 ? '' : 's'} cerrada{row.tasks === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
}

export default function DeveloperWorkTimelineChart({
  data,
}: {
  data: DeveloperDailyHoursPoint[]
}) {
  const hasWork = data.some((d) => d.hours > 0)

  if (!hasWork) {
    return (
      <div className="h-56 flex flex-col items-center justify-center text-sm text-gray-400 px-4 text-center gap-1">
        <p>Sin horas registradas en los últimos 30 días</p>
        <p className="text-xs text-gray-300">Marca tareas como hechas para ver tu actividad aquí</p>
      </div>
    )
  }

  const tickInterval = Math.max(1, Math.floor(data.length / 6))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={(v) => `${v}h`}
        />
        <Tooltip content={<TooltipContent />} />
        <Line
          type="monotone"
          dataKey="hours"
          stroke={STROKE}
          strokeWidth={2}
          dot={{ fill: STROKE, r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: STROKE, stroke: '#fff', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
