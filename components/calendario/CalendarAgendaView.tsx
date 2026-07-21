import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { CalendarApiEvent } from '@/components/calendario/calendar-types'
import {
  fmtEventTime,
  groupEventsByDay,
  madridTodayKey,
} from '@/components/calendario/calendar-utils'
import { Building2, ChevronRight, StickyNote, Video } from 'lucide-react'

type Props = {
  events: CalendarApiEvent[]
  loading: boolean
  error: string
  onSelect: (event: CalendarApiEvent) => void
}

export default function CalendarAgendaView({ events, loading, error, onSelect }: Props) {
  const sections = useMemo(() => groupEventsByDay(events), [events])
  const today = madridTodayKey()

  if (loading && events.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-sm text-gray-500 sm:px-5">
        Cargando agenda…
      </div>
    )
  }

  if (error && events.length === 0) {
    return (
      <div className="mx-4 my-4 rounded-2xl border border-amber-200/80 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 sm:mx-5">
        {error}
      </div>
    )
  }

  if (sections.length === 0) {
    return (
      <div className="px-4 py-16 text-center sm:px-5">
        <p className="text-sm font-medium text-gray-900">Sin eventos próximos</p>
        <p className="mt-1 text-xs text-gray-500">No hay nada en los próximos 15 días.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 px-3 py-4 sm:px-4 sm:py-5">
      {sections.map((section) => (
        <section key={section.key} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <h3
              className={cn(
                'text-xs font-bold uppercase tracking-wider',
                section.key === today ? 'text-gray-900' : 'text-gray-500'
              )}
            >
              {section.label}
            </h3>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
              {section.events.length}
            </span>
          </div>

          <ul className="space-y-2">
            {section.events.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => onSelect(ev)}
                  className={cn(
                    'w-full rounded-2xl border bg-white p-3.5 text-left transition-all hover:shadow-md hover:border-gray-300',
                    section.key === today
                      ? 'border-gray-900/15 shadow-sm'
                      : 'border-gray-200/80 shadow-sm'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-gray-500 tabular-nums">
                        {fmtEventTime(ev)}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-gray-900 leading-snug">
                        {ev.title}
                      </p>
                      {ev.crm?.empresa && (
                        <p className="mt-1 text-xs text-gray-600 flex items-center gap-1.5">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{ev.crm.empresa}</span>
                        </p>
                      )}
                      {ev.crm?.nombre && !ev.crm.empresa && (
                        <p className="mt-1 text-xs text-gray-600 truncate">{ev.crm.nombre}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ev.crm && (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            CRM
                          </span>
                        )}
                        {ev.meetLink && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                            <Video className="h-2.5 w-2.5" />
                            Meet
                          </span>
                        )}
                        {ev.userNotes && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            <StickyNote className="h-2.5 w-2.5" />
                            Notas
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 mt-1" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
