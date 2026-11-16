import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, FileText, FlaskConical, Loader2, Mail, Paperclip, Send, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatSpanishDate } from '@/lib/invoices/recurring-dates'
import {
  DEFAULT_EMAIL_BODY,
  DEFAULT_EMAIL_SUBJECT,
  EMAIL_PLACEHOLDERS,
  EXAMPLE_EMAIL_VARS,
  RECURRING_DAILY_TIME,
  emailSendDate,
  fillTemplate,
} from '@/lib/invoices/recurring-email-template'
import type { RecurringEmailState, InvoiceEmailSendRow } from '@/lib/invoices/recurring-email'
import { cn } from '@/lib/utils'

interface Props {
  recurringId: string
  /** Cliente (o nombre de la plantilla) */
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

type Tab = 'config' | 'history'

const STATUS_LABEL: Record<InvoiceEmailSendRow['status'], string> = {
  pending: 'Programado',
  sending: 'Enviando',
  sent: 'Enviado',
  failed: 'Error',
  cancelled: 'Cancelado',
}

const STATUS_CLASS: Record<InvoiceEmailSendRow['status'], string> = {
  pending: 'bg-blue-50 text-blue-700 ring-blue-100',
  sending: 'bg-blue-50 text-blue-700 ring-blue-100',
  sent: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  failed: 'bg-red-50 text-red-700 ring-red-100',
  cancelled: 'bg-gray-50 text-gray-500 ring-gray-100',
}

const KIND_LABEL: Record<InvoiceEmailSendRow['kind'], string> = {
  auto: 'Automático',
  manual: 'Enviado a mano',
  test: 'Prueba',
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
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

function Section({ icon: Icon, title, children }: { icon: typeof Mail; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {children}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-400">{hint}</span>}
    </label>
  )
}

/** Configurar el envío por email de una factura recurrente. */
export default function RecurringEmailDialog({ recurringId, name, nextIssueDate, open, onOpenChange, onChanged }: Props) {
  const [state, setState] = useState<RecurringEmailState | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [tab, setTab] = useState<Tab>('config')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | 'now' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const lastFocus = useRef<'subject' | 'body'>('body')

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
      setTab('config')
      void load()
    }
  }, [open, load])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))

  /** Mete {hueco} donde está el cursor (asunto o mensaje, el último que se tocó). */
  const insertPlaceholder = (key: string) => {
    if (!form) return
    const token = `{${key}}`
    const target = lastFocus.current
    const el = target === 'subject' ? subjectRef.current : bodyRef.current
    const field = target === 'subject' ? 'email_subject' : 'email_body'
    const value = form[field]
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    set(field, value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const exampleVars = useMemo(
    () => ({
      ...EXAMPLE_EMAIL_VARS,
      cliente: name || EXAMPLE_EMAIL_VARS.cliente,
      numero: state?.last_invoice?.invoice_number || EXAMPLE_EMAIL_VARS.numero,
    }),
    [name, state]
  )

  const preview = useMemo(() => {
    if (!form) return null
    return {
      subject: fillTemplate(form.email_subject || DEFAULT_EMAIL_SUBJECT, exampleVars),
      body: fillTemplate(form.email_body || DEFAULT_EMAIL_BODY, exampleVars),
    }
  }, [form, exampleVars])

  const nextSend = useMemo(() => {
    if (!form || !nextIssueDate) return null
    const day = form.email_send_day ? Number(form.email_send_day) : null
    return { issue: nextIssueDate, send: emailSendDate(nextIssueDate, day) }
  }, [form, nextIssueDate])

  const recipients = form?.email_to.trim() || state?.client_email || ''

  const save = async () => {
    if (!form) return false
    setBusy('save')
    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/invoices/recurring/${recurringId}/email`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_enabled: form.email_enabled,
          email_to: form.email_to,
          email_cc: form.email_cc,
          email_reply_to: form.email_reply_to,
          // La plantilla por defecto no se guarda: así una mejora futura del texto le llega
          email_subject: form.email_subject.trim() === DEFAULT_EMAIL_SUBJECT ? null : form.email_subject,
          email_body: form.email_body.trim() === DEFAULT_EMAIL_BODY.trim() ? null : form.email_body,
          email_send_day: form.email_send_day ? Number(form.email_send_day) : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      setState(data)
      setForm(toForm(data))
      setNotice(form.email_enabled ? 'Guardado. Las próximas facturas se enviarán solas.' : 'Guardado. El envío automático está apagado.')
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
    // Se guarda antes, para enviar con el asunto y el mensaje que se ven
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

  const disabled = busy !== null
  const historyCount = state?.sends.length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden rounded-3xl p-0">
        <div className="border-b border-gray-100 px-6 pb-4 pt-6">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5" />
                Envío por email
              </DialogTitle>
              <DialogDescription className="mt-1 truncate">{name}</DialogDescription>
            </div>
            {form && (
              <button
                type="button"
                role="switch"
                aria-checked={form.email_enabled}
                onClick={() => set('email_enabled', !form.email_enabled)}
                disabled={disabled}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition-colors',
                  form.email_enabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-gray-200 bg-white text-gray-600'
                )}
              >
                <span
                  className={cn(
                    'relative h-5 w-9 rounded-full transition-colors',
                    form.email_enabled ? 'bg-emerald-500' : 'bg-gray-300'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
                      form.email_enabled ? 'left-[18px]' : 'left-0.5'
                    )}
                  />
                </span>
                {form.email_enabled ? 'Envío automático' : 'Envío apagado'}
              </button>
            )}
          </div>
          <div className="mt-4 flex gap-1">
            {(
              [
                { id: 'config', label: 'Configurar' },
                { id: 'history', label: `Historial${historyCount ? ` · ${historyCount}` : ''}` },
              ] as { id: Tab; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === t.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !form ? (
            <div className="flex justify-center py-20 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !form || !state ? (
            error && <p className="m-6 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
          ) : tab === 'history' ? (
            <div className="p-6">
              {state.sends.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 py-14 text-center text-sm text-gray-500">
                  Todavía no se ha enviado nada.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200">
                  {state.sends.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {s.invoice_number ?? `#${s.invoice_id}`}
                          <span className="ml-2 text-xs font-normal text-gray-400">{KIND_LABEL[s.kind]}</span>
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {s.status === 'sent'
                            ? `${fmtDateTime(s.sent_at)} · ${s.sent_to ?? ''}`
                            : s.status === 'pending'
                              ? `Sale el ${fmtDateTime(s.scheduled_at)}`
                              : s.error || fmtDateTime(s.scheduled_at)}
                        </p>
                      </div>
                      <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1', STATUS_CLASS[s.status])}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-7">
                {!state.smtp.configured && (
                  <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    El correo del CRM (SMTP) no está configurado: no se podrá enviar nada hasta que lo esté.
                  </p>
                )}

                <Section icon={CalendarClock} title="Cuándo">
                  <select
                    className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                    value={form.email_send_day}
                    onChange={(e) => set('email_send_day', e.target.value)}
                    disabled={disabled}
                  >
                    <option value="">El mismo día que se crea la factura (día {state.issue_day})</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={String(d)}>
                        El día {d} de cada mes
                      </option>
                    ))}
                  </select>
                  <p
                    className={cn(
                      'rounded-xl px-3 py-2 text-xs',
                      form.email_enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-50 text-gray-500'
                    )}
                  >
                    {form.email_enabled
                      ? nextSend
                        ? `Próximo envío: ${formatSpanishDate(nextSend.send)} a las ${RECURRING_DAILY_TIME} (factura del ${formatSpanishDate(nextSend.issue)}).`
                        : `Cada factura nueva sale el día elegido a las ${RECURRING_DAILY_TIME}.`
                      : 'Envío apagado: la factura se crea igual cada mes, pero no se manda. Actívalo arriba.'}
                  </p>
                </Section>

                <Section icon={Users} title="Para quién">
                  <Field label="Para" hint="Vacío = el email del cliente. Varios, separados por comas.">
                    <Input
                      className="rounded-xl"
                      value={form.email_to}
                      onChange={(e) => set('email_to', e.target.value)}
                      placeholder={state.client_email || 'cliente@empresa.com'}
                      disabled={disabled}
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="CC">
                      <Input
                        className="rounded-xl"
                        value={form.email_cc}
                        onChange={(e) => set('email_cc', e.target.value)}
                        placeholder="Opcional"
                        disabled={disabled}
                      />
                    </Field>
                    <Field label="Responder a">
                      <Input
                        className="rounded-xl"
                        value={form.email_reply_to}
                        onChange={(e) => set('email_reply_to', e.target.value)}
                        placeholder="Opcional"
                        disabled={disabled}
                      />
                    </Field>
                  </div>
                </Section>

                <Section icon={FileText} title="Mensaje">
                  <Field label="Asunto">
                    <Input
                      ref={subjectRef}
                      className="rounded-xl"
                      value={form.email_subject}
                      onFocus={() => (lastFocus.current = 'subject')}
                      onChange={(e) => set('email_subject', e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Texto">
                    <Textarea
                      ref={bodyRef}
                      rows={9}
                      className="rounded-xl leading-relaxed"
                      value={form.email_body}
                      onFocus={() => (lastFocus.current = 'body')}
                      onChange={(e) => set('email_body', e.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-1.5">
                    {EMAIL_PLACEHOLDERS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        title={`${p.label} · p. ej. ${p.example}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertPlaceholder(p.key)}
                        disabled={disabled}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs text-gray-600 transition-colors hover:border-gray-300 hover:bg-white hover:text-gray-900"
                      >
                        {`{${p.key}}`}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">Pulsa un hueco para meterlo donde tengas el cursor. Se rellena con los datos de cada factura.</p>
                </Section>
              </div>

              <div className="lg:sticky lg:top-0 lg:self-start">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Así le llegará</p>
                {preview && (
                  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="space-y-1.5 border-b border-gray-100 bg-gray-50/80 px-5 py-4 text-xs">
                      <p className="text-gray-500">
                        <span className="inline-block w-12 text-gray-400">De</span>
                        <span className="text-gray-800">{state.smtp.from || 'Buffalo CRM'}</span>
                      </p>
                      <p className="truncate text-gray-500">
                        <span className="inline-block w-12 text-gray-400">Para</span>
                        <span className="text-gray-800">{recipients || 'email del cliente'}</span>
                        {form.email_cc.trim() && <span className="text-gray-400"> · CC {form.email_cc.trim()}</span>}
                      </p>
                      <p className="pt-1 text-base font-semibold leading-snug text-gray-900">{preview.subject}</p>
                    </div>
                    <div className="space-y-3 px-5 py-5 text-sm leading-relaxed text-gray-800">
                      {preview.body.split(/\n{2,}/).map((para, i) => (
                        <p key={i} className="whitespace-pre-line">
                          {para}
                        </p>
                      ))}
                    </div>
                    <div className="border-t border-gray-100 px-5 py-4">
                      <div className="inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 py-2 pl-2 pr-4">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500 text-[10px] font-bold text-white">
                          PDF
                        </span>
                        <span className="text-xs">
                          <span className="block font-medium text-gray-800">factura_{exampleVars.numero}.pdf</span>
                          <span className="inline-flex items-center gap-1 text-gray-400">
                            <Paperclip className="h-3 w-3" />
                            Adjunto
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-400">Vista previa con datos de ejemplo; cada mes van los de la factura real.</p>
              </div>
            </div>
          )}
        </div>

        {form && state && (
          <div className="flex flex-col gap-3 border-t border-gray-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-[20px] text-sm">
              {error ? (
                <span className="text-red-600">{error}</span>
              ) : notice ? (
                <span className="text-emerald-700">{notice}</span>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => void send('test')}
                disabled={disabled || !state.smtp.configured}
              >
                {busy === 'test' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
                Probar en mi correo
              </Button>
              {state.last_invoice && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => void send('now')}
                  disabled={disabled || !state.smtp.configured}
                >
                  {busy === 'now' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Enviar {state.last_invoice.invoice_number} ya
                </Button>
              )}
              <Button type="button" className="rounded-xl" onClick={() => void save()} disabled={disabled}>
                {busy === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
