'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker, DateRange } from 'react-day-picker'
import { format, startOfDay, endOfDay } from 'date-fns'
import { Calendar, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import 'react-day-picker/dist/style.css'

export interface DateRangePickerResult {
  start: Date | null
  end: Date | null
}

interface DateRangePickerProps {
  onRangeChange: (range: DateRangePickerResult) => void
  defaultRange?: DateRangePickerResult
  className?: string
}

export default function DateRangePicker({ onRangeChange, defaultRange, className }: DateRangePickerProps) {
  const [range, setRange] = useState<DateRange | undefined>(
    defaultRange?.start && defaultRange?.end
      ? { from: startOfDay(defaultRange.start), to: endOfDay(defaultRange.end) }
      : defaultRange?.start
      ? { from: startOfDay(defaultRange.start), to: undefined }
      : undefined
  )
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (selectedRange: DateRange | undefined) => {
    setRange(selectedRange)
    if (selectedRange?.from && selectedRange?.to) {
      onRangeChange({ 
        start: startOfDay(selectedRange.from), 
        end: endOfDay(selectedRange.to) 
      })
      setIsOpen(false)
    } else if (selectedRange?.from) {
      onRangeChange({ 
        start: startOfDay(selectedRange.from), 
        end: null 
      })
    } else {
      onRangeChange({ start: null, end: null })
    }
  }

  const handleClear = () => {
    setRange(undefined)
    onRangeChange({ start: null, end: null })
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="flex items-center gap-2">
        {/* Input Desde */}
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'h-9 px-3 justify-start text-left font-normal text-sm border border-gray-200 hover:bg-gray-50',
            !range?.from && 'text-gray-400'
          )}
        >
          <Calendar className="mr-2 h-4 w-4 text-gray-400" />
          {range?.from ? format(range.from, 'dd MMM yyyy') : 'Desde'}
        </Button>

        <span className="text-gray-300">-</span>

        {/* Input Hasta */}
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'h-9 px-3 justify-start text-left font-normal text-sm border border-gray-200 hover:bg-gray-50',
            !range?.to && 'text-gray-400'
          )}
        >
          <Calendar className="mr-2 h-4 w-4 text-gray-400" />
          {range?.to ? format(range.to, 'dd MMM yyyy') : 'Hasta'}
        </Button>

        {/* Botón limpiar */}
        {range?.from && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClear}
            className="h-9 w-9 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Calendario Popup - Diseño minimalista mejorado */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
          <DayPicker
            mode="range"
            selected={range}
            onSelect={handleSelect}
            numberOfMonths={1}
            className="rdp-calendar"
            classNames={{
              months: 'flex flex-col',
              month: 'space-y-3',
              caption: 'flex justify-center pt-1 relative items-center mb-4',
              caption_label: 'text-sm font-semibold text-gray-900',
              nav: 'space-x-1 flex items-center',
              nav_button: 'h-7 w-7 p-0 hover:bg-gray-100 rounded-md border-0 transition-colors text-blue-600',
              nav_button_previous: 'absolute left-1',
              nav_button_next: 'absolute right-1',
              table: 'w-full border-collapse',
              head_row: 'flex mb-2',
              head_cell: 'text-gray-500 w-10 font-normal text-xs',
              row: 'flex w-full mb-1',
              cell: 'h-9 w-9 text-center text-sm p-0 relative',
              day: 'h-9 w-9 p-0 font-normal rounded-full hover:bg-gray-100 transition-colors text-sm',
              day_range_end: 'rounded-full',
              day_selected: 'bg-blue-600 text-white hover:bg-blue-700 rounded-full font-medium',
              day_today: 'bg-gray-50 text-gray-900 font-medium',
              day_outside: 'text-gray-400 opacity-50',
              day_disabled: 'text-gray-300 opacity-30 cursor-not-allowed',
              day_range_middle: 'bg-blue-50 text-gray-900 rounded-none !important',
              day_hidden: 'invisible',
            }}
          />
        </div>
      )}
    </div>
  )
}

