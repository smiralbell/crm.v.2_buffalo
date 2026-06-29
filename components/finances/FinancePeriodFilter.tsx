'use client'

import { useState, useRef, useEffect } from 'react'
import { format, startOfDay, endOfDay } from 'date-fns'
import { DayPicker, type DateRange } from 'react-day-picker'
import { Calendar } from 'lucide-react'
import {
  PERIOD_PRESETS,
  type PeriodPresetId,
  type PeriodRange,
  detectPeriodPreset,
  formatPeriodLabel,
  getPeriodRangeForPreset,
} from '@/lib/finance/period-presets'
import { cn } from '@/lib/utils'
import 'react-day-picker/dist/style.css'

interface Props {
  value: PeriodRange
  onChange: (range: PeriodRange, preset: PeriodPresetId) => void
  className?: string
}

export default function FinancePeriodFilter({ value, onChange, className }: Props) {
  const [activePreset, setActivePreset] = useState<PeriodPresetId>(() =>
    detectPeriodPreset(value.start, value.end)
  )
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>({
    from: value.start,
    to: value.end,
  })
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraftRange({ from: value.start, to: value.end })
    setActivePreset(detectPeriodPreset(value.start, value.end))
  }, [value.start, value.end])

  useEffect(() => {
    if (!calendarOpen) return
    const onOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCalendarOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [calendarOpen])

  const applyPreset = (preset: PeriodPresetId) => {
    if (preset === 'custom') {
      setActivePreset('custom')
      setCalendarOpen(true)
      return
    }
    setCalendarOpen(false)
    setActivePreset(preset)
    onChange(getPeriodRangeForPreset(preset), preset)
  }

  const commitCustomRange = (selected: DateRange | undefined) => {
    setDraftRange(selected)
    if (selected?.from && selected?.to) {
      setActivePreset('custom')
      onChange(
        { start: startOfDay(selected.from), end: endOfDay(selected.to) },
        'custom'
      )
      setCalendarOpen(false)
    }
  }

  return (
    <div
      className={cn(
        'flex flex-nowrap items-center gap-0.5 min-w-0 overflow-x-auto',
        '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      <div className="inline-flex flex-nowrap items-center rounded-lg border border-gray-200 bg-gray-50/80 p-0.5 shrink-0">
        {PERIOD_PRESETS.filter((p) => p.id !== 'custom').map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset.id)}
            className={cn(
              'px-2.5 h-7 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
              activePreset === preset.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="relative shrink-0" ref={popoverRef}>
        <button
          type="button"
          onClick={() => {
            setActivePreset('custom')
            setCalendarOpen((o) => !o)
          }}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap',
            activePreset === 'custom'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          )}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          {activePreset === 'custom'
            ? formatPeriodLabel(value.start, value.end)
            : 'Rango'}
        </button>

        {calendarOpen && (
          <div className="absolute right-0 top-full z-50 mt-1.5 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
            <DayPicker
              mode="range"
              selected={draftRange}
              onSelect={commitCustomRange}
              numberOfMonths={1}
              classNames={{
                months: 'flex flex-col',
                month: 'space-y-2',
                caption: 'flex justify-center pt-1 relative items-center mb-2',
                caption_label: 'text-sm font-semibold text-gray-900',
                nav: 'space-x-1 flex items-center',
                nav_button:
                  'h-7 w-7 p-0 hover:bg-gray-100 rounded-md border-0 text-gray-600',
                nav_button_previous: 'absolute left-1',
                nav_button_next: 'absolute right-1',
                head_row: 'flex mb-1',
                head_cell: 'text-gray-400 w-9 font-normal text-xs',
                row: 'flex w-full',
                cell: 'h-9 w-9 text-center text-sm p-0',
                day: 'h-9 w-9 p-0 font-normal rounded-md hover:bg-gray-100 text-sm',
                day_selected: 'bg-gray-900 text-white hover:bg-gray-800 rounded-md',
                day_today: 'font-semibold text-gray-900',
                day_outside: 'text-gray-300',
                day_range_middle: 'bg-gray-100 rounded-none',
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function periodToQuery(range: PeriodRange): { start: string; end: string } {
  return {
    start: format(range.start, 'yyyy-MM-dd'),
    end: format(range.end, 'yyyy-MM-dd'),
  }
}
