import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { outcomeLabel } from '@/lib/coldcall/lead-table'
import type { ScriptBox } from '@/lib/coldcall/script-parser'
import {
  defaultWhatsAppTemplate,
  formatPhoneForDisplay,
  normalizeWhatsAppPhone,
  openWhatsApp,
  resolveLeadPhone,
} from '@/lib/coldcall/whatsapp'
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Loader2,
  Phone,
  ThumbsUp,
  ThumbsDown,
  Clock,
  PhoneMissed,
  Ban,
  Check,
  History,
  CalendarPlus,
  CalendarClock,
  MessageCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { toDatetimeLocalValue } from '@/lib/coldcall/cal-embed'
import type { ColumnMapping } from '@/lib/coldcall/field-mapping'
import { splitLeadDisplayFields } from '@/lib/coldcall/lead-display'
import { LeadFieldCards } from '@/components/coldcall/LeadFieldCards'
import type { CalBookingPayload } from '@/components/coldcall/CalComMeetingEmbed'

const CalComMeetingEmbed = dynamic(() => import('@/components/coldcall/CalComMeetingEmbed'), {
  ssr: false,
  loading: () => (
    <div className="py-8 text-center text-sm text-gray-400">Cargando calendario...</div>
  ),
})

interface CallLead {
  id: number
  nombre: string
  first_name: string | null
  last_name: string | null
  telefono: string | null
  email: string | null
  empresa: string | null
  cargo: string | null
  sector: string | null
  zona: string | null
  linkedin: string | null
  web: string | null
  cif: string | null
  direccion: string | null
  stage: string
  call_attempts: number
  notas: string | null
  raw_data: Record<string, string>
  calls?: CallRecord[]
}

interface CallRecord {
  id: number
  fecha: string
  resultado: string
  duracion: number | null
  notas: string | null
}

function formatCallDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

type BaseOutcome = 'interesado' | 'llamar_tarde' | 'sin_respuesta' | 'no_interesado' | 'no_contactar'
type InteresadoFollowUp = 'reunion' | 'sin_reunion'

const RESULTADOS: {
  id: BaseOutcome
  label: string
  icon: LucideIcon
  hint: string
}[] = [
  { id: 'interesado', label: 'Interesado', icon: ThumbsUp, hint: 'Seguimiento y posible reunión' },
  { id: 'llamar_tarde', label: 'Llamar más tarde', icon: Clock, hint: 'Programar callback' },
  { id: 'sin_respuesta', label: 'Sin respuesta', icon: PhoneMissed, hint: 'Registrar intento y pasar al siguiente' },
  { id: 'no_interesado', label: 'No interesado', icon: ThumbsDown, hint: 'Mensaje de cierre opcional' },
  { id: 'no_contactar', label: 'No contactar', icon: Ban, hint: 'Solo nota interna' },
]

interface WhatsAppPanelProps {
  phone: string | null
  phoneDisplay: string | null
  message: string
  onChange: (value: string) => void
  onSend: () => void
  sent: boolean
}

function WhatsAppPanel({ phone, phoneDisplay, message, onChange, onSend, sent }: WhatsAppPanelProps) {
  const hasPhone = Boolean(phone && normalizeWhatsAppPhone(phone))

  return (
    <div className="rounded-xl border border-green-100 bg-green-50/50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-green-900 flex items-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5" />
          Mensaje por WhatsApp
        </p>
        {sent && (
          <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-800">
            Abierto
          </Badge>
        )}
      </div>
      {hasPhone && phoneDisplay && (
        <p className="text-[11px] text-green-800">
          Se abrirá WhatsApp Web con{' '}
          <span className="font-medium tabular-nums">{phoneDisplay}</span>
        </p>
      )}
      <Textarea
        rows={5}
        value={message}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg resize-none text-sm bg-white border-green-100"
        placeholder="Escribe o edita la plantilla..."
      />
      <Button
        type="button"
        variant="outline"
        className="w-full rounded-lg border-green-200 text-green-900 hover:bg-green-100"
        disabled={!hasPhone || !message.trim()}
        onClick={onSend}
      >
        <MessageCircle className="h-4 w-4 mr-2" />
        Enviar por WhatsApp
      </Button>
      {!hasPhone && (
        <p className="text-[11px] text-amber-700">Este lead no tiene teléfono para WhatsApp.</p>
      )}
    </div>
  )
}

interface CampaignCallStationProps {
  campaignId: string
}

export default function CampaignCallStation({ campaignId }: CampaignCallStationProps) {
  const router = useRouter()
  const leadIdParam = router.query.leadId as string | undefined

  const [loading, setLoading] = useState(true)
  const [campaignName, setCampaignName] = useState('')
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({})
  const [lead, setLead] = useState<CallLead | null>(null)
  const [index, setIndex] = useState(0)
  const [total, setTotal] = useState(0)
  const [prevId, setPrevId] = useState<number | null>(null)
  const [nextId, setNextId] = useState<number | null>(null)
  const [scriptEs, setScriptEs] = useState<ScriptBox[]>([])
  const [scriptCa, setScriptCa] = useState<ScriptBox[]>([])
  const [scriptLang, setScriptLang] = useState<'es' | 'ca'>('es')

  const [resultado, setResultado] = useState<BaseOutcome | null>(null)
  const [interesadoFollowUp, setInteresadoFollowUp] = useState<InteresadoFollowUp | null>(null)
  const [notas, setNotas] = useState('')
  const [duracion, setDuracion] = useState('')
  const [callbackAt, setCallbackAt] = useState('')
  const [whatsAppMessage, setWhatsAppMessage] = useState('')
  const [whatsappSent, setWhatsappSent] = useState(false)
  const [calBooked, setCalBooked] = useState(false)
  const [calBookingSummary, setCalBookingSummary] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    if (!campaignId) return
    setLoading(true)
    setSaved(false)
    setSaveError('')
    setResultado(null)
    setInteresadoFollowUp(null)
    setNotas('')
    setDuracion('')
    setCallbackAt('')
    setWhatsAppMessage('')
    setWhatsappSent(false)
    setCalBooked(false)
    setCalBookingSummary('')

    const params = leadIdParam ? `?leadId=${leadIdParam}` : ''
    fetch(`/api/coldcall/campaigns/${campaignId}/call-session${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setCampaignName(d.campaign?.name || '')
        setColumnMapping(d.campaign?.column_mapping || {})
        setLead(d.lead)
        setIndex(d.index ?? 0)
        setTotal(d.total ?? 0)
        setPrevId(d.prevId)
        setNextId(d.nextId)
        setScriptEs(d.script?.es || [])
        setScriptCa(d.script?.ca || [])
      })
      .catch(() => setLead(null))
      .finally(() => setLoading(false))
  }, [campaignId, leadIdParam])

  useEffect(() => {
    if (router.isReady) load()
  }, [router.isReady, load])

  const goLead = (id: number | null) => {
    if (!id) return
    router.push(`/coldcalling/campanas/${campaignId}/llamadas?leadId=${id}`, undefined, {
      shallow: true,
    })
  }

  const selectResultado = (id: BaseOutcome) => {
    if (resultado === id) {
      setResultado(null)
      setInteresadoFollowUp(null)
      setWhatsAppMessage('')
      setWhatsappSent(false)
      setCallbackAt('')
      return
    }
    setResultado(id)
    setInteresadoFollowUp(null)
    setWhatsappSent(false)
    setCallbackAt('')
    setCalBooked(false)
    setCalBookingSummary('')
    setSaveError('')
    if (id === 'interesado' && lead) {
      setWhatsAppMessage(defaultWhatsAppTemplate('interesado', lead))
    } else if (id === 'no_interesado' && lead) {
      setWhatsAppMessage(defaultWhatsAppTemplate('no_interesado', lead))
    } else {
      setWhatsAppMessage('')
    }
  }

  const resolvedResultado = (): string | null => {
    if (!resultado) return null
    if (resultado === 'interesado' && interesadoFollowUp === 'reunion') return 'reunion_agendada'
    return resultado
  }

  const handleCalBooked = (booking: CalBookingPayload) => {
    setCallbackAt(toDatetimeLocalValue(booking.startTime))
    setCalBooked(true)
    const when = new Date(booking.startTime).toLocaleString('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const summary = booking.title ? `${booking.title} · ${when}` : when
    setCalBookingSummary(summary)
    const lines = [
      `Reunión agendada en Cal.com: ${when}`,
      booking.title ? `Evento: ${booking.title}` : null,
      booking.uid ? `Reserva: ${booking.uid}` : null,
      booking.videoCallUrl ? `Enlace: ${booking.videoCallUrl}` : null,
    ].filter(Boolean) as string[]
    setNotas((prev) => {
      const block = lines.join('\n')
      return prev.trim() ? `${prev.trim()}\n\n${block}` : block
    })
    setSaveError('')
  }

  const canSave = (): boolean => {
    if (!resultado) return false
    if (resultado === 'interesado' && !interesadoFollowUp) return false
    if (resultado === 'interesado' && interesadoFollowUp === 'reunion' && !calBooked) {
      return false
    }
    if (resultado === 'llamar_tarde' && !callbackAt) {
      return false
    }
    return true
  }

  const handleWhatsApp = () => {
    if (!lead) return
    const phone = resolveLeadPhone(lead, columnMapping)
    const ok = openWhatsApp(phone, whatsAppMessage)
    if (!ok) {
      setSaveError('No hay un teléfono válido para abrir WhatsApp.')
      return
    }
    setWhatsappSent(true)
    setSaveError('')
  }

  const registrar = async () => {
    if (!lead || !resultado) return
    const finalResultado = resolvedResultado()
    if (!finalResultado) return

    if (resultado === 'interesado' && !interesadoFollowUp) {
      setSaveError('Indica si quiere reunión o no.')
      return
    }
    if (resultado === 'interesado' && interesadoFollowUp === 'reunion' && !calBooked) {
      setSaveError('Agenda la reunión en el calendario de Cal.com antes de guardar.')
      return
    }
    if (resultado === 'llamar_tarde' && !callbackAt) {
      setSaveError('Indica cuándo volver a llamar.')
      return
    }

    setSaving(true)
    setSaveError('')
    const res = await fetch('/api/coldcall/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_id: lead.id,
        resultado: finalResultado,
        notas,
        duracion: duracion ? parseInt(duracion, 10) * 60 : null,
        reunion_fecha: resultado === 'llamar_tarde' ? callbackAt || null : null,
        whatsapp_enviado: whatsappSent,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setSaveError(data.error || 'No se pudo guardar la llamada.')
      return
    }
    setSaved(true)
    if (nextId) {
      setTimeout(() => goLead(nextId), 800)
    } else {
      load()
    }
  }

  const script = scriptLang === 'es' ? scriptEs : scriptCa
  const leadDisplay = lead
    ? splitLeadDisplayFields(
        {
          ...lead,
          callsCount: lead.calls?.length ?? 0,
        },
        columnMapping
      )
    : { primary: [], extra: [] }
  const leadPhone = lead ? resolveLeadPhone(lead, columnMapping) : null
  const leadPhoneDisplay = leadPhone ? formatPhoneForDisplay(leadPhone) : null
  const callHistory = lead?.calls ?? []

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      ) : !lead ? (
        <div className="space-y-4">
          <Button variant="outline" size="icon" className="rounded-xl" title="Volver a leads" asChild>
            <Link href={`/coldcalling/campanas/${campaignId}`}>
              <Home className="h-5 w-5" />
            </Link>
          </Button>
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
          <Phone className="h-10 w-10 text-gray-300 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">No hay leads en esta campaña.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Navegación + datos del lead */}
          <div className="flex items-center gap-2">
            <div className="flex items-center shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm divide-x divide-gray-200">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-none rounded-l-xl hover:bg-gray-50"
                title="Volver a leads"
                asChild
              >
                <Link href={`/coldcalling/campanas/${campaignId}`}>
                  <Home className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-8 rounded-none hover:bg-gray-50"
                disabled={!prevId}
                title="Lead anterior"
                onClick={() => goLead(prevId)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span
                className="px-2.5 text-[11px] text-gray-500 tabular-nums whitespace-nowrap select-none"
                title={`Lead ${index + 1} de ${total}`}
              >
                <span className="font-semibold text-gray-900">{index + 1}</span>
                <span className="mx-1 text-gray-300">/</span>
                <span>{total}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-8 rounded-none rounded-r-xl hover:bg-gray-50"
                disabled={!nextId}
                title="Lead siguiente"
                onClick={() => goLead(nextId)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
              <LeadFieldCards
                leadName={lead.nombre}
                primary={leadDisplay.primary}
                extra={leadDisplay.extra}
                compact
              />
            </div>
          </div>

          {/* Acciones + Guión */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Resultado de la llamada</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Elige un estado y completa las acciones debajo.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {RESULTADOS.map((r) => {
                  const Icon = r.icon
                  const active = resultado === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => selectResultado(r.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all text-left ${
                        active
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {r.label}
                    </button>
                  )
                })}
              </div>

              {resultado && (
                <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Acciones
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {RESULTADOS.find((r) => r.id === resultado)?.hint}
                    </p>
                  </div>

                  {resultado === 'interesado' && (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-700">¿Quiere reunión?</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setInteresadoFollowUp('reunion')
                            setCallbackAt('')
                            setCalBooked(false)
                            setCalBookingSummary('')
                          }}
                          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                            interesadoFollowUp === 'reunion'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <CalendarPlus className="h-4 w-4" />
                          Quiere reunión
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInteresadoFollowUp('sin_reunion')
                            setCallbackAt('')
                            setCalBooked(false)
                            setCalBookingSummary('')
                          }}
                          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                            interesadoFollowUp === 'sin_reunion'
                              ? 'bg-gray-800 text-white border-gray-800'
                              : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <XCircle className="h-4 w-4" />
                          No quiere reunión
                        </button>
                      </div>
                      {interesadoFollowUp === 'reunion' && (
                        <div className="space-y-2">
                          <CalComMeetingEmbed
                            key={`cal-${lead.id}`}
                            leadName={lead.nombre}
                            leadEmail={lead.email}
                            onBooked={handleCalBooked}
                          />
                          {calBooked && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-center gap-2">
                              <Check className="h-3.5 w-3.5 shrink-0" />
                              Reunión confirmada: {calBookingSummary}
                            </div>
                          )}
                        </div>
                      )}
                      <WhatsAppPanel
                        phone={leadPhone}
                        phoneDisplay={leadPhoneDisplay}
                        message={whatsAppMessage}
                        onChange={setWhatsAppMessage}
                        onSend={handleWhatsApp}
                        sent={whatsappSent}
                      />
                    </div>
                  )}

                  {resultado === 'no_interesado' && (
                    <WhatsAppPanel
                      phone={leadPhone}
                      phoneDisplay={leadPhoneDisplay}
                      message={whatsAppMessage}
                      onChange={setWhatsAppMessage}
                      onSend={handleWhatsApp}
                      sent={whatsappSent}
                    />
                  )}

                  {resultado === 'llamar_tarde' && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Cuándo volver a llamar *
                      </label>
                      <input
                        type="datetime-local"
                        value={callbackAt}
                        onChange={(e) => setCallbackAt(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                      />
                    </div>
                  )}

                  {resultado === 'sin_respuesta' && (
                    <p className="text-sm text-gray-600">
                      Se registrará el intento sin respuesta. El lead volverá a la cola para
                      reintentarlo más adelante.
                    </p>
                  )}

                  {resultado === 'no_contactar' && (
                    <p className="text-sm text-gray-600">
                      El lead quedará marcado como no contactar. Añade una nota abajo si hace falta
                      contexto.
                    </p>
                  )}
                </div>
              )}

              {resultado && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Nota de la llamada</label>
                  <Textarea
                    rows={3}
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Objeciones, contexto, acuerdos..."
                    className="rounded-xl resize-none bg-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Duración (min)</label>
                  <input
                    type="number"
                    min={0}
                    value={duracion}
                    onChange={(e) => setDuracion(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {saveError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {saveError}
                </div>
              )}

              <Button
                className="w-full rounded-xl"
                disabled={!canSave() || saving || saved}
                onClick={registrar}
              >
                {saved ? (
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4" /> Guardado
                  </span>
                ) : saving ? (
                  'Guardando...'
                ) : (
                  'Guardar y siguiente'
                )}
              </Button>

              {callHistory.length > 0 && (
                <div className="pt-2 border-t border-gray-100 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <History className="h-4 w-4 text-gray-500" />
                    Historial de llamadas
                  </div>
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {callHistory.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="font-normal text-[10px]">
                            {outcomeLabel(c.resultado)}
                          </Badge>
                          <span className="text-gray-400 shrink-0">{formatCallDate(c.fecha)}</span>
                        </div>
                        {c.duracion != null && c.duracion > 0 && (
                          <p className="text-gray-500 mt-1">{Math.round(c.duracion / 60)} min</p>
                        )}
                        {c.notas?.trim() && (
                          <p className="text-gray-700 mt-1 whitespace-pre-line">{c.notas}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="flex border-b border-gray-100">
                {(
                  [
                    { id: 'es' as const, label: 'Castellano' },
                    { id: 'ca' as const, label: 'Català' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setScriptLang(t.id)}
                    className={`flex-1 py-2.5 text-xs font-semibold ${
                      scriptLang === t.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto max-h-[520px] divide-y divide-gray-100">
                {script.length === 0 ? (
                  <p className="p-6 text-sm text-gray-500 text-center">
                    No hay guión configurado.{' '}
                    <Link
                      href={`/coldcalling/campanas/${campaignId}`}
                      className="text-gray-900 underline"
                    >
                      Configúralo en la campaña
                    </Link>
                  </p>
                ) : (
                  script.map((box, i) => (
                    <div key={i} className="p-4 space-y-2">
                      <Badge variant="secondary" className="font-semibold text-xs">
                        {box.title}
                      </Badge>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line bg-gray-50 rounded-xl p-3 border border-gray-100">
                        {box.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
