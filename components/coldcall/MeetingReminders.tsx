'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CallbackScheduler from '@/components/coldcall/CallbackScheduler'
import { telHref } from '@/lib/coldcall/lead-links'
import { formatPhoneForDisplay, openWhatsApp } from '@/lib/coldcall/whatsapp'
import {
  AlertTriangle,
  Check,
  CalendarClock,
  Loader2,
  Phone,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react'

export interface ReminderMeeting {
  call_id: number
  prospect_id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  campaign_id: number | null
  campaign_name: string | null
  at: string
  notas: string | null
  prospect_notas: string | null
  sector: string | null
  confirm_status: string | null
  demo_prep_status: string | null
  tips: string[]
}

function fmtWhen(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
    time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    short: d.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }),
  }
}

function callStationHref(m: ReminderMeeting) {
  if (m.campaign_id == null) return null
  return `/coldcalling/campanas/${m.campaign_id}/llamadas?leadId=${m.prospect_id}`
}

function leadHref(m: ReminderMeeting) {
  if (m.campaign_id == null) return null
  return `/coldcalling/campanas/${m.campaign_id}/leads/${m.prospect_id}`
}

export function MeetingConfirmReminders({
  items,
  onChanged,
  alwaysShow = false,
}: {
  items: ReminderMeeting[]
  onChanged: () => void
  /** Si true, muestra el bloque aunque no haya avisos pendientes. */
  alwaysShow?: boolean
}) {
  const [busyId, setBusyId] = useState<number | null>(null)
  const [rescheduleId, setRescheduleId] = useState<number | null>(null)
  const [newAt, setNewAt] = useState('')
  const [error, setError] = useState('')

  const act = async (
    callId: number,
    action: 'confirm' | 'cancel' | 'reschedule',
    extra?: { note?: string; new_reunion_fecha?: string }
  ) => {
    setBusyId(callId)
    setError('')
    try {
      const res = await fetch('/api/coldcall/meeting-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: callId, action, ...extra }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo guardar')
        return
      }
      setRescheduleId(null)
      setNewAt('')
      onChanged()
    } catch {
      setError('Error de red')
    } finally {
      setBusyId(null)
    }
  }

  if (items.length === 0 && !alwaysShow) return null

  return (
    <Card className="shadow-sm border-amber-200 bg-amber-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-amber-950 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Confirmar reuniones (día antes)
          <Badge variant="secondary" className="text-[10px] font-normal bg-amber-100 text-amber-900">
            {items.length}
          </Badge>
        </CardTitle>
        <p className="text-xs text-amber-900/80 mt-1">
          Cuando la reunión es en las próximas 48 h, llama para confirmar. Luego marca{' '}
          <strong>Confirmada</strong>, <strong>Reagendada</strong> o <strong>Cancelada</strong>.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {error && (
          <div className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-amber-900">
            {error}
          </div>
        )}
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-200 bg-white/70 px-4 py-6 text-center">
            <CalendarClock className="h-8 w-8 text-amber-300 mx-auto" />
            <p className="mt-2 text-sm text-amber-900/80">
              Ahora mismo no hay reuniones en las próximas 48 horas pendientes de confirmar.
            </p>
            <p className="text-xs text-amber-800/60 mt-1">
              Cuando haya alguna, verás aquí los botones Confirmar / Reagendar / Cancelar.
            </p>
          </div>
        ) : (
          items.map((m) => {
            const when = fmtWhen(m.at)
            const busy = busyId === m.call_id
            const tel = telHref(m.telefono)
            const phoneLabel = formatPhoneForDisplay(m.telefono)
            const station = callStationHref(m)
            const lead = leadHref(m)
            const isRescheduling = rescheduleId === m.call_id

            return (
              <div
                key={m.call_id}
                className="rounded-xl border border-amber-200/80 bg-white px-4 py-3 space-y-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{m.nombre}</p>
                    <p className="text-sm text-gray-500">
                      {[m.empresa, m.campaign_name].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <p className="text-sm text-amber-900 font-medium mt-1 capitalize">
                      {when.date} · {when.time}
                    </p>
                    {(m.prospect_notas || m.notas) && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {m.prospect_notas || m.notas}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    {tel && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg gap-1"
                        asChild
                      >
                        <a href={tel}>
                          <Phone className="h-3.5 w-3.5" />
                          {phoneLabel || 'Llamar'}
                        </a>
                      </Button>
                    )}
                    {m.telefono && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        onClick={() => {
                          const when = fmtWhen(m.at)
                          openWhatsApp(
                            m.telefono,
                            `Hola ${m.nombre.split(' ')[0]}, te escribo de Buffalo AI para confirmar la reunión del ${when.date} a las ${when.time}. ¿Te ha llegado la convocatoria?`
                          )
                        }}
                      >
                        WhatsApp
                      </Button>
                    )}
                    {station && (
                      <Button size="sm" variant="ghost" className="rounded-lg" asChild>
                        <Link href={station}>Estación</Link>
                      </Button>
                    )}
                    {lead && (
                      <Button size="sm" variant="ghost" className="rounded-lg" asChild>
                        <Link href={lead}>Lead</Link>
                      </Button>
                    )}
                  </div>
                </div>

                {isRescheduling ? (
                  <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-medium text-gray-700">Nueva fecha de reunión</p>
                    <CallbackScheduler value={newAt} onChange={setNewAt} />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="rounded-lg gap-1 bg-amber-700 hover:bg-amber-800"
                        disabled={busy || !newAt}
                        onClick={() =>
                          act(m.call_id, 'reschedule', { new_reunion_fecha: newAt })
                        }
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Guardar nueva fecha
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg"
                        onClick={() => {
                          setRescheduleId(null)
                          setNewAt('')
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="rounded-lg gap-1.5 bg-emerald-700 hover:bg-emerald-800"
                      disabled={busy}
                      onClick={() => act(m.call_id, 'confirm')}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Confirmada
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg gap-1.5"
                      disabled={busy}
                      onClick={() => {
                        setRescheduleId(m.call_id)
                        setNewAt('')
                      }}
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                      Reagendada
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg gap-1.5 text-red-700 border-red-200 hover:bg-red-50"
                      disabled={busy}
                      onClick={() => {
                        if (confirm('¿Marcar esta reunión como cancelada?')) {
                          act(m.call_id, 'cancel')
                        }
                      }}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancelada
                    </Button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

export function DemoPrepReminders({
  items,
  onChanged,
}: {
  items: ReminderMeeting[]
  onChanged: () => void
}) {
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const mark = async (callId: number, status: 'ready' | 'done') => {
    setBusyId(callId)
    setError('')
    try {
      const res = await fetch('/api/coldcall/meeting-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: callId, action: 'demo_prep', status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo guardar')
        return
      }
      onChanged()
    } catch {
      setError('Error de red')
    } finally {
      setBusyId(null)
    }
  }

  if (items.length === 0) return null

  return (
    <Card className="shadow-sm border-violet-200 bg-violet-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-violet-950 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          ¡Ep! Prepara la demo
          <Badge variant="secondary" className="text-[10px] font-normal bg-violet-100 text-violet-900">
            {items.length}
          </Badge>
        </CardTitle>
        <p className="text-xs text-violet-900/80 mt-1">
          Reuniones próximas. Revisa despacho, notas y prepara una demo personalizada.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {error && (
          <div className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs text-violet-900">
            {error}
          </div>
        )}
        {items.map((m) => {
          const when = fmtWhen(m.at)
          const href = leadHref(m)
          const busy = busyId === m.call_id
          return (
            <div
              key={m.call_id}
              className="rounded-xl border border-violet-100 bg-white px-4 py-3 space-y-3 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                    Tienes una reunión
                  </p>
                  <p className="font-semibold text-gray-900 text-lg leading-tight mt-0.5">
                    {when.date} · {when.time}
                  </p>
                  <p className="text-sm text-gray-800 mt-1">
                    <strong>{m.empresa || m.nombre}</strong>
                    {m.empresa ? ` · ${m.nombre}` : ''}
                  </p>
                  {m.sector && <p className="text-xs text-gray-500 mt-0.5">Sector: {m.sector}</p>}
                </div>
                {href && (
                  <Button size="sm" variant="outline" className="rounded-lg" asChild>
                    <Link href={href}>Ver lead</Link>
                  </Button>
                )}
              </div>

              {(m.prospect_notas || m.notas) && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    Notas
                  </p>
                  <p className="text-xs text-gray-700 whitespace-pre-line bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                    {m.prospect_notas || m.notas}
                  </p>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 mb-1">
                  Checklist demo
                </p>
                <ul className="space-y-1">
                  {m.tips.map((tip) => (
                    <li key={tip} className="text-xs text-gray-700 flex gap-2">
                      <span className="text-violet-500">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="rounded-lg gap-1.5 bg-violet-700 hover:bg-violet-800"
                  disabled={busy || m.demo_prep_status === 'ready'}
                  onClick={() => mark(m.call_id, 'ready')}
                >
                  <Check className="h-3.5 w-3.5" />
                  {m.demo_prep_status === 'ready' ? 'Demo lista' : 'Marcar demo lista'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-lg"
                  disabled={busy}
                  onClick={() => mark(m.call_id, 'done')}
                >
                  Ocultar
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function useMeetingReminders() {
  const [confirm, setConfirm] = useState<ReminderMeeting[]>([])
  const [demoPrep, setDemoPrep] = useState<ReminderMeeting[]>([])
  const [canSeeDemoPrep, setCanSeeDemoPrep] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/coldcall/meeting-reminders')
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Error')
        setConfirm(data.confirm || [])
        setDemoPrep(data.demo_prep || [])
        setCanSeeDemoPrep(Boolean(data.can_see_demo_prep))
      })
      .catch(() => {
        setConfirm([])
        setDemoPrep([])
        setCanSeeDemoPrep(false)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { confirm, demoPrep, canSeeDemoPrep, loading, reload: load }
}

export function MeetingRemindersBlock({
  alwaysShowConfirm = false,
}: {
  /** En Reuniones: muestra siempre el bloque de confirmación (vacío o con avisos). */
  alwaysShowConfirm?: boolean
}) {
  const { confirm, demoPrep, canSeeDemoPrep, loading, reload } = useMeetingReminders()

  if (loading && confirm.length === 0 && demoPrep.length === 0) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
      </div>
    )
  }

  if (
    !alwaysShowConfirm &&
    confirm.length === 0 &&
    (!canSeeDemoPrep || demoPrep.length === 0)
  ) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 text-gray-500" onClick={reload}>
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar avisos
        </Button>
      </div>
      {canSeeDemoPrep && <DemoPrepReminders items={demoPrep} onChanged={reload} />}
      <MeetingConfirmReminders
        items={confirm}
        onChanged={reload}
        alwaysShow={alwaysShowConfirm}
      />
    </div>
  )
}
