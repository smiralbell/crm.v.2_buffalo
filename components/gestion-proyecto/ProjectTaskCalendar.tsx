'use client'

import { useMemo, useRef } from 'react'
import FullCalendarImport from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core'
import esLocale from '@fullcalendar/core/locales/es'
import type { ComponentRef } from 'react'
import { TASK_STATUS_LABELS } from '@/lib/gestion-proyecto/task-stale'
import type { ProjectTask } from '@/lib/gestion-proyecto/types'

const FullCalendar =
  typeof FullCalendarImport === 'function'
    ? FullCalendarImport
    : ((FullCalendarImport as { default?: typeof FullCalendarImport }).default as typeof FullCalendarImport)

const STATUS_COLORS: Record<string, string> = {
  pending: '#94a3b8',
  in_progress: '#6366f1',
  buffalo_validation: '#8b5cf6',
  done: '#10b981',
}

type Props = {
  tasks: ProjectTask[]
  onSelectTask: (task: ProjectTask) => void
  onMoveDueDate: (taskId: string, dueDate: string) => void
}

export default function ProjectTaskCalendar({ tasks, onSelectTask, onMoveDueDate }: Props) {
  const calendarRef = useRef<ComponentRef<typeof FullCalendar> | null>(null)

  const events = useMemo<EventInput[]>(() => {
    return tasks
      .filter((t) => t.due_date)
      .map((t) => ({
        id: t.id,
        title: t.title,
        start: t.due_date!,
        allDay: true,
        backgroundColor: STATUS_COLORS[t.status] || '#64748b',
        borderColor: STATUS_COLORS[t.status] || '#64748b',
        extendedProps: { task: t },
      }))
  }, [tasks])

  const withDue = tasks.filter((t) => t.due_date).length

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 min-w-0">
      {withDue === 0 && (
        <p className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Ninguna tarea tiene fecha de finalización. Añádela al crear o editar para verlas aquí.
        </p>
      )}
      <div className="project-task-calendar [&_.fc]:text-sm [&_.fc-toolbar-title]:text-base [&_.fc-toolbar-title]:font-semibold [&_.fc-button]:rounded-lg [&_.fc-button]:text-xs [&_.fc-button]:shadow-none [&_.fc-daygrid-event]:rounded-md [&_.fc-daygrid-event]:px-1">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={esLocale}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth',
          }}
          height="auto"
          events={events}
          editable
          eventDurationEditable={false}
          eventClick={(arg: EventClickArg) => {
            const task = arg.event.extendedProps.task as ProjectTask | undefined
            if (task) onSelectTask(task)
          }}
          eventDrop={(arg: EventDropArg) => {
            const date = arg.event.startStr?.slice(0, 10)
            if (!date) {
              arg.revert()
              return
            }
            onMoveDueDate(arg.event.id, date)
          }}
          eventDidMount={(info) => {
            const task = info.event.extendedProps.task as ProjectTask | undefined
            if (task) {
              info.el.title = `${task.title} · ${TASK_STATUS_LABELS[task.status]}`
            }
          }}
        />
      </div>
    </div>
  )
}
