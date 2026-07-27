'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PhoneCall, Timer } from 'lucide-react'
import CallRecordButton from '@/components/coldcall/CallRecordButton'

export function formatCallElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function useCallTimer() {
  const [running, setRunning] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)

  useEffect(() => {
    if (!running || startedAt == null) return
    const tick = () => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [running, startedAt])

  const start = () => {
    setStartedAt(Date.now())
    setElapsedSec(0)
    setRunning(true)
  }

  const reset = () => {
    setRunning(false)
    setStartedAt(null)
    setElapsedSec(0)
  }

  const getDurationSec = (): number | null => {
    if (startedAt == null) return null
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  }

  return { running, elapsedSec, start, reset, getDurationSec }
}

interface CallTimerBarProps {
  running: boolean
  elapsedSec: number
  onStart: () => void
  onReset: () => void
}

export default function CallTimerBar({
  running,
  elapsedSec,
  onStart,
  onReset,
}: CallTimerBarProps) {
  return (
    <div className="space-y-2">
      {!running ? (
        <Button
          type="button"
          className="w-full rounded-xl h-12 gap-2 bg-emerald-700 hover:bg-emerald-800 text-base font-semibold shadow-sm"
          onClick={onStart}
        >
          <PhoneCall className="h-5 w-5" />
          La llamada ya ha empezado
        </Button>
      ) : (
        <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Llamada en curso
              </p>
              <p className="text-2xl font-bold tabular-nums text-emerald-950 leading-none mt-1">
                {formatCallElapsed(elapsedSec)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Timer className="h-4 w-4 text-emerald-700 hidden sm:block" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-lg text-emerald-900"
              onClick={onReset}
            >
              Reiniciar
            </Button>
          </div>
        </div>
      )}

      <CallRecordButton />
    </div>
  )
}
