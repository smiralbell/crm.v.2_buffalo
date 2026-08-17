'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Video,
  Unlink,
} from 'lucide-react'

export type MeetingDto = {
  id: string
  fireflies_id: string
  title: string | null
  meeting_link: string | null
  transcript_url: string | null
  participants: { email: string | null; name: string | null }[]
  started_at: string | null
  duration_minutes: number | null
  summary_overview: string | null
  summary_action_items: string | null
  transcript?: string | null
  has_transcript: boolean
  status: string
  match_reason: string | null
  lead_id: number | null
  contact_id?: number | null
}

function fmtDate(iso: string | null) {
  if (!iso) return 'Sin fecha'
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function fmtDuration(mins: number | null) {
  if (mins == null || Number.isNaN(mins)) return null
  const m = Math.round(mins)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h}h ${rest}m` : `${h}h`
}

type Props =
  | { leadId: number; contactId?: never }
  | { contactId: number; leadId?: never }

export default function LeadMeetingsPanel(props: Props) {
  const leadId = 'leadId' in props ? props.leadId : undefined
  const contactId = 'contactId' in props ? props.contactId : undefined
  const [meetings, setMeetings] = useState<MeetingDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MeetingDto | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = leadId
        ? `/api/leads/${leadId}/meetings`
        : `/api/contacts/${contactId}/meetings`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error cargando reuniones')
      setMeetings(data.meetings || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [leadId, contactId])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleOpen(id: string) {
    if (openId === id) {
      setOpenId(null)
      setDetail(null)
      return
    }
    setOpenId(id)
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await fetch(`/api/integrations/fireflies/meetings/${id}?transcript=1`)
      const data = await res.json()
      if (res.ok) setDetail(data.meeting)
    } finally {
      setDetailLoading(false)
    }
  }

  async function unlink(id: string) {
    if (!confirm('¿Desvincular esta reunión de este lead?')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/integrations/fireflies/meetings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlink' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error')
      }
      if (openId === id) {
        setOpenId(null)
        setDetail(null)
      }
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 sm:px-6 pt-5 pb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Video className="h-4 w-4 text-gray-400" />
          Reuniones
        </h2>
        {!loading && (
          <span className="text-[11px] font-medium text-gray-400 tabular-nums">
            {meetings.length}
          </span>
        )}
      </div>
      <div className="px-5 sm:px-6 pb-5">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando reuniones…
          </div>
        )}
        {!loading && error && (
          <p className="text-sm text-red-600 py-4 text-center">{error}</p>
        )}
        {!loading && !error && meetings.length === 0 && (
          <p className="text-sm text-gray-400 py-6 text-center">
            {leadId
              ? 'Aún no hay reuniones de Fireflies vinculadas a este lead.'
              : 'Aún no hay reuniones de Fireflies vinculadas a este contacto.'}
          </p>
        )}
        {!loading && !error && meetings.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {meetings.map((m) => {
              const open = openId === m.id
              const shown = open && detail?.id === m.id ? detail : m
              return (
                <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => void toggleOpen(m.id)}
                    className="w-full text-left flex items-start gap-3 group"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 group-hover:bg-gray-200">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {m.title || 'Reunión sin título'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {fmtDate(m.started_at)}
                        {fmtDuration(m.duration_minutes)
                          ? ` · ${fmtDuration(m.duration_minutes)}`
                          : ''}
                      </p>
                    </div>
                    {open ? (
                      <ChevronUp className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
                    )}
                  </button>

                  {open && (
                    <div className="mt-3 ml-11 space-y-3">
                      {detailLoading && (
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Cargando detalle…
                        </div>
                      )}
                      {!detailLoading && (
                        <>
                          {shown.summary_overview && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                Resumen
                              </p>
                              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">
                                {shown.summary_overview}
                              </pre>
                            </div>
                          )}
                          {shown.summary_action_items && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                Action items
                              </p>
                              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">
                                {shown.summary_action_items}
                              </pre>
                            </div>
                          )}
                          {shown.transcript && (
                            <details className="group/tr">
                              <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800">
                                Transcripción
                              </summary>
                              <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-600 font-sans leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100 max-h-72 overflow-y-auto">
                                {shown.transcript}
                              </pre>
                            </details>
                          )}
                          {!shown.summary_overview && !shown.transcript && (
                            <p className="text-xs text-gray-400">
                              Sin resumen ni transcripción todavía.
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {shown.transcript_url && (
                              <a
                                href={shown.transcript_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Button variant="outline" size="sm" className="h-8 text-xs">
                                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                  Abrir en Fireflies
                                </Button>
                              </a>
                            )}
                            {leadId ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-gray-500"
                                disabled={busyId === m.id}
                                onClick={() => void unlink(m.id)}
                              >
                                {busyId === m.id ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                ) : (
                                  <Unlink className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                Desvincular
                              </Button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
