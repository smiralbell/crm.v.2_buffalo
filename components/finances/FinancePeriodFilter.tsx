'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import DateRangePicker, { type DateRangePickerResult } from '@/components/DateRangePicker'
import {
  PERIOD_PRESETS,
  type PeriodPresetId,
  type PeriodRange,
  detectPeriodPreset,
  formatPeriodLabel,
  getPeriodRangeForPreset,
} from '@/lib/finance/period-presets'
import { cn } from '@/lib/utils'

interface Props {
  value: PeriodRange
  onChange: (range: PeriodRange, preset: PeriodPresetId) => void
  className?: string
}

export default function FinancePeriodFilter({ value, onChange, className }: Props) {
  const [activePreset, setActivePreset] = useState<PeriodPresetId>(() =>
    detectPeriodPreset(value.start, value.end)
  )
  const [showCustom, setShowCustom] = useState(activePreset === 'custom')

  const applyPreset = (preset: PeriodPresetId) => {
    setActivePreset(preset)
    if (preset === 'custom') {
      setShowCustom(true)
      return
    }
    setShowCustom(false)
    const range = getPeriodRangeForPreset(preset)
    onChange(range, preset)
  }

  const handleCustomRange = (range: DateRangePickerResult) => {
    if (range.start && range.end) {
      setActivePreset('custom')
      onChange({ start: range.start, end: range.end }, 'custom')
    }
  }

  return (
    <div className={cn('flex flex-col gap-2 w-full min-w-0', className)}>
      <div className="flex flex-nowrap items-center gap-1 w-full overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PERIOD_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset.id)}
            className={cn(
              'shrink-0 px-2 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap',
              activePreset === preset.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
            )}
          >
            {preset.label}
          </button>
        ))}
        <span className="shrink-0 text-[11px] text-gray-400 tabular-nums pl-1 hidden sm:inline">
          {formatPeriodLabel(value.start, value.end)}
        </span>
      </div>

      {(showCustom || activePreset === 'custom') && (
        <DateRangePicker
          onRangeChange={handleCustomRange}
          defaultRange={{ start: value.start, end: value.end }}
        />
      )}

      <p className="text-[11px] text-gray-400 tabular-nums sm:hidden">
        {formatPeriodLabel(value.start, value.end)}
      </p>
    </div>
  )
}

export function periodToQuery(range: PeriodRange): { start: string; end: string } {
  return {
    start: format(range.start, 'yyyy-MM-dd'),
    end: format(range.end, 'yyyy-MM-dd'),
  }
}
