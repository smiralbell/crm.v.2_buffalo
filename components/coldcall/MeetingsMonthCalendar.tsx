'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface CalendarMeeting {
  id: number
  nombre: string
  empresa: string | null
  campaign_id: number | null
  campaign_name: string | null
  at: string
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Lunes = 0 … Domingo = 6 */
function mondayIndex(d: Date) {
  return (d.getDay() + 6) % 7
}

export default function MeetingsMonthCalendar({
  meetings,
}: {
  meetings: CalendarMeeting[]
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [selectedKey, setSelectedKey] = useState<string | null>(() => dayKey(new Date()))

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarMeeting[]>()
    for (const m of meetings) {
      const d = new Date(m.at)
      if (Number.isNaN(d.getTime())) continue
      const key = dayKey(d)
      const list = map.get(key) || []
      list.push(m)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    }
    return map
  }, [meetings])

  const cells = useMemo(() => {
    const first = startOfMonth(cursor)
    const startPad = mondayIndex(first)
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const total = Math.ceil((startPad + daysInMonth) / 7) * 7
    const out: { date: Date; inMonth: boolean }[] = []
    for (let i = 0; i < total; i++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), i - startPad + 1)
      out.push({
        date,
        inMonth: date.getMonth() === cursor.getMonth(),
      })
    }
    return out
  }, [cursor])

  const today = new Date()
  const selectedMeetings = selectedKey ? byDay.get(selectedKey) || [] : []
  const monthLabel = cursor.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-xl h-9 w-9"
          onClick={() => setCursor((c) => addMonths(c, -1))}
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold text-gray-900 capitalize">{monthLabel}</h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => {
              const now = startOfMonth(new Date())
              setCursor(now)
              setSelectedKey(dayKey(new Date()))
            }}
          >
            Hoy
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-xl h-9 w-9"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr">
          {cells.map(({ date, inMonth }) => {
            const key = dayKey(date)
            const dayMeetings = byDay.get(key) || []
            const isToday = sameDay(date, today)
            const isSelected = selectedKey === key
            return (
              <button
                key={key + String(inMonth)}
                type="button"
                onClick={() => setSelectedKey(key)}
                className={`min-h-[88px] sm:min-h-[104px] border-b border-r border-gray-100 p-1.5 text-left transition-colors ${
                  inMonth ? 'bg-white' : 'bg-gray-50/70'
                } ${isSelected ? 'ring-2 ring-inset ring-emerald-500/70 bg-emerald-50/40' : 'hover:bg-gray-50'} ${
                  !inMonth ? 'text-gray-300' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                      isToday
                        ? 'bg-gray-900 text-white'
                        : inMonth
                          ? 'text-gray-800'
                          : 'text-gray-300'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {dayMeetings.length > 0 && (
                    <span className="text-[10px] font-semibold text-emerald-700 tabular-nums">
                      {dayMeetings.length}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayMeetings.slice(0, 3).map((m) => {
                    const time = new Date(m.at).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                    return (
                      <div
                        key={`${m.id}-${m.at}`}
                        className="truncate rounded-md bg-emerald-100/90 px-1 py-0.5 text-[10px] font-medium text-emerald-900"
                        title={`${time} · ${m.nombre}`}
                      >
                        <span className="tabular-nums">{time}</span> {m.nombre.split(' ')[0]}
                      </div>
                    )
                  })}
                  {dayMeetings.length > 3 && (
                    <p className="text-[10px] text-gray-500 pl-0.5">+{dayMeetings.length - 3} más</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-900 mb-3">
          {selectedKey
            ? (() => {
                const [y, m, d] = selectedKey.split('-').map(Number)
                return new Date(y, m, d).toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })
              })()
            : 'Selecciona un día'}
        </p>
        {selectedMeetings.length === 0 ? (
          <p className="text-sm text-gray-400">Sin reuniones este día.</p>
        ) : (
          <ul className="space-y-2">
            {selectedMeetings.map((m) => {
              const time = new Date(m.at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              })
              const href =
                m.campaign_id != null
                  ? `/coldcalling/campanas/${m.campaign_id}/llamadas?leadId=${m.id}`
                  : null
              return (
                <li
                  key={`${m.id}-${m.at}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      <span className="tabular-nums text-emerald-700 mr-2">{time}</span>
                      {m.nombre}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {[m.empresa, m.campaign_name].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  {href && (
                    <Button size="sm" variant="outline" className="rounded-xl shrink-0" asChild>
                      <Link href={href}>Ver lead</Link>
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
