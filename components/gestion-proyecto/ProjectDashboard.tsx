'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { formatDashboardDate } from '@/lib/gestion-proyecto/dashboard-metrics'
import type { ProjectDashboardData } from '@/lib/gestion-proyecto/types'
import ProjectAiPanel from '@/components/gestion-proyecto/ProjectAiPanel'
import { cn } from '@/lib/utils'

const CHART = {
  lineCreated: '#93C5FD',
  lineCompleted: '#86EFAC',
  lineOpen: '#D1D5DB',
  barPrimary: '#A5B4FC',
  barSecondary: '#C4B5FD',
  barMuted: '#E2E8F0',
  pie: ['#CBD5E1', '#94A3B8', '#64748B'],
  stackDone: '#86EFAC',
  stackActive: '#93C5FD',
  stackPending: '#E5E7EB',
} as const

const serviceLabel: Record<string, string> = {
  voice_agent: 'Agente de Voz',
  text_agent: 'Agente de Chat',
  dashboard_app: 'Dashboard',
  automation: 'Automatización',
  lead_gen: 'Generación de leads',
  geo_seo: 'GEO / SEO',
}

const statusLabel: Record<string, string> = {
  development: 'En desarrollo',
  active: 'Activo',
  paused: 'Pausado',
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="border border-gray-200 rounded-2xl bg-white p-4 shadow-sm h-full">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}

function ProgressBar({
  label,
  value,
  dark,
}: {
  label: string
  value: number
  dark?: boolean
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)))
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1.5">
        <span className={dark ? 'text-gray-400' : 'text-gray-600'}>{label}</span>
        <span className={dark ? 'text-gray-500' : 'text-gray-500'}>{pct}%</span>
      </div>
      <div className={cn('h-1.5 rounded-full overflow-hidden', dark ? 'bg-white/15' : 'bg-gray-100')}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', dark ? 'bg-white/80' : 'bg-gray-900')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('border border-gray-200 rounded-2xl bg-white shadow-sm', className)}>
      <div className="px-5 pt-5 pb-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function HBarTooltip({
  active,
  payload,
  label,
  valueLabel = 'Tareas',
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; color?: string }>
  label?: string
  valueLabel?: string
}) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg">
      <p className="text-gray-400 mb-0.5 truncate max-w-[200px]">{label}</p>
      <p className="font-semibold tabular-nums">
        {item.value} {valueLabel}
      </p>
    </div>
  )
}

interface ProjectDashboardProps {
  projectId: string
}

export default function ProjectDashboard({ projectId }: ProjectDashboardProps) {
  const [data, setData] = useState<ProjectDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [targetEnd, setTargetEnd] = useState('')
  const [savingEnd, setSavingEnd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/gestion-proyecto/proyectos/${projectId}/dashboard`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || json.hint || 'Error al cargar dashboard')
      setData(json)
      setTargetEnd(json.timeline.dev_target_end_date || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const saveTargetEnd = async () => {
    setSavingEnd(true)
    try {
      const res = await fetch(`/api/gestion-proyecto/proyectos/${projectId}/dashboard`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dev_target_end_date: targetEnd || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || json.hint || 'No se pudo guardar')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar fecha')
    } finally {
      setSavingEnd(false)
    }
  }

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center gap-3 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Cargando métricas...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {error || 'No se pudieron cargar las métricas'}
      </div>
    )
  }

  const statusDonut = [
    { name: 'Pendiente', value: data.task_counts.pending },
    { name: 'En curso', value: data.task_counts.in_progress },
    { name: 'Validación Buffalo', value: data.task_counts.buffalo_validation },
    { name: 'Hecho', value: data.task_counts.done },
  ].filter((d) => d.value > 0)

  const priorityChart = data.by_priority
    .filter((p) => p.count > 0)
    .map((p, i) => ({ name: p.label, value: p.count, fill: [CHART.barPrimary, CHART.barSecondary, CHART.barMuted][i % 3] }))

  const assigneeStacked = data.by_assignee.map((a) => ({
    name: a.assignee.length > 22 ? `${a.assignee.slice(0, 20)}…` : a.assignee,
    fullName: a.assignee,
    hechas: a.done,
    en_curso: a.in_progress,
    validacion: a.buffalo_validation,
    pendientes: a.pending,
  }))

  return (
    <div className="space-y-4">
      {/* Hero oscuro */}
      <div className="rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-850 to-gray-900 text-white p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 uppercase tracking-wide">
              {serviceLabel[data.proyecto.service_type] || data.proyecto.service_type}
              {data.proyecto.config_ref && (
                <span className="ml-2 font-mono text-[11px] text-gray-500">
                  {data.proyecto.config_ref}
                </span>
              )}
            </p>
            <h2 className="text-xl font-semibold mt-1 break-words">{data.proyecto.name}</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {statusLabel[data.proyecto.status] || data.proyecto.status}
            </p>
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Inicio</dt>
                <dd className="font-medium text-white mt-0.5">
                  {formatDashboardDate(data.timeline.start_date)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Fin previsto</dt>
                <dd className="font-medium text-white mt-0.5">
                  {formatDashboardDate(data.timeline.end_date)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Tiempo transcurrido</dt>
                <dd className="font-medium text-white mt-0.5">
                  {data.timeline.days_elapsed} días
                  {data.timeline.days_total != null && (
                    <span className="text-gray-500 font-normal"> / {data.timeline.days_total}</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
          <div className="lg:w-64 shrink-0 space-y-3">
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
              <ProgressBar dark label="Avance de tareas" value={data.task_counts.completion_pct} />
              <ProgressBar dark label="Tiempo del proyecto" value={data.timeline.time_progress_pct ?? 0} />
            </div>
            <div className="flex gap-2">
              <Input
                type="date"
                value={targetEnd}
                onChange={(e) => setTargetEnd(e.target.value)}
                className="bg-white/10 border-white/20 text-white text-sm h-9 [color-scheme:dark]"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={saveTargetEnd}
                disabled={savingEnd}
                className="shrink-0 h-9 bg-white/10 text-white border-white/20 hover:bg-white/20"
              >
                {savingEnd ? '...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Tareas totales" value={data.task_counts.total} />
        <KpiCard
          label="Pendientes"
          value={data.task_counts.pending}
          sub={`${data.hours.pending_estimated}h estimadas`}
        />
        <KpiCard
          label="En curso"
          value={data.task_counts.in_progress}
          sub={`${data.hours.in_progress_estimated}h estimadas`}
        />
        <KpiCard label="Validación Buffalo" value={data.task_counts.buffalo_validation} />
        <KpiCard
          label="Finalizadas"
          value={data.task_counts.done}
          sub={`${data.hours.done_estimated}h completadas`}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Horas totales" value={`${data.hours.total_estimated}h`} sub="Estimación" />
        <KpiCard label="Hechas (7 días)" value={data.velocity.tasks_done_last_7d} />
        <KpiCard label="Hechas (30 días)" value={data.velocity.tasks_done_last_30d} />
        <KpiCard
          label="Tiempo medio"
          value={data.velocity.avg_days_to_complete != null ? `${data.velocity.avg_days_to_complete}d` : '—'}
          sub="Por tarea"
        />
      </div>

      <Panel title="Evolución de tareas" subtitle="Acumulado de tareas creadas vs completadas">
        {data.activity_timeline.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-sm text-gray-400">
            Sin tareas todavía
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.activity_timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Line
                type="monotone"
                dataKey="created_cumulative"
                name="Creadas"
                stroke={CHART.lineCreated}
                strokeWidth={2}
                dot={{ r: 2, fill: CHART.lineCreated, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="completed_cumulative"
                name="Completadas"
                stroke={CHART.lineCompleted}
                strokeWidth={2}
                dot={{ r: 2, fill: CHART.lineCompleted, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="open"
                name="Abiertas"
                stroke={CHART.lineOpen}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Estado de las tareas">
          {statusDonut.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">Sin tareas</div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={statusDonut}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={72}
                    paddingAngle={2}
                  >
                    {statusDonut.map((_, i) => (
                      <Cell key={i} fill={CHART.pie[i % CHART.pie.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 min-w-[120px]">
                {statusDonut.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: CHART.pie[i % CHART.pie.length] }}
                      />
                      {d.name}
                    </span>
                    <span className="font-semibold tabular-nums text-gray-900">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Por prioridad">
          {priorityChart.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">Sin tareas</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, priorityChart.length * 40)}>
              <BarChart
                data={priorityChart}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={56}
                  tick={{ fontSize: 12, fill: '#374151' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  shared={false}
                  cursor={{ fill: '#F9FAFB' }}
                  content={<HBarTooltip valueLabel="tareas" />}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {priorityChart.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Carga por persona" subtitle="Distribución de tareas por miembro del equipo">
        {assigneeStacked.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-sm text-gray-400">
            Asigna personas al crear tareas para ver la distribución
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, assigneeStacked.length * 44)}>
            <BarChart
              data={assigneeStacked}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 11, fill: '#374151' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                shared={false}
                cursor={{ fill: '#F9FAFB' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg">
                      <p className="text-gray-400 mb-1 truncate max-w-[200px]">{label}</p>
                      {payload.map((p) => (
                        <p key={p.dataKey} className="tabular-nums">
                          <span style={{ color: p.color }}>●</span>{' '}
                          {p.name}: {p.value}
                        </p>
                      ))}
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="hechas"
                name="Hechas"
                stackId="stack"
                fill={CHART.stackDone}
                maxBarSize={24}
              />
              <Bar
                dataKey="validacion"
                name="Validación"
                stackId="stack"
                fill="#a78bfa"
                maxBarSize={24}
              />
              <Bar
                dataKey="en_curso"
                name="En curso"
                stackId="stack"
                fill={CHART.stackActive}
                maxBarSize={24}
              />
              <Bar
                dataKey="pendientes"
                name="Pendientes"
                stackId="stack"
                fill={CHART.stackPending}
                radius={[0, 4, 4, 0]}
                maxBarSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Análisis IA del proyecto" subtitle="Diagnóstico, riesgos, mejoras y predicciones">
        <ProjectAiPanel projectId={projectId} />
      </Panel>
    </div>
  )
}
