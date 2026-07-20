'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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

const activeBtn =
  'bg-gray-900 text-white border-gray-900 font-semibold shadow-sm'
const inactiveBtn =
  'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'

export default function FinancePeriodFilter({ value, onChange, className }: Props) {
  const [activePreset, setActivePreset] = useState<PeriodPresetId>(() =>
    detectPeriodPreset(value.start, value.end)
  )
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>({
    from: value.start,
    to: value.end,
  })
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (calendarOpen) return
    setDraftRange({ from: value.start, to: value.end })
    setActivePreset(detectPeriodPreset(value.start, value.end))
  }, [value.start, value.end, calendarOpen])

  const updatePopoverPosition = useCallback(() => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const width = 300
    setPopoverPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)),
    })
  }, [])

  const openCalendar = useCallback(() => {
    setDraftRange({ from: value.start, to: value.end })
    setActivePreset('custom')
    updatePopoverPosition()
    setCalendarOpen(true)
  }, [value.start, value.end, updatePopoverPosition])

  useEffect(() => {
    if (!calendarOpen) return

    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        popoverRef.current?.contains(target) ||
        btnRef.current?.contains(target)
      ) {
        return
      }
      setCalendarOpen(false)
    }

    const onScroll = () => updatePopoverPosition()

    document.addEventListener('mousedown', onOutside)
    window.addEventListener('resize', updatePopoverPosition)
    window.addEventListener('scroll', onScroll, true)

    return () => {
      document.removeEventListener('mousedown', onOutside)
      window.removeEventListener('resize', updatePopoverPosition)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [calendarOpen, updatePopoverPosition])

  const applyPreset = (preset: PeriodPresetId) => {
    if (preset === 'custom') {
      openCalendar()
      return
    }
    setCalendarOpen(false)
    setActivePreset(preset)
    onChange(getPeriodRangeForPreset(preset), preset)
  }

  const handleRangeSelect = (selected: DateRange | undefined) => {
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

  const calendarPortal =
    calendarOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            className="fixed z-[200] rounded-xl border border-gray-200 bg-white p-4 shadow-xl"
            style={{ top: popoverPos.top, left: popoverPos.left, width: 300 }}
          >
            <p className="text-xs text-gray-500 mb-3">
              Elige inicio y fin del rango
            </p>
            <DayPicker
              mode="range"
              selected={draftRange}
              onSelect={handleRangeSelect}
              defaultMonth={draftRange?.from ?? value.start}
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
                cell: 'h-9 w-9 text-center text-sm p-0 relative',
                day: 'h-9 w-9 p-0 font-normal rounded-md hover:bg-gray-100 text-sm cursor-pointer',
                day_selected: 'bg-gray-900 text-white hover:bg-gray-800 rounded-md',
                day_today: 'font-semibold text-gray-900 underline',
                day_outside: 'text-gray-300',
                day_range_middle: 'bg-gray-100 rounded-none',
                day_button: 'h-9 w-9',
              }}
            />
          </div>,
          document.body
        )
      : null

  return (
    <>
      <div
        className={cn(
          'flex flex-wrap items-center gap-1 min-w-0',
          className
        )}
      >
        {PERIOD_PRESETS.filter((p) => p.id !== 'custom').map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset.id)}
            className={cn(
              'shrink-0 h-8 px-2.5 text-xs rounded-lg border transition-colors whitespace-nowrap',
              activePreset === preset.id ? activeBtn : inactiveBtn
            )}
          >
            {preset.label}
          </button>
        ))}

        <button
          ref={btnRef}
          type="button"
          onClick={() => (calendarOpen ? setCalendarOpen(false) : openCalendar())}
          className={cn(
            'shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-lg border transition-colors whitespace-nowrap max-w-full sm:max-w-[200px]',
            activePreset === 'custom' ? activeBtn : inactiveBtn
          )}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {activePreset === 'custom'
              ? formatPeriodLabel(value.start, value.end)
              : 'Rango'}
          </span>
        </button>
      </div>
      {calendarPortal}
    </>
  )
}

export function periodToQuery(range: PeriodRange): { start: string; end: string } {
  return {
    start: format(range.start, 'yyyy-MM-dd'),
    end: format(range.end, 'yyyy-MM-dd'),
  }
}
