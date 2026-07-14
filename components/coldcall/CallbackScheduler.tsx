'use client'

import { useMemo, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale/es'
import { startOfDay } from 'date-fns'
import { CalendarClock, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CALLBACK_TIME_SLOTS,
  applyTimeToDate,
  callbackQuickPresets,
  formatCallbackWhen,
  formatCallbackWhenShort,
  parseDatetimeLocal,
  toDatetimeLocalValue,
} from '@/lib/coldcall/callback-schedule'
import 'react-day-picker/dist/style.css'

interface CallbackSchedulerProps {
  value: string
  onChange: (datetimeLocal: string) => void
}

export default function CallbackScheduler({ value, onChange }: CallbackSchedulerProps) {
  const parsed = parseDatetimeLocal(value)
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(
    parsed ? startOfDay(parsed) : startOfDay(new Date())
  )
  const [selectedTime, setSelectedTime] = useState<string>(() => {
    if (parsed) {
      const h = String(parsed.getHours()).padStart(2, '0')
      const m = String(parsed.getMinutes()).padStart(2, '0')
      return `${h}:${m}`
    }
    return '10:00'
  })

  const presets = useMemo(() => callbackQuickPresets(), [])

  const pickDayAndTime = (day: Date, time: string) => {
    setSelectedDay(startOfDay(day))
    setSelectedTime(time)
    onChange(toDatetimeLocalValue(applyTimeToDate(day, time)))
  }

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return
    pickDayAndTime(day, selectedTime)
  }

  const handleTimeSelect = (time: string) => {
    const day = selectedDay || startOfDay(new Date())
    pickDayAndTime(day, time)
  }

  const handlePreset = (presetValue: string) => {
    const d = parseDatetimeLocal(presetValue)
    if (!d) return
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    setSelectedDay(startOfDay(d))
    setSelectedTime(`${h}:${m}`)
    onChange(presetValue)
  }

  const whenLabel = value ? formatCallbackWhen(value) : ''

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-amber-600" />
        <p className="text-sm font-semibold text-gray-900">¿Cuándo volver a llamar?</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handlePreset(p.value)}
            className={cn(
              'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              value === p.value
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-gray-700 border-gray-200 hover:border-amber-300 hover:bg-amber-50'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3 grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="callback-mini-calendar flex justify-center sm:justify-start">
          <DayPicker
            mode="single"
            locale={es}
            weekStartsOn={1}
            selected={selectedDay}
            onSelect={handleDaySelect}
            disabled={{ before: startOfDay(new Date()) }}
            className="text-sm"
            classNames={{
              months: 'flex flex-col',
              month: 'space-y-2',
              caption: 'flex justify-center relative items-center h-8',
              caption_label: 'text-sm font-semibold capitalize text-gray-900',
              nav: 'flex items-center',
              button_previous: 'absolute left-0 h-7 w-7 rounded-md hover:bg-white/80',
              button_next: 'absolute right-0 h-7 w-7 rounded-md hover:bg-white/80',
              table: 'w-full border-collapse',
              weekdays: 'flex',
              weekday: 'text-gray-400 w-8 font-medium text-[10px]',
              week: 'flex w-full mt-1',
              day: 'h-8 w-8 p-0 text-center text-sm',
              day_button: cn(
                'h-8 w-8 rounded-lg font-medium hover:bg-amber-100 transition-colors',
                'aria-selected:bg-amber-500 aria-selected:text-white aria-selected:hover:bg-amber-600'
              ),
              selected: 'bg-amber-500 text-white',
              today: 'font-bold text-amber-700',
              outside: 'text-gray-300 opacity-50',
              disabled: 'text-gray-300 opacity-40',
            }}
          />
        </div>

        <div className="space-y-2 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Hora</p>
          <div className="grid grid-cols-4 gap-1.5">
            {CALLBACK_TIME_SLOTS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTimeSelect(t)}
                className={cn(
                  'py-2 rounded-lg text-xs font-semibold tabular-nums border transition-colors',
                  selectedTime === t
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="block pt-1">
            <span className="text-[10px] text-gray-500">Otra hora</span>
            <input
              type="time"
              value={selectedTime}
              onChange={(e) => handleTimeSelect(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </label>
        </div>
      </div>

      {whenLabel && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 flex items-start gap-2">
          <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-emerald-900 capitalize">{whenLabel}</p>
            <p className="text-[10px] text-emerald-700 mt-0.5 tabular-nums">
              {formatCallbackWhenShort(value)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
