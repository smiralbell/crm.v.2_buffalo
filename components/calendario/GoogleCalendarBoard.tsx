import { useCallback, useMemo, useRef, useState, type ComponentRef } from 'react'
import Link from 'next/link'
import FullCalendarImport from '@fullcalendar/react'
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
import { cn } from '@/lib/utils'
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  UserRound,
  Video,
} from 'lucide-react'

const FullCalendar =
  typeof FullCalendarImport === 'function'
    ? FullCalendarImport
    : ((FullCalendarImport as { default?: typeof FullCalendarImport }).default as typeof FullCalendarImport)

type CrmProjectLink = {
  id: string
  name: string
  status: string
  es_buffalo: boolean
  href: string
}

type CrmLink = {
  match: 'high' | 'medium' | 'low'
  reason: string
  source: 'email' | 'coldcall' | 'cal_booking' | 'lead'
  lead_id: number | null
  prospect_id: number | null
  cal_uid: string | null
  nombre: string
  empresa: string | null
  email: string | null
  telefono: string | null
  estado: string | null
  at: string | null
  campaign_name: string | null
  notas: string | null
  lead_href: string | null
  reuniones_href: string | null
  proyectos: CrmProjectLink[]
}

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
  attendees?: { email: string; displayName: string | null; self: boolean }[]
  crm: CrmLink | null
}

type Props = {
  onNeedsReauth: () => void
}

type CalView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'

const VIEWS: { id: CalView; label: string }[] = [
  { id: 'dayGridMonth', label: 'Mes' },
  { id: 'timeGridWeek', label: 'Semana' },
  { id: 'timeGridDay', label: 'Día' },
]

function fmtRange(start: string, end: string, allDay: boolean) {
  if (allDay) {
    const s = new Date(start.includes('T') ? start : `${start}T12:00:00`)
    const eRaw = new Date(end.includes('T') ? end : `${end}T12:00:00`)
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

function sourceLabel(source: CrmLink['source']) {
  if (source === 'coldcall') return 'Cold calling'
  if (source === 'cal_booking') return 'Cal.com'
  if (source === 'email') return 'Email'
  return 'Lead CRM'
}

export default function GoogleCalendarBoard({ onNeedsReauth }: Props) {
  const calendarRef = useRef<ComponentRef<typeof FullCalendar> | null>(null)
  const [events, setEvents] = useState<EventInput[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<ApiEvent | null>(null)
  const [view, setView] = useState<CalView>('dayGridMonth')
  const [title, setTitle] = useState('')

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
      attendees: ev.attendees,
      crm: ev.crm || null,
    })
  }

  const crm = selected?.crm

  return (
    <div className="buffalo-cal buffalo-cal-shell relative overflow-hidden rounded-[1.75rem] border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_rgba(17,24,39,0.05)]">
      {loading && <div className="buffalo-cal-progress" aria-hidden />}

      <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2.5 min-w-0">
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
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-gray-900 capitalize sm:text-base">
            {title}
          </h2>
        </div>

        <div className="inline-flex self-start sm:self-auto rounded-2xl bg-gray-100/80 p-1 border border-gray-100">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => changeView(v.id)}
              className={cn(
                'rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all',
                view === v.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {error && !loading && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-200/80 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 sm:mx-5">
          {error}
        </div>
      )}

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

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md rounded-3xl border-gray-200 p-0 overflow-hidden gap-0">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 px-5 py-4 text-white">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold leading-snug pr-6 text-white">
                {selected?.title}
              </DialogTitle>
            </DialogHeader>
            {selected && (
              <p className="mt-1.5 text-xs text-white/70">
                {fmtRange(selected.start, selected.end, selected.allDay)}
              </p>
            )}
          </div>

          {selected && (
            <div className="space-y-3 px-5 py-4 text-sm">
              {crm ? (
                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700/80">
                        Lead · {sourceLabel(crm.source)}
                        {crm.estado ? ` · ${crm.estado}` : ''}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-gray-900 truncate">
                        {crm.nombre}
                      </p>
                      {crm.empresa && (
                        <p className="text-xs text-gray-600 flex items-center gap-1.5 mt-0.5">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {crm.empresa}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                        crm.match === 'high' && 'bg-emerald-600 text-white',
                        crm.match === 'medium' && 'bg-amber-500 text-white',
                        crm.match === 'low' && 'bg-gray-300 text-gray-800'
                      )}
                    >
                      {crm.match === 'high' ? 'Match' : crm.match === 'medium' ? 'Probable' : 'Posible'}
                    </span>
                  </div>

                  <p className="text-[11px] text-emerald-900/70">{crm.reason}</p>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                    {crm.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {crm.email}
                      </span>
                    )}
                    {crm.telefono && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {crm.telefono}
                      </span>
                    )}
                    {crm.campaign_name && (
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3 w-3" />
                        {crm.campaign_name}
                      </span>
                    )}
                  </div>

                  {crm.proyectos && crm.proyectos.length > 0 && (
                    <div className="border-t border-emerald-100 pt-2.5 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/70">
                        Proyectos
                      </p>
                      {crm.proyectos.map((p) => (
                        <Link
                          key={p.id}
                          href={p.href}
                          className="flex items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-xs hover:border-emerald-300 transition-colors"
                        >
                          <span className="font-semibold text-gray-900 truncate">{p.name}</span>
                          <span className="shrink-0 text-[10px] font-medium text-gray-500">
                            {p.status}
                            {p.es_buffalo ? ' · Buffalo' : ''}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {crm.notas && (
                    <p className="text-[11px] text-gray-500 line-clamp-2 border-t border-emerald-100 pt-2">
                      {crm.notas}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {crm.lead_href && (
                      <Link
                        href={crm.lead_href}
                        className="inline-flex items-center gap-1.5 rounded-2xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800"
                      >
                        Ver lead
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                    {crm.reuniones_href && (
                      <Link
                        href={crm.reuniones_href}
                        className="inline-flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                      >
                        Reuniones
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-3.5 py-3 text-xs text-gray-500">
                  No hay lead con el mismo email en el CRM. Revisa que el contacto del lead tenga el
                  correo del evento (asistente o texto del título).
                </div>
              )}

              {selected.location && (
                <p className="flex gap-2.5 text-gray-700">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-50 border border-gray-100">
                    <MapPin className="h-3.5 w-3.5 text-gray-500" />
                  </span>
                  <span className="pt-1.5">{selected.location}</span>
                </p>
              )}
              {selected.description && (
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3.5 text-gray-700 whitespace-pre-wrap text-xs leading-relaxed max-h-36 overflow-y-auto">
                  {selected.description.replace(/<[^>]+>/g, '')}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {selected.meetLink && (
                  <a
                    href={selected.meetLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
                  >
                    <Video className="h-3.5 w-3.5" />
                    Google Meet
                  </a>
                )}
                {selected.htmlLink && (
                  <a
                    href={selected.htmlLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir en Google
                  </a>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
