'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { DeveloperProjectHoursRow } from '@/lib/developer/work-charts'

const BAR_FILL = '#111827'
const BAR_ACTIVE = '#374151'

function truncateName(name: string, max = 22): string {
  if (name.length <= max) return name
  return `${name.slice(0, max - 1)}…`
}

export default function DeveloperHoursByProjectChart({
  data,
}: {
  data: DeveloperProjectHoursRow[]
}) {
  if (data.length === 0) {
    return (
      <div className="h-56 flex flex-col items-center justify-center text-sm text-gray-400 px-4 text-center gap-1">
        <p>Aún no hay horas por proyecto</p>
        <p className="text-xs text-gray-300">Completa tareas en tus proyectos asignados</p>
      </div>
    )
  }

  const chartData = data.map((row) => ({
    ...row,
    short_name: truncateName(row.project_name),
  }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 40)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}h`}
        />
        <YAxis
          type="category"
          dataKey="short_name"
          width={130}
          tick={{ fontSize: 10, fill: '#6B7280' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as DeveloperProjectHoursRow
            return (
              <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg max-w-[240px]">
                <p className="font-semibold mb-1">{row.project_name}</p>
                <p>{row.hours}h estimadas completadas</p>
                <p className="text-gray-400 mt-0.5">
                  {row.tasks_done} tarea{row.tasks_done === 1 ? '' : 's'} hecha
                  {row.tasks_done === 1 ? '' : 's'}
                </p>
              </div>
            )
          }}
          cursor={false}
          shared={false}
        />
        <Bar
          dataKey="hours"
          fill={BAR_FILL}
          activeBar={{ fill: BAR_ACTIVE }}
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
