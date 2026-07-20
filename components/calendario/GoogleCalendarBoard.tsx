import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'
import esLocale from '@fullcalendar/core/locales/es'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ExternalLink, MapPin, Video } from 'lucide-react'

type ApiEvent = {
  id: string
  title: string
  description: string | null
  location: string | null
  htmlLink: string | null
  meetLink: string | null
  allDay: boolean
  start: string
  end: string
}

type Props = {
  onNeedsReauth: () => void
}

function fmtRange(start: string, end: string, allDay: boolean) {
  if (allDay) {
    const s = new Date(start.includes('T') ? start : `${start}T12:00:00`)
    const eRaw = new Date(end.includes('T') ? end : `${end}T12:00:00`)
    // Google all-day end is exclusive
    const e = new Date(eRaw.getTime() - 24 * 60 * 60 * 1000)
    const opts: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Europe/Madrid',
    }
    const a = s.toLocaleDateString('es-ES', opts)
    const b = e.toLocaleDateString('es-ES', opts)
    return a === b ? `${a} · Todo el día` : `${a} → ${b} · Todo el día`
  }
  const s = new Date(start)
  const e = new Date(end)
  const dOpts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }
  const tOpts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }
  return `${s.toLocaleDateString('es-ES', dOpts)} · ${s.toLocaleTimeString('es-ES', tOpts)} – ${e.toLocaleTimeString('es-ES', tOpts)}`
}

export default function GoogleCalendarBoard({ onNeedsReauth }: Props) {
  const calendarRef = useRef<FullCalendar | null>(null)
  const [events, setEvents] = useState<EventInput[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<ApiEvent | null>(null)
  const rangeRef = useRef<{ timeMin: string; timeMax: string } | null>(null)

  const loadEvents = useCallback(
    async (timeMin: string, timeMax: string) => {
      setLoading(true)
      setError('')
      try {
        const qs = new URLSearchParams({ timeMin, timeMax })
        const res = await fetch(`/api/integrations/google/calendar/events?${qs}`)
        const data = await res.json()
        if (res.status === 401 || data.needs_reauth) {
          onNeedsReauth()
          setEvents([])
          setError('Reconexión necesaria')
          return
        }
        if (!res.ok) throw new Error(data.error || 'Error al cargar eventos')
        const mapped: EventInput[] = (data.events as ApiEvent[]).map((ev) => ({
          id: ev.id,
          title: ev.title,
          start: ev.start,
          end: ev.end,
          allDay: ev.allDay,
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

  const onDatesSet = useCallback(
    (arg: DatesSetArg) => {
      const timeMin = arg.start.toISOString()
      const timeMax = arg.end.toISOString()
      rangeRef.current = { timeMin, timeMax }
      void loadEvents(timeMin, timeMax)
    },
    [loadEvents]
  )

  useEffect(() => {
    // refresh when reconnecting
  }, [])

  const plugins = useMemo(
    () => [dayGridPlugin, timeGridPlugin, interactionPlugin],
    []
  )

  const onEventClick = (arg: EventClickArg) => {
    const ev = arg.event.extendedProps as ApiEvent
    setSelected({
      id: arg.event.id,
      title: arg.event.title,
      description: ev.description,
      location: ev.location,
      htmlLink: ev.htmlLink,
      meetLink: ev.meetLink,
      allDay: arg.event.allDay,
      start: (arg.event.startStr || ev.start) as string,
      end: (arg.event.endStr || ev.end) as string,
    })
  }

  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 shadow-sm">
      {loading && (
        <div className="absolute right-4 top-4 z-10 text-[11px] font-medium text-gray-400">
          Cargando…
        </div>
      )}
      {error && !loading && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {error}
        </div>
      )}

      <FullCalendar
        ref={calendarRef}
        plugins={plugins}
        locale={esLocale}
        timeZone="Europe/Madrid"
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        buttonText={{
          today: 'Hoy',
          month: 'Mes',
          week: 'Semana',
          day: 'Día',
        }}
        height="auto"
        events={events}
        datesSet={onDatesSet}
        eventClick={onEventClick}
        nowIndicator
        dayMaxEvents={4}
        slotMinTime="07:00:00"
        slotMaxTime="22:00:00"
        eventTimeFormat={{
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }}
      />

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg pr-6">{selected?.title}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <p className="text-gray-600">
                {fmtRange(selected.start, selected.end, selected.allDay)}
              </p>
              {selected.location && (
                <p className="flex gap-2 text-gray-700">
                  <MapPin className="h-4 w-4 shrink-0 text-gray-400 mt-0.5" />
                  {selected.location}
                </p>
              )}
              {selected.description && (
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-gray-700 whitespace-pre-wrap text-xs leading-relaxed max-h-48 overflow-y-auto">
                  {selected.description.replace(/<[^>]+>/g, '')}
                </div>
              )}
              {selected.meetLink && (
                <a
                  href={selected.meetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:underline"
                >
                  <Video className="h-4 w-4" />
                  Unirse a Google Meet
                </a>
              )}
              {selected.htmlLink && (
                <a
                  href={selected.htmlLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-gray-800 hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir en Google Calendar
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
