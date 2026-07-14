'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { loadCalEmbed, toDatetimeLocalValue } from '@/lib/coldcall/cal-embed'

const CAL_NAMESPACE = 'reunion-agente-llamada'
const CAL_LINK = 'buffalo-agencia/reunion-agente-llamada'
const CAL_ORIGIN = 'https://app.cal.com'

export interface CalBookingPayload {
  startTime: string
  endTime?: string
  uid?: string
  title?: string
  videoCallUrl?: string
}

interface CalComMeetingEmbedProps {
  leadName?: string | null
  leadEmail?: string | null
  onBooked: (booking: CalBookingPayload) => void
}

export default function CalComMeetingEmbed({
  leadName,
  leadEmail,
  onBooked,
}: CalComMeetingEmbedProps) {
  const reactId = useId().replace(/:/g, '')
  const containerId = `my-cal-inline-reunion-agente-llamada-${reactId}`
  const onBookedRef = useRef(onBooked)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  onBookedRef.current = onBooked

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      setLoading(true)
      setError('')
      try {
        const Cal = await loadCalEmbed()
        if (cancelled) return

        Cal('init', CAL_NAMESPACE, { origin: CAL_ORIGIN })
        Cal.config = Cal.config || {}
        Cal.config.forwardQueryParams = true

        const config: Record<string, string> = {
          layout: 'month_view',
          useSlotsViewOnSmallScreen: 'true',
        }
        if (leadName?.trim()) config.name = leadName.trim()
        if (leadEmail?.trim()) config.email = leadEmail.trim()

        Cal.ns[CAL_NAMESPACE]('inline', {
          elementOrSelector: `#${containerId}`,
          config,
          calLink: CAL_LINK,
        })

        Cal.ns[CAL_NAMESPACE]('ui', {
          cssVarsPerTheme: {
            light: { 'cal-brand': '#0cb155' },
            dark: { 'cal-brand': '#0cb155' },
          },
          hideEventTypeDetails: false,
          layout: 'month_view',
        })

        Cal.ns[CAL_NAMESPACE]('on', {
          action: 'bookingSuccessfulV2',
          callback: (e: Event) => {
            const detail = (e as CustomEvent).detail as {
              data?: {
                uid?: string
                title?: string
                startTime?: string
                endTime?: string
                videoCallUrl?: string
              }
            }
            const data = detail?.data
            if (!data?.startTime) return
            onBookedRef.current({
              startTime: data.startTime,
              endTime: data.endTime,
              uid: data.uid,
              title: data.title,
              videoCallUrl: data.videoCallUrl,
            })
          },
        })

        Cal.ns[CAL_NAMESPACE]('on', {
          action: 'bookingSuccessful',
          callback: (e: Event) => {
            const detail = (e as CustomEvent).detail as {
              booking?: { startTime?: string; endTime?: string; uid?: string; title?: string }
              startTime?: string
            }
            const startTime = detail?.booking?.startTime ?? detail?.startTime
            if (!startTime) return
            onBookedRef.current({
              startTime,
              endTime: detail?.booking?.endTime,
              uid: detail?.booking?.uid,
              title: detail?.booking?.title,
            })
          },
        })
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error al cargar el calendario')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [containerId, leadName, leadEmail])

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-600">
        Agenda la reunión en Cal.com. Los datos del lead se rellenan automáticamente si están
        disponibles.
      </p>
      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparando calendario...
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}
      <div
        id={containerId}
        className="w-full min-h-[420px] max-h-[520px] overflow-auto rounded-xl border border-gray-200 bg-white"
      />
    </div>
  )
}

export { toDatetimeLocalValue }
