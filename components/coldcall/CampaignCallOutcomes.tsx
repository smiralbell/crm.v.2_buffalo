import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import CallTimerBar, { useCallTimer } from '@/components/coldcall/CallTimerBar'
import type { ComercialPersona } from '@/lib/coldcall/comercial-persona'
import { DEFAULT_CEO_PERSONA } from '@/lib/coldcall/comercial-persona'
import {
  contactTemplate,
  openGmailCompose,
} from '@/lib/coldcall/contact-templates'
import {
  callbackConfirmTemplate,
  defaultCallbackDatetime,
  formatCallbackWhen,
} from '@/lib/coldcall/callback-schedule'
import CallbackScheduler from '@/components/coldcall/CallbackScheduler'
import { commissionPerClosedSale, formatEur } from '@/lib/coldcall/commission'
import {
  formatPhoneForDisplay,
  normalizeWhatsAppPhone,
  openWhatsApp,
} from '@/lib/coldcall/whatsapp'
import { toDatetimeLocalValue } from '@/lib/coldcall/cal-embed'
import type { CalBookingPayload } from '@/components/coldcall/CalComMeetingEmbed'
import {
  CalendarPlus,
  Check,
  Clock,
  Mail,
  MessageCircle,
  PhoneMissed,
  Send,
  ThumbsDown,
  ThumbsUp,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

const CalComMeetingEmbed = dynamic(() => import('@/components/coldcall/CalComMeetingEmbed'), {
  ssr: false,
  loading: () => <div className="py-6 text-center text-sm text-gray-400">Cargando calendario...</div>,
})

export type UiOutcome = 'sin_respuesta' | 'llamar_tarde' | 'info_enviada' | 'interesado' | 'no_interesado'
type InteresadoFollowUp = 'reunion' | 'sin_reunion'

const OUTCOMES: { id: UiOutcome; label: string; icon: LucideIcon; color: string }[] = [
  { id: 'sin_respuesta', label: 'Sin respuesta', icon: PhoneMissed, color: 'border-gray-200 hover:bg-gray-50' },
  { id: 'llamar_tarde', label: 'Llamar más tarde', icon: Clock, color: 'border-amber-200 hover:bg-amber-50' },
  { id: 'info_enviada', label: 'Pide info', icon: Send, color: 'border-blue-200 hover:bg-blue-50' },
  { id: 'interesado', label: 'Interesado', icon: ThumbsUp, color: 'border-emerald-200 hover:bg-emerald-50' },
  { id: 'no_interesado', label: 'No interesado', icon: ThumbsDown, color: 'border-red-100 hover:bg-red-50' },
]

export function resolveApiOutcome(
  ui: UiOutcome,
  interesadoFollowUp: InteresadoFollowUp | null
): string | null {
  if (ui === 'info_enviada') return 'interesado'
  if (ui === 'interesado' && interesadoFollowUp === 'reunion') return 'reunion_agendada'
  if (ui === 'interesado') return interesadoFollowUp ? 'interesado' : null
  return ui
}

interface CampaignCallOutcomesProps {
  lead: {
    id: number
    nombre: string
    first_name?: string | null
    empresa?: string | null
    email?: string | null
  }
  leadPhone: string | null
  leadPhoneDisplay: string | null
  persona?: ComercialPersona
  presentationUrl?: string | null
  gmailSender?: string | null
  saving: boolean
  saved: boolean
  saveError: string
  onSave: (payload: {
    resultado: string
    notas: string
    duracionSec: number | null
    callbackAt: string
    whatsappSent: boolean
    emailSent: boolean
  }) => void
}

export default function CampaignCallOutcomes({
  lead,
  leadPhone,
  leadPhoneDisplay,
  persona = DEFAULT_CEO_PERSONA,
  presentationUrl,
  gmailSender,
  saving,
  saved,
  saveError,
  onSave,
}: CampaignCallOutcomesProps) {
  const [resultado, setResultado] = useState<UiOutcome | null>(null)
  const [interesadoFollowUp, setInteresadoFollowUp] = useState<InteresadoFollowUp | null>(null)
  const [notas, setNotas] = useState('')
  const callTimer = useCallTimer()
  const [callbackAt, setCallbackAt] = useState('')
  const [bookingIso, setBookingIso] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [whatsappSent, setWhatsappSent] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [calBooked, setCalBooked] = useState(false)
  const [calBookingSummary, setCalBookingSummary] = useState('')
  const [manualMeetingMode, setManualMeetingMode] = useState(false)
  const [localError, setLocalError] = useState('')
  const [messageEdited, setMessageEdited] = useState(false)

  const updateCallbackMessage = (datetimeLocal: string) => {
    if (!messageEdited) {
      setContactMessage(
        callbackConfirmTemplate(lead, formatCallbackWhen(datetimeLocal), persona)
      )
    }
  }

  const selectOutcome = (id: UiOutcome) => {
    setResultado(id)
    setInteresadoFollowUp(null)
    setCalBooked(false)
    setCalBookingSummary('')
    setManualMeetingMode(false)
    setCallbackAt('')
    setBookingIso('')
    setMessageEdited(false)
    setWhatsappSent(false)
    setEmailSent(false)
    setLocalError('')
    if (id === 'info_enviada') setContactMessage(contactTemplate('info', lead, persona, presentationUrl))
    else if (id === 'interesado') setContactMessage(contactTemplate('interesado', lead, persona, presentationUrl))
    else if (id === 'no_interesado') setContactMessage(contactTemplate('no_interesado', lead, persona))
    else if (id === 'llamar_tarde') {
      const defaultAt = defaultCallbackDatetime()
      setCallbackAt(defaultAt)
      setContactMessage(callbackConfirmTemplate(lead, formatCallbackWhen(defaultAt), persona))
    } else setContactMessage('')
  }

  const handleCallbackChange = (datetimeLocal: string) => {
    setCallbackAt(datetimeLocal)
    updateCallbackMessage(datetimeLocal)
  }

  const handleCalBooked = (booking: CalBookingPayload) => {
    setBookingIso(booking.startTime)
    setCallbackAt(toDatetimeLocalValue(booking.startTime))
    setCalBooked(true)
    const when = new Date(booking.startTime).toLocaleString('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    setCalBookingSummary(booking.title ? `${booking.title} · ${when}` : when)
    setNotas((prev) => {
      const block = `Reunión Cal.com: ${when}`
      return prev.trim() ? `${prev.trim()}\n${block}` : block
    })
  }

  const handleManualMeetingChange = (datetimeLocal: string) => {
    setCallbackAt(datetimeLocal)
    if (!datetimeLocal) {
      setBookingIso('')
      setCalBooked(false)
      setCalBookingSummary('')
      return
    }
    const iso = new Date(datetimeLocal).toISOString()
    setBookingIso(iso)
    setCalBooked(true)
    const when = formatCallbackWhen(datetimeLocal)
    setCalBookingSummary(`Registro manual · ${when}`)
    setNotas((prev) => {
      const block = `Reunión Cal.com: ${when} (registro manual)`
      const cleaned = prev
        .split('\n')
        .filter((line) => !line.trim().startsWith('Reunión Cal.com:'))
        .join('\n')
        .trim()
      return cleaned ? `${cleaned}\n${block}` : block
    })
  }

  const handleWhatsApp = () => {
    const ok = openWhatsApp(leadPhone, contactMessage)
    if (!ok) {
      setLocalError('No hay teléfono válido para WhatsApp.')
      return
    }
    setWhatsappSent(true)
    setLocalError('')
  }

  const handleEmail = () => {
    const ok = openGmailCompose(
      lead.email,
      `Información Buffalo AI · ${lead.empresa || lead.nombre}`,
      contactMessage,
      gmailSender
    )
    if (!ok) {
      setLocalError('Este lead no tiene email.')
      return
    }
    setEmailSent(true)
    setLocalError('')
  }

  const submit = () => {
    if (!resultado) return
    const apiOutcome = resolveApiOutcome(resultado, interesadoFollowUp)
    if (!apiOutcome) {
      setLocalError('Indica si quiere reunión o solo info.')
      return
    }
    if (resultado === 'llamar_tarde' && !callbackAt) {
      setLocalError('Indica cuándo volver a llamar.')
      return
    }
    if (resultado === 'interesado' && interesadoFollowUp === 'reunion' && !bookingIso) {
      setLocalError(
        manualMeetingMode
          ? 'Indica el día y la hora de la reunión que ya agendaste.'
          : 'Agenda la reunión en Cal.com o registra la fecha manualmente.'
      )
      return
    }
    onSave({
      resultado: apiOutcome,
      notas,
      duracionSec: callTimer.getDurationSec(),
      callbackAt: resultado === 'interesado' && interesadoFollowUp === 'reunion' ? bookingIso : callbackAt,
      whatsappSent,
      emailSent,
    })
  }

  const quickSinRespuesta = () => {
    onSave({
      resultado: 'sin_respuesta',
      notas: '',
      duracionSec: callTimer.getDurationSec(),
      callbackAt: '',
      whatsappSent: false,
      emailSent: false,
    })
  }

  const hasPhone = Boolean(leadPhone && normalizeWhatsAppPhone(leadPhone))
  const hasEmail = Boolean(lead.email?.trim())
  const displayError = localError || saveError

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <CallTimerBar
        running={callTimer.running}
        elapsedSec={callTimer.elapsedSec}
        onStart={callTimer.start}
        onReset={callTimer.reset}
      />

      <div>
        <h2 className="text-base font-semibold text-gray-900">Resultado</h2>
        <p className="text-xs text-gray-500 mt-0.5">Elige y guarda — pasa al siguiente lead al instante</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {OUTCOMES.map((o) => {
          const Icon = o.icon
          const active = resultado === o.id
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => selectOutcome(o.id)}
              className={`flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl text-xs font-semibold border-2 transition-all ${
                active
                  ? 'bg-gray-900 text-white border-gray-900 scale-[1.02]'
                  : `bg-white text-gray-700 ${o.color}`
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-center leading-tight">{o.label}</span>
            </button>
          )
        })}
      </div>

      {/* Contacto rápido — solo cuando hay mensaje informativo */}
      {resultado && resultado !== 'llamar_tarde' && resultado !== 'sin_respuesta' && (
      <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Enviar info (WhatsApp o Gmail)
        </p>
        <Textarea
          rows={3}
          value={contactMessage}
          onChange={(e) => {
            setMessageEdited(true)
            setContactMessage(e.target.value)
          }}
          className="rounded-lg resize-none text-sm bg-white"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg gap-1.5 border-green-200 text-green-900"
            disabled={!hasPhone || !contactMessage.trim()}
            onClick={handleWhatsApp}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
            {whatsappSent && <Check className="h-3 w-3" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg gap-1.5"
            disabled={!hasEmail || !contactMessage.trim()}
            onClick={handleEmail}
          >
            <Mail className="h-3.5 w-3.5" />
            Gmail
            {emailSent && <Check className="h-3 w-3" />}
          </Button>
        </div>
        {leadPhoneDisplay && (
          <p className="text-[11px] text-gray-400 tabular-nums">{leadPhoneDisplay}</p>
        )}
      </div>
      )}

      {resultado === 'sin_respuesta' && (
        <Button
          className="w-full rounded-xl h-11 bg-gray-900 hover:bg-gray-800"
          disabled={saving || saved}
          onClick={quickSinRespuesta}
        >
          Guardar y siguiente →
        </Button>
      )}

      {resultado && resultado !== 'sin_respuesta' && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          {resultado === 'llamar_tarde' && (
            <div className="space-y-4">
              <CallbackScheduler value={callbackAt} onChange={handleCallbackChange} />

              <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                  Confirmar por WhatsApp o email
                </p>
                <p className="text-[11px] text-amber-900/80">
                  El mensaje incluye la hora acordada. Envíalo y guarda.
                </p>
                <Textarea
                  rows={5}
                  value={contactMessage}
                  onChange={(e) => {
                    setMessageEdited(true)
                    setContactMessage(e.target.value)
                  }}
                  className="rounded-lg resize-none text-sm bg-white"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg gap-1.5 border-green-200 text-green-900 bg-white"
                    disabled={!hasPhone || !contactMessage.trim() || !callbackAt}
                    onClick={handleWhatsApp}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                    {whatsappSent && <Check className="h-3 w-3" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg gap-1.5 bg-white"
                    disabled={!hasEmail || !contactMessage.trim() || !callbackAt}
                    onClick={() => {
                      const ok = openGmailCompose(
                        lead.email,
                        `Confirmación llamada · ${lead.empresa || lead.nombre}`,
                        contactMessage,
                        gmailSender
                      )
                      if (!ok) {
                        setLocalError('Este lead no tiene email.')
                        return
                      }
                      setEmailSent(true)
                      setLocalError('')
                    }}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Gmail
                    {emailSent && <Check className="h-3 w-3" />}
                  </Button>
                </div>
                {leadPhoneDisplay && (
                  <p className="text-[11px] text-gray-500 tabular-nums">{leadPhoneDisplay}</p>
                )}
              </div>
            </div>
          )}

          {resultado === 'info_enviada' && (
            <p className="text-sm text-gray-600">
              Envía la info por email o WhatsApp arriba y guarda. El lead quedará como{' '}
              <strong>info enviada</strong>.
            </p>
          )}

          {resultado === 'interesado' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-800">¿Quiere reunión?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setInteresadoFollowUp('reunion')
                    setCalBooked(false)
                    setManualMeetingMode(false)
                    setBookingIso('')
                    setCallbackAt('')
                    setCalBookingSummary('')
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border ${
                    interesadoFollowUp === 'reunion'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-gray-200'
                  }`}
                >
                  <CalendarPlus className="h-4 w-4" />
                  Sí, reunión
                </button>
                <button
                  type="button"
                  onClick={() => setInteresadoFollowUp('sin_reunion')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border ${
                    interesadoFollowUp === 'sin_reunion'
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'border-gray-200'
                  }`}
                >
                  <XCircle className="h-4 w-4" />
                  Solo info
                </button>
              </div>
              {interesadoFollowUp === 'reunion' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setManualMeetingMode(false)
                        setCalBooked(false)
                        setBookingIso('')
                        setCallbackAt('')
                        setCalBookingSummary('')
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${
                        !manualMeetingMode
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      Agendar en Cal.com
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setManualMeetingMode(true)
                        setCalBooked(false)
                        setBookingIso('')
                        setCallbackAt('')
                        setCalBookingSummary('')
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${
                        manualMeetingMode
                          ? 'bg-amber-50 text-amber-950 border-amber-200'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      Ya agendé · registrar fecha
                    </button>
                  </div>

                  {manualMeetingMode ? (
                    <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 space-y-2">
                      <p className="text-xs text-amber-950">
                        Si ya pediste la reunión en Cal.com pero no pulsaste guardar, indica aquí el
                        día y la hora y guarda.
                      </p>
                      <CallbackScheduler value={callbackAt} onChange={handleManualMeetingChange} />
                    </div>
                  ) : (
                    <CalComMeetingEmbed
                      key={`cal-${lead.id}`}
                      leadName={lead.nombre}
                      leadEmail={lead.email}
                      onBooked={handleCalBooked}
                    />
                  )}

                  {calBooked && bookingIso && (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-center gap-2">
                        <Check className="h-3.5 w-3.5" />
                        {calBookingSummary || 'Reunión lista para guardar'}
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                        Si cierra la venta: <strong>{formatEur(commissionPerClosedSale())}</strong> de
                        comisión (10% de 3.500 €)
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {resultado === 'no_interesado' && (
            <p className="text-sm text-gray-600">Opcional: mensaje de cierre por WhatsApp arriba.</p>
          )}

          <Textarea
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Nota de la llamada (se guarda en el lead y en el pipeline)..."
            className="rounded-xl resize-none text-sm"
          />
        </div>
      )}

      {displayError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {displayError}
        </div>
      )}

      {resultado && resultado !== 'sin_respuesta' && (
        <Button
          className="w-full rounded-xl h-11"
          disabled={saving || saved}
          onClick={submit}
        >
          {saved ? (
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4" /> Guardado
            </span>
          ) : saving ? (
            'Guardando...'
          ) : (
            'Guardar y siguiente →'
          )}
        </Button>
      )}
    </div>
  )
}