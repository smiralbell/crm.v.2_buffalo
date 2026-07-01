import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import type { FormPublicAccess, OutboundFormFieldRef } from '@/lib/demos/types'
import { RETELL_OUTBOUND_VAR_KEYS } from '@/lib/demos/outbound-form'
import { Check, Copy, Link2, Lock } from 'lucide-react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  demoId: number
  initialFields: OutboundFormFieldRef[]
  initialAccess: FormPublicAccess
  onSaved: (fields: OutboundFormFieldRef[], access: FormPublicAccess) => void
}

type Step = 'access' | 'fields'

export default function DemoOutboundFormConfigDialog({
  open,
  onOpenChange,
  demoId,
  initialFields,
  initialAccess,
  onSaved,
}: Props) {
  const [step, setStep] = useState<Step>('access')
  const [fields, setFields] = useState<OutboundFormFieldRef[]>(initialFields)
  const [access, setAccess] = useState<FormPublicAccess>(initialAccess)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep('access')
    setFields(initialFields)
    setAccess(initialAccess)
    setPassword('')
    setPasswordConfirm('')
    setError('')
    setCopied(false)
  }, [open, initialFields, initialAccess])

  const updateField = (key: string, patch: Partial<OutboundFormFieldRef>) => {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)))
  }

  const copyLink = async () => {
    if (!access.public_url) return
    try {
      await navigator.clipboard.writeText(access.public_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('No se pudo copiar el enlace')
    }
  }

  const saveAccess = async () => {
    if (password) {
      if (password !== passwordConfirm) {
        setError('Las contraseñas no coinciden')
        return
      }
    } else if (!access.has_password) {
      setError('Define una contraseña para proteger el formulario')
      return
    } else {
      setStep('fields')
      return
    }

    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = {}
      if (password) body.password = password

      const res = await fetch(`/api/demos/${demoId}/formulario`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')

      const nextAccess: FormPublicAccess = {
        public_token: data.public_token,
        public_url: data.public_url,
        has_password: data.has_password,
      }
      setAccess(nextAccess)
      setPassword('')
      setPasswordConfirm('')
      onSaved(fields, nextAccess)
      setStep('fields')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const regenerateLink = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/demos/${demoId}/formulario`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate_token: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo regenerar')
      const nextAccess: FormPublicAccess = {
        public_token: data.public_token,
        public_url: data.public_url,
        has_password: data.has_password,
      }
      setAccess(nextAccess)
      onSaved(fields, nextAccess)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const saveFields = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/demos/${demoId}/formulario`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      onSaved(data.fields, access)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar formulario outbound</DialogTitle>
          <DialogDescription>
            {step === 'access'
              ? 'Protege el formulario con contraseña y comparte el enlace público con tu cliente.'
              : `Personaliza los campos. Variables Retell: ${RETELL_OUTBOUND_VAR_KEYS.map((k) => `{{${k}}}`).join(', ')}`}
          </DialogDescription>
        </DialogHeader>

        {step === 'access' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-violet-900">
                <Link2 className="h-4 w-4" />
                Enlace público para el cliente
              </div>
              {access.public_url ? (
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={access.public_url}
                    className="rounded-xl font-mono text-xs bg-white"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 rounded-xl"
                    onClick={copyLink}
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-violet-800">
                  Guarda una contraseña para generar el enlace automáticamente.
                </p>
              )}
              {access.public_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs text-violet-700"
                  onClick={regenerateLink}
                  disabled={saving}
                >
                  Regenerar enlace (invalida el anterior)
                </Button>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Lock className="h-4 w-4" />
                Contraseña de acceso
                {access.has_password && (
                  <span className="text-xs font-normal text-emerald-700">(configurada)</span>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{access.has_password ? 'Nueva contraseña (opcional)' : 'Contraseña'}</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 4 caracteres"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar contraseña</Label>
                <Input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <p className="text-xs text-gray-500">
                Comparte el enlace y esta contraseña con tu cliente. Solo verá el formulario, sin
                acceso al CRM.
              </p>
            </div>
          </div>
        )}

        {step === 'fields' && (
          <div className="space-y-4">
            {fields.map((field) => (
              <div key={field.key} className="rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{field.label}</p>
                    <p className="font-mono text-xs text-violet-600">{`{{${field.key}}}`}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={field.enabled}
                      onChange={(e) => updateField(field.key, { enabled: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    Visible
                  </label>
                </div>
                {field.enabled && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Etiqueta</Label>
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(field.key, { label: e.target.value })}
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Placeholder</Label>
                      <Input
                        value={field.placeholder ?? ''}
                        onChange={(e) => updateField(field.key, { placeholder: e.target.value })}
                        className="rounded-xl"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateField(field.key, { required: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      Campo obligatorio
                    </label>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'fields' && (
            <Button
              variant="outline"
              onClick={() => setStep('access')}
              className="rounded-xl"
              disabled={saving}
            >
              Volver a acceso
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancelar
          </Button>
          {step === 'access' ? (
            <Button onClick={saveAccess} disabled={saving} className="rounded-xl">
              {saving ? 'Guardando…' : access.has_password && !password ? 'Continuar a campos' : 'Guardar y continuar'}
            </Button>
          ) : (
            <Button onClick={saveFields} disabled={saving} className="rounded-xl">
              {saving ? 'Guardando…' : 'Guardar campos'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
