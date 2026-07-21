import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import FullCalendarImport from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'
import esLocale from '@fullcalendar/core/locales/es'
import { cn } from '@/lib/utils'
import type { CalendarApiEvent } from '@/components/calendario/calendar-types'
import CalendarAgendaView from '@/components/calendario/CalendarAgendaView'
import CalendarEventDetailDialog from '@/components/calendario/CalendarEventDetailDialog'
import { agendaRangeIso } from '@/components/calendario/calendar-utils'
import { ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react'

const FullCalendar =
  typeof FullCalendarImport === 'function'
    ? FullCalendarImport
    : ((FullCalendarImport as { default?: typeof FullCalendarImport }).default as typeof FullCalendarImport)

type Props = {
  onNeedsReauth: () => void
}

type CalView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'
type BoardMode = 'calendario' | 'agenda'

const VIEWS: { id: CalView; label: string }[] = [
  { id: 'dayGridMonth', label: 'Mes' },
  { id: 'timeGridWeek', label: 'Semana' },
  { id: 'timeGridDay', label: 'Día' },
]

async function fetchEvents(
  timeMin: string,
  timeMax: string,
  onNeedsReauth: () => void
): Promise<CalendarApiEvent[]> {
  const qs = new URLSearchParams({ timeMin, timeMax })
  const res = await fetch(`/api/integrations/google/calendar/events?${qs}`)
  const data = await res.json()
  if (res.status === 401 || data.needs_reauth) {
    onNeedsReauth()
    throw new Error('Reconexión necesaria')
  }
  if (!res.ok) throw new Error(data.error || 'Error al cargar eventos')
  return data.events as CalendarApiEvent[]
}

async function fetchNotesMap(eventIds: string[]): Promise<Record<string, string>> {
  if (eventIds.length === 0) return {}
  const qs = new URLSearchParams({ eventIds: eventIds.join(',') })
  const res = await fetch(`/api/integrations/google/calendar/event-notes?${qs}`)
  const data = await res.json()
  if (!res.ok) return {}
  return (data.notes || {}) as Record<string, string>
}

function attachNotes(events: CalendarApiEvent[], notes: Record<string, string>): CalendarApiEvent[] {
  return events.map((ev) => ({
    ...ev,
    userNotes: notes[ev.id] || ev.userNotes || null,
  }))
}

export default function GoogleCalendarBoard({ onNeedsReauth }: Props) {
  const calendarRef = useRef<ComponentRef<typeof FullCalendar> | null>(null)
  const [boardMode, setBoardMode] = useState<BoardMode>('calendario')
  const [events, setEvents] = useState<EventInput[]>([])
  const [agendaEvents, setAgendaEvents] = useState<CalendarApiEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [agendaLoading, setAgendaLoading] = useState(false)
  const [error, setError] = useState('')
  const [agendaError, setAgendaError] = useState('')
  const [selected, setSelected] = useState<CalendarApiEvent | null>(null)
  const [view, setView] = useState<CalView>('dayGridMonth')
  const [title, setTitle] = useState('')

  const loadEvents = useCallback(
    async (timeMin: string, timeMax: string) => {
      setLoading(true)
      setError('')
      try {
        const raw = await fetchEvents(timeMin, timeMax, onNeedsReauth)
        const mapped: EventInput[] = raw.map((ev) => ({
          id: ev.id,
          title: ev.title,
          start: ev.start,
          end: ev.end,
          allDay: ev.allDay,
          classNames: ev.crm ? ['buffalo-cal-event--crm'] : ['buffalo-cal-event'],
          extendedProps: ev,
        }))
        setEvents(mapped)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error')
        setEvents([])
      } finally {
        setLoading(false)
      }
    },
    [onNeedsReauth]
  )

  const loadAgenda = useCallback(async () => {
    setAgendaLoading(true)
    setAgendaError('')
    try {
      const { timeMin, timeMax } = agendaRangeIso()
      const raw = await fetchEvents(timeMin, timeMax, onNeedsReauth)
      const notes = await fetchNotesMap(raw.map((ev) => ev.id))
      setAgendaEvents(attachNotes(raw, notes))
    } catch (e) {
      setAgendaError(e instanceof Error ? e.message : 'Error')
      setAgendaEvents([])
    } finally {
      setAgendaLoading(false)
    }
  }, [onNeedsReauth])

  useEffect(() => {
    if (boardMode === 'agenda') void loadAgenda()
  }, [boardMode, loadAgenda])

  const onDatesSet = useCallback(
    (arg: DatesSetArg) => {
      setTitle(arg.view.title)
      setView(arg.view.type as CalView)
      void loadEvents(arg.start.toISOString(), arg.end.toISOString())
    },
    [loadEvents]
  )

  const plugins = useMemo(
    () => [dayGridPlugin, timeGridPlugin, interactionPlugin],
    []
  )

  const api = () => calendarRef.current?.getApi() ?? null

  const goPrev = () => api()?.prev()
  const goNext = () => api()?.next()
  const goToday = () => api()?.today()
  const changeView = (v: CalView) => {
    setView(v)
    api()?.changeView(v)
  }

  const openEvent = (ev: CalendarApiEvent) => setSelected(ev)

  const onEventClick = (arg: EventClickArg) => {
    const ev = arg.event.extendedProps as CalendarApiEvent
    openEvent({
      id: arg.event.id,
      title: arg.event.title,
      description: ev.description,
      location: ev.location,
      htmlLink: ev.htmlLink,
      meetLink: ev.meetLink,
      allDay: arg.event.allDay,
      start: (arg.event.startStr || ev.start) as string,
      end: (arg.event.endStr || ev.end) as string,
      attendees: ev.attendees,
      crm: ev.crm || null,
      userNotes: ev.userNotes || null,
    })
  }

  const handleNotesSaved = (eventId: string, notes: string) => {
    setAgendaEvents((prev) =>
      prev.map((ev) => (ev.id === eventId ? { ...ev, userNotes: notes || null } : ev))
    )
    setSelected((prev) => (prev?.id === eventId ? { ...prev, userNotes: notes || null } : prev))
  }

  const showCalendarNav = boardMode === 'calendario'

  return (
    <div className="buffalo-cal buffalo-cal-shell relative overflow-hidden rounded-[1.75rem] border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_rgba(17,24,39,0.05)]">
      {(loading || agendaLoading) && <div className="buffalo-cal-progress" aria-hidden />}

      <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          {showCalendarNav && (
            <>
              <div className="inline-flex items-center rounded-2xl bg-gray-50 p-1 border border-gray-100">
                <button
                  type="button"
                  onClick={goPrev}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm transition-all"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm transition-all"
                  aria-label="Siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={goToday}
                className="h-8 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Hoy
              </button>
            </>
          )}
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-gray-900 capitalize sm:text-base">
            {boardMode === 'agenda' ? 'Agenda' : title}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex rounded-2xl bg-gray-100/80 p-1 border border-gray-100">
            <button
              type="button"
              onClick={() => setBoardMode('calendario')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-all',
                boardMode === 'calendario'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Calendario
            </button>
            <button
              type="button"
              onClick={() => setBoardMode('agenda')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-all',
                boardMode === 'agenda'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              )}
            >
              <List className="h-3.5 w-3.5" />
              Agenda
            </button>
          </div>

          {showCalendarNav && (
            <div className="inline-flex rounded-2xl bg-gray-100/80 p-1 border border-gray-100">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => changeView(v.id)}
                  className={cn(
                    'rounded-xl px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold transition-all',
                    view === v.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && !loading && boardMode === 'calendario' && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-200/80 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 sm:mx-5">
          {error}
        </div>
      )}

      {boardMode === 'calendario' ? (
        <div className="p-2 sm:p-3 md:p-4">
          {typeof FullCalendar !== 'function' ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              No se pudo cargar el calendario. Recarga la página.
            </div>
          ) : (
            <FullCalendar
              ref={calendarRef}
              plugins={plugins}
              locale={esLocale}
              timeZone="Europe/Madrid"
              initialView="dayGridMonth"
              headerToolbar={false}
              height="auto"
              events={events}
              datesSet={onDatesSet}
              eventClick={onEventClick}
              nowIndicator
              dayMaxEvents={3}
              moreLinkClick="popover"
              slotMinTime="07:00:00"
              slotMaxTime="22:00:00"
              eventDisplay="block"
              eventTimeFormat={{
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }}
              dayHeaderFormat={{ weekday: 'short' }}
            />
          )}
        </div>
      ) : (
        <CalendarAgendaView
          events={agendaEvents}
          loading={agendaLoading}
          error={agendaError}
          onSelect={openEvent}
        />
      )}

      <CalendarEventDetailDialog
        event={selected}
        onClose={() => setSelected(null)}
        onNotesSaved={handleNotesSaved}
      />
    </div>
  )
}
