import { useCallback, useEffect, useMemo, useState } from 'react'
import { Mail, Send, FlaskConical } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatSpanishDate } from '@/lib/invoices/recurring-dates'
import {
  DEFAULT_EMAIL_BODY,
  DEFAULT_EMAIL_SUBJECT,
  EMAIL_PLACEHOLDERS,
  RECURRING_DAILY_TIME,
  EXAMPLE_EMAIL_VARS,
  emailSendDate,
  fillTemplate,
} from '@/lib/invoices/recurring-email-template'
import type { RecurringEmailState, InvoiceEmailSendRow } from '@/lib/invoices/recurring-email'
import { cn } from '@/lib/utils'

interface Props {
  recurringId: string
  name: string
  /** YYYY-MM-DD de la próxima factura, para decir cuándo saldrá el email */
  nextIssueDate: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Tras guardar o enviar, para refrescar la lista */
  onChanged?: () => void
}

type Form = {
  email_enabled: boolean
  email_to: string
  email_cc: string
  email_reply_to: string
  email_subject: string
  email_body: string
  email_send_day: string
}

const STATUS_LABEL: Record<InvoiceEmailSendRow['status'], string> = {
  pending: 'Programado',
  sending: 'Enviando',
  sent: 'Enviado',
  failed: 'Error',
  cancelled: 'Cancelado',
}

const STATUS_CLASS: Record<InvoiceEmailSendRow['status'], string> = {
  pending: 'bg-blue-50 text-blue-700',
  sending: 'bg-blue-50 text-blue-700',
  sent: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const KIND_LABEL: Record<InvoiceEmailSendRow['kind'], string> = {
  auto: 'Automático',
  manual: 'A mano',
  test: 'Prueba',
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toForm(state: RecurringEmailState): Form {
  const s = state.settings
  return {
    email_enabled: s.email_enabled,
    email_to: s.email_to || '',
    email_cc: s.email_cc || '',
    email_reply_to: s.email_reply_to || '',
    email_subject: s.email_subject || DEFAULT_EMAIL_SUBJECT,
    email_body: s.email_body || DEFAULT_EMAIL_BODY,
    email_send_day: s.email_send_day ? String(s.email_send_day) : '',
  }
}

/** Configurar el envío por email de una factura recurrente. */
export default function RecurringEmailDialog({ recurringId, name, nextIssueDate, open, onOpenChange, onChanged }: Props) {
  const [state, setState] = useState<RecurringEmailState | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | 'now' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/invoices/recurring/${recurringId}/email`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar')
      setState(data)
      setForm(toForm(data))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar')
    } finally {
      setLoading(false)
    }
  }, [recurringId])

  useEffect(() => {
    if (open) {
      setNotice('')
      void load()
    }
  }, [open, load])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))

  const preview = useMemo(() => {
    if (!form) return null
    return {
      subject: fillTemplate(form.email_subject || DEFAULT_EMAIL_SUBJECT, EXAMPLE_EMAIL_VARS),
      body: fillTemplate(form.email_body || DEFAULT_EMAIL_BODY, EXAMPLE_EMAIL_VARS),
    }
  }, [form])

  const nextSend = useMemo(() => {
    if (!form || !nextIssueDate) return null
    const day = form.email_send_day ? Number(form.email_send_day) : null
    return { issue: nextIssueDate, send: emailSendDate(nextIssueDate, day) }
  }, [form, nextIssueDate])

  const recipients = form?.email_to.trim() || state?.client_email || ''

  const save = async (override?: Partial<Form>) => {
    if (!form) return false
    const f = { ...form, ...override }
    setBusy('save')
    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/invoices/recurring/${recurringId}/email`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_enabled: f.email_enabled,
          email_to: f.email_to,
          email_cc: f.email_cc,
          email_reply_to: f.email_reply_to,
          // Si se deja la plantilla por defecto, no se guarda: así una mejora futura del texto le llega
          email_subject: f.email_subject.trim() === DEFAULT_EMAIL_SUBJECT ? null : f.email_subject,
          email_body: f.email_body.trim() === DEFAULT_EMAIL_BODY.trim() ? null : f.email_body,
          email_send_day: f.email_send_day ? Number(f.email_send_day) : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      setState(data)
      setForm(toForm(data))
      setNotice(f.email_enabled ? 'Guardado. Las próximas facturas se enviarán solas.' : 'Guardado. El envío automático está apagado.')
      onChanged?.()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
      return false
    } finally {
      setBusy(null)
    }
  }

  const send = async (mode: 'test' | 'now') => {
    if (!state) return
    if (mode === 'now') {
      const inv = state.last_invoice
      if (!inv) return
      if (!window.confirm(`¿Mandar ahora la factura ${inv.invoice_number} a ${recipients || 'el cliente'}?`)) return
    }
    // Primero se guarda lo que haya cambiado, para enviar con el asunto y el mensaje que se ven
    if (!(await save())) return
    setBusy(mode)
    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/invoices/recurring/${recurringId}/email-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar')
      setNotice(
        mode === 'test'
          ? `Prueba enviada a ${data.to.join(', ')}.`
          : `Factura ${data.invoice_number ?? ''} enviada a ${data.to.join(', ')}.`
      )
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Envío por email · {name}
          </DialogTitle>
          <DialogDescription>
            Cada mes, cuando se crea la factura, se manda al cliente con el PDF adjunto el día que elijas, a las {RECURRING_DAILY_TIME}.
          </DialogDescription>
        </DialogHeader>

        {loading && !form ? (
          <div className="py-10 text-center text-sm text-gray-500">Cargando…</div>
        ) : form && state ? (
          <div className="space-y-5">
            {!state.smtp.configured && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                El correo del CRM (SMTP) no está configurado: no se podrá enviar nada hasta que lo esté.
              </p>
            )}

            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
                form.email_enabled ? 'border-emerald-300 bg-emerald-50/60' : 'border-gray-200 bg-white'
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 accent-emerald-600"
                checked={form.email_enabled}
                onChange={(e) => set('email_enabled', e.target.checked)}
                disabled={busy !== null}
              />
              <span>
                <span className="block text-sm font-semibold text-gray-900">Enviar automáticamente cada mes</span>
                <span className="block text-xs text-gray-600">
                  {form.email_enabled
                    ? nextSend
                      ? `La próxima factura se crea el ${formatSpanishDate(nextSend.issue)} y se envía el ${formatSpanishDate(nextSend.send)} a las ${RECURRING_DAILY_TIME}.`
                      : `Se enviará cada factura nueva el día elegido, a las ${RECURRING_DAILY_TIME}.`
                    : 'Apagado: las facturas se crean igual, pero no se manda nada. Puedes enviar la última a mano.'}
                </span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="email_to">Para</Label>
                <Input
                  id="email_to"
                  value={form.email_to}
                  onChange={(e) => set('email_to', e.target.value)}
                  placeholder={state.client_email ? `${state.client_email} (email del cliente)` : 'cliente@empresa.com'}
                  disabled={busy !== null}
                />
                <p className="text-xs text-gray-500">Vacío = el email del cliente. Varios, separados por comas.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email_cc">CC</Label>
                <Input
                  id="email_cc"
                  value={form.email_cc}
                  onChange={(e) => set('email_cc', e.target.value)}
                  placeholder="Opcional"
                  disabled={busy !== null}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email_reply_to">Responder a</Label>
                <Input
                  id="email_reply_to"
                  value={form.email_reply_to}
                  onChange={(e) => set('email_reply_to', e.target.value)}
                  placeholder="Opcional: dónde llegan sus respuestas"
                  disabled={busy !== null}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="email_send_day">Día de envío</Label>
                <select
                  id="email_send_day"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.email_send_day}
                  onChange={(e) => set('email_send_day', e.target.value)}
                  disabled={busy !== null}
                >
                  <option value="">El mismo día que se crea (día {state.issue_day})</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={String(d)}>
                      Día {d} de cada mes
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">Sale a las {RECURRING_DAILY_TIME} (hora de Madrid), cuando el CRM revisa las recurrentes.</p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="email_subject">Asunto</Label>
                <Input
                  id="email_subject"
                  value={form.email_subject}
                  onChange={(e) => set('email_subject', e.target.value)}
                  disabled={busy !== null}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="email_body">Mensaje</Label>
                <Textarea
                  id="email_body"
                  rows={8}
                  value={form.email_body}
                  onChange={(e) => set('email_body', e.target.value)}
                  disabled={busy !== null}
                />
                <p className="text-xs text-gray-500">
                  Puedes usar:{' '}
                  {EMAIL_PLACEHOLDERS.map((p, i) => (
                    <span key={p.key} title={p.label}>
                      <code className="rounded bg-gray-100 px-1">{`{${p.key}}`}</code>
                      {i < EMAIL_PLACEHOLDERS.length - 1 ? ' ' : ''}
                    </span>
                  ))}
                  . El PDF de la factura va siempre adjunto.
                </p>
              </div>
            </div>

            {preview && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Vista previa (con datos de ejemplo)</p>
                <p className="font-semibold text-gray-900">{preview.subject}</p>
                <p className="mt-2 whitespace-pre-wrap text-gray-700">{preview.body}</p>
              </div>
            )}

            {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {notice && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => send('test')} disabled={busy !== null || !state.smtp.configured}>
                  <FlaskConical className="mr-2 h-4 w-4" />
                  {busy === 'test' ? 'Enviando…' : 'Enviar prueba a mí'}
                </Button>
                {state.last_invoice && (
                  <Button type="button" variant="outline" onClick={() => send('now')} disabled={busy !== null || !state.smtp.configured}>
                    <Send className="mr-2 h-4 w-4" />
                    {busy === 'now' ? 'Enviando…' : `Enviar ahora ${state.last_invoice.invoice_number}`}
                  </Button>
                )}
              </div>
              <Button type="button" onClick={() => void save()} disabled={busy !== null}>
                {busy === 'save' ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-gray-800">Historial de envíos</p>
              {state.sends.length === 0 ? (
                <p className="text-sm text-gray-500">Todavía no se ha enviado nada.</p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {state.sends.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-gray-900">{s.invoice_number ?? `#${s.invoice_id}`}</span>
                        <span className="ml-2 text-xs text-gray-500">{KIND_LABEL[s.kind]}</span>
                        <div className="truncate text-xs text-gray-500">
                          {s.status === 'sent'
                            ? `${fmtDateTime(s.sent_at)} · ${s.sent_to ?? ''}`
                            : s.status === 'pending'
                              ? `Sale el ${fmtDateTime(s.scheduled_at)}`
                              : s.error || fmtDateTime(s.scheduled_at)}
                        </div>
                      </div>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CLASS[s.status])}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
