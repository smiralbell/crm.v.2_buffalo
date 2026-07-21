import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CalendarApiEvent, CrmLink } from '@/components/calendario/calendar-types'
import { fmtRange } from '@/components/calendario/calendar-utils'
import {
  ArrowRight,
  Building2,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  UserRound,
  Video,
} from 'lucide-react'

function sourceLabel(source: CrmLink['source']) {
  if (source === 'coldcall') return 'Cold calling'
  if (source === 'cal_booking') return 'Cal.com'
  if (source === 'email') return 'Email'
  return 'Lead CRM'
}

type Props = {
  event: CalendarApiEvent | null
  onClose: () => void
  onNotesSaved?: (eventId: string, notes: string) => void
}

export default function CalendarEventDetailDialog({ event, onClose, onNotesSaved }: Props) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!event) return
    setNotes(event.userNotes || '')
    setSaved(false)
    setError('')

    let cancelled = false
    void (async () => {
      try {
        const qs = new URLSearchParams({ eventIds: event.id })
        const res = await fetch(`/api/integrations/google/calendar/event-notes?${qs}`)
        const data = await res.json()
        if (cancelled || !res.ok) return
        const loaded = (data.notes?.[event.id] as string | undefined) || ''
        setNotes(loaded)
        if (loaded !== (event.userNotes || '')) {
          onNotesSaved?.(event.id, loaded)
        }
      } catch {
        /* keep event.userNotes fallback */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [event?.id])

  const saveNotes = async () => {
    if (!event) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/integrations/google/calendar/event-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, notes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setSaved(true)
      onNotesSaved?.(event.id, data.notes || '')
      window.setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const crm = event?.crm

  return (
    <Dialog open={Boolean(event)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-3xl border-gray-200 p-0 overflow-hidden gap-0 max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 px-5 py-4 text-white shrink-0">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold leading-snug pr-6 text-white">
              {event?.title}
            </DialogTitle>
          </DialogHeader>
          {event && (
            <p className="mt-1.5 text-xs text-white/70">
              {fmtRange(event.start, event.end, event.allDay)}
            </p>
          )}
        </div>

        {event && (
          <div className="space-y-3 px-5 py-4 text-sm overflow-y-auto">
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
                No hay lead con el mismo email en el CRM.
              </div>
            )}

            {event.attendees && event.attendees.length > 0 && (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3.5 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Asistentes
                </p>
                {event.attendees.map((a) => (
                  <p key={a.email} className="text-xs text-gray-700">
                    {a.displayName || a.email}
                    {a.self ? ' (tú)' : ''}
                    {a.displayName ? (
                      <span className="text-gray-400"> · {a.email}</span>
                    ) : null}
                  </p>
                ))}
              </div>
            )}

            {event.location && (
              <p className="flex gap-2.5 text-gray-700">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-50 border border-gray-100">
                  <MapPin className="h-3.5 w-3.5 text-gray-500" />
                </span>
                <span className="pt-1.5">{event.location}</span>
              </p>
            )}

            {event.description && (
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3.5 text-gray-700 whitespace-pre-wrap text-xs leading-relaxed max-h-36 overflow-y-auto">
                {event.description.replace(/<[^>]+>/g, '')}
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white p-3.5 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Tus notas
              </p>
              <Textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Preparación, acuerdos, seguimiento..."
                className="resize-none text-sm rounded-xl"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="rounded-xl h-8 text-xs"
                  disabled={saving}
                  onClick={() => void saveNotes()}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : saved ? (
                    <span className="inline-flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Guardado
                    </span>
                  ) : (
                    'Guardar notas'
                  )}
                </Button>
                {error && <p className="text-xs text-red-600">{error}</p>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {event.meetLink && (
                <a
                  href={event.meetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
                >
                  <Video className="h-3.5 w-3.5" />
                  Google Meet
                </a>
              )}
              {event.htmlLink && (
                <a
                  href={event.htmlLink}
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
  )
}
