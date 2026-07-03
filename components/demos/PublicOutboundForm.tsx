import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PublicFormButton } from '@/components/demos/PublicFormShell'
import { brandingInputStyle } from '@/lib/demos/form-branding'
import type { OutboundFormBrandingRef, OutboundFormFieldRef } from '@/lib/demos/types'

type Props = {
  token: string
  fields: OutboundFormFieldRef[]
  branding: OutboundFormBrandingRef
  disabled?: boolean
}

function emptyValues(fields: OutboundFormFieldRef[]): Record<string, string> {
  const v: Record<string, string> = {}
  for (const f of fields) v[f.key] = ''
  return v
}

export default function PublicOutboundForm({
  token,
  fields,
  branding,
  disabled,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => emptyValues(fields))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const inputStyle = brandingInputStyle(branding)

  useEffect(() => {
    setValues(emptyValues(fields))
    setError('')
    setSuccess('')
  }, [fields, token])

  const setField = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (disabled || submitting) return

    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/formulario/${token}/llamar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ variables: values }),
      })
      const data = await res.json()
      if (!res.ok) {
        const hint = data.hint ? ` ${data.hint}` : ''
        throw new Error(`${data.error || 'No se pudo iniciar la llamada'}${hint}`)
      }

      setSuccess(
        data.call_id
          ? `¡Listo! Estamos llamando al ${data.numero_destino}.`
          : `Llamada iniciada correctamente.`
      )
      setValues(emptyValues(fields))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar')
    } finally {
      setSubmitting(false)
    }
  }

  if (fields.length === 0) {
    return (
      <p className="text-sm opacity-80">Este formulario no tiene campos configurados todavía.</p>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4" style={{ color: branding.color_text }}>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const isLong = field.key === 'notas'

          return (
            <div key={field.key} className={isLong ? 'sm:col-span-2 space-y-1.5' : 'space-y-1.5'}>
              <Label style={{ color: branding.color_text }}>
                {field.label}
                {field.required && <span className="text-red-500"> *</span>}
              </Label>
              {isLong ? (
                <Textarea
                  value={values[field.key] ?? ''}
                  onChange={(e) => setField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="min-h-[80px] rounded-xl border"
                  style={inputStyle}
                  disabled={disabled || submitting}
                />
              ) : (
                <Input
                  type={field.key === 'email' ? 'email' : 'text'}
                  value={values[field.key] ?? ''}
                  onChange={(e) => setField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className={`rounded-xl border${field.key === 'telefono' ? ' font-mono' : ''}`}
                  style={inputStyle}
                  disabled={disabled || submitting}
                />
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      )}

      <PublicFormButton type="submit" disabled={disabled || submitting} branding={branding}>
        {submitting ? 'Enviando…' : 'Enviar y recibir llamada'}
      </PublicFormButton>
    </form>
  )
}
