'use client'

import { useMemo } from 'react'
import { addDays, differenceInCalendarDays, format, max, min, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { TASK_STATUS_LABELS } from '@/lib/gestion-proyecto/task-stale'
import type { ProjectTask } from '@/lib/gestion-proyecto/types'

const STATUS_BAR: Record<string, string> = {
  pending: 'bg-slate-400',
  in_progress: 'bg-indigo-500',
  buffalo_validation: 'bg-violet-500',
  done: 'bg-emerald-500',
}

type Props = {
  tasks: ProjectTask[]
  onSelectTask: (task: ProjectTask) => void
}

function toDay(iso: string): Date {
  return startOfDay(parseISO(iso.slice(0, 10)))
}

function taskRange(task: ProjectTask): { start: Date; end: Date } | null {
  if (!task.due_date) return null
  const end = toDay(task.due_date)
  const created = toDay(task.created_at)
  const hours = task.estimated_hours && task.estimated_hours > 0 ? task.estimated_hours : 8
  const spanDays = Math.max(1, Math.ceil(hours / 8))
  const startFromEstimate = addDays(end, -(spanDays - 1))
  const start = created <= end ? min([created, startFromEstimate]) : startFromEstimate
  return { start, end: max([start, end]) }
}

export default function ProjectTaskGantt({ tasks, onSelectTask }: Props) {
  const rows = useMemo(() => {
    return tasks
      .map((task) => {
        const range = taskRange(task)
        if (!range) return null
        return { task, ...range }
      })
      .filter((r): r is { task: ProjectTask; start: Date; end: Date } => Boolean(r))
      .sort((a, b) => a.start.getTime() - b.start.getTime() || a.task.title.localeCompare(b.task.title, 'es'))
  }, [tasks])

  const timeline = useMemo(() => {
    if (rows.length === 0) {
      const today = startOfDay(new Date())
      return { start: addDays(today, -7), days: 29 }
    }
    const start = addDays(min(rows.map((r) => r.start)), -2)
    const end = addDays(max(rows.map((r) => r.end)), 3)
    const days = Math.max(14, differenceInCalendarDays(end, start) + 1)
    return { start, days }
  }, [rows])

  const dayLabels = useMemo(() => {
    return Array.from({ length: timeline.days }, (_, i) => addDays(timeline.start, i))
  }, [timeline])

  const today = startOfDay(new Date())
  const todayOffset = differenceInCalendarDays(today, timeline.start)
  const showToday = todayOffset >= 0 && todayOffset < timeline.days
  const dayWidth = 36
  const chartWidth = timeline.days * dayWidth

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
        <p className="text-sm text-gray-500">
          No hay tareas con fecha de finalización para el diagrama de Gantt.
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Asigna una fecha al crear la tarea (o edítala) para verla aquí.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden min-w-0">
      <div className="overflow-x-auto">
        <div className="flex min-w-max">
          <div className="w-[220px] shrink-0 border-r border-gray-100 bg-white sticky left-0 z-[2]">
            <div className="h-[52px] flex items-center px-3 border-b border-gray-100 bg-gray-50/80 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Tarea
            </div>
            {rows.map(({ task }) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelectTask(task)}
                className="w-full h-12 px-3 text-left border-b border-gray-50 hover:bg-gray-50/80"
              >
                <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                <p className="text-[11px] text-gray-400 truncate">
                  {TASK_STATUS_LABELS[task.status]}
                  {task.assignee ? ` · ${task.assignee}` : ''}
                </p>
              </button>
            ))}
          </div>

          <div className="relative" style={{ width: chartWidth }}>
            <div className="flex h-[52px] border-b border-gray-100 bg-gray-50/80">
              {dayLabels.map((d) => (
                <div
                  key={d.toISOString()}
                  className={cn(
                    'shrink-0 border-l border-gray-100 px-0.5 py-2 text-center text-[10px] text-gray-400',
                    d.getDay() === 0 || d.getDay() === 6 ? 'bg-gray-50' : '',
                    differenceInCalendarDays(d, today) === 0 && 'bg-indigo-50 text-indigo-600 font-semibold'
                  )}
                  style={{ width: dayWidth }}
                  title={format(d, 'EEEE d MMM', { locale: es })}
                >
                  <div>{format(d, 'd')}</div>
                  <div className="opacity-70">{format(d, 'MMM', { locale: es })}</div>
                </div>
              ))}
            </div>

            {showToday && (
              <div
                className="absolute top-[52px] bottom-0 w-px bg-indigo-400/70 z-[1] pointer-events-none"
                style={{ left: todayOffset * dayWidth + dayWidth / 2 }}
              />
            )}

            {rows.map(({ task, start, end }) => {
              const left = differenceInCalendarDays(start, timeline.start)
              const span = differenceInCalendarDays(end, start) + 1
              return (
                <div key={task.id} className="relative h-12 border-b border-gray-50">
                  <button
                    type="button"
                    onClick={() => onSelectTask(task)}
                    className={cn(
                      'absolute top-1/2 -translate-y-1/2 h-7 rounded-md text-[10px] font-medium text-white px-2 truncate shadow-sm hover:brightness-95 transition',
                      STATUS_BAR[task.status] || 'bg-slate-500'
                    )}
                    style={{
                      left: left * dayWidth + 2,
                      width: Math.max(span * dayWidth - 4, 24),
                    }}
                    title={`${task.title}: ${format(start, 'dd/MM')} → ${format(end, 'dd/MM')}`}
                  >
                    {format(end, 'dd/MM')}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> Pendiente
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> En curso
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" /> Validación
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Hecho
        </span>
        <span className="ml-auto text-gray-400">Barra: inicio estimado → fecha de finalización</span>
      </div>
    </div>
  )
}
