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
import type {
  FormPublicAccess,
  OutboundFormBrandingRef,
  OutboundFormFieldRef,
} from '@/lib/demos/types'
import { DEFAULT_OUTBOUND_FORM_BRANDING, FORM_FONT_OPTIONS, normalizeOutboundFormBranding, resolveFormFontFamily, type FormFontId } from '@/lib/demos/form-branding'
import { RETELL_OUTBOUND_VAR_KEYS } from '@/lib/demos/outbound-form'
import { Check, Copy, Link2, Lock, Palette } from 'lucide-react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  demoId: number
  demoNombre: string
  initialFields: OutboundFormFieldRef[]
  initialAccess: FormPublicAccess
  initialBranding: OutboundFormBrandingRef
  initialStep?: FormConfigStep
  onSaved: (
    fields: OutboundFormFieldRef[],
    access: FormPublicAccess,
    branding: OutboundFormBrandingRef
  ) => void
}

type Step = 'access' | 'design' | 'fields'

export type FormConfigStep = Step

const STEPS: { id: Step; label: string }[] = [
  { id: 'access', label: 'Acceso' },
  { id: 'design', label: 'Logo y colores' },
  { id: 'fields', label: 'Campos' },
]

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-gray-200"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-xl font-mono text-sm"
          placeholder="#000000"
        />
      </div>
    </div>
  )
}

export default function DemoOutboundFormConfigDialog({
  open,
  onOpenChange,
  demoId,
  demoNombre,
  initialFields,
  initialAccess,
  initialBranding,
  initialStep = 'access',
  onSaved,
}: Props) {
  const [step, setStep] = useState<Step>(initialStep)
  const [fields, setFields] = useState<OutboundFormFieldRef[]>(initialFields)
  const [access, setAccess] = useState<FormPublicAccess>(initialAccess)
  const [branding, setBranding] = useState<OutboundFormBrandingRef>(initialBranding)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep(initialStep)
    setFields(initialFields)
    setAccess(initialAccess)
    setBranding(normalizeOutboundFormBranding(initialBranding))
    setPassword('')
    setPasswordConfirm('')
    setError('')
    setCopied(false)
  }, [open, initialFields, initialAccess, initialBranding, initialStep])

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
      setStep('design')
      return
    }

    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/demos/${demoId}/formulario`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
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
      onSaved(fields, nextAccess, branding)
      setStep('design')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const saveDesign = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/demos/${demoId}/formulario`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branding }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')

      const nextBranding = data.branding as OutboundFormBrandingRef
      setBranding(nextBranding)
      onSaved(fields, access, nextBranding)
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
      onSaved(fields, nextAccess, branding)
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
      onSaved(data.fields, access, branding)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const stepDescription =
    step === 'access'
      ? 'Protege el formulario con contraseña y comparte el enlace público con tu cliente.'
      : step === 'design'
        ? 'Personaliza logo y colores que verá el cliente en el formulario público.'
        : `Campos del formulario. Variables Retell: ${RETELL_OUTBOUND_VAR_KEYS.map((k) => `{{${k}}}`).join(', ')}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar formulario outbound</DialogTitle>
          <DialogDescription>{stepDescription}</DialogDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setStep(s.id)
                  setError('')
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  step === s.id
                    ? 'bg-violet-100 text-violet-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {i + 1}. {s.label}
              </button>
            ))}
          </div>
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
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
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
            </div>
          </div>
        )}

        {step === 'design' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Logo del cliente</Label>
              <Input
                value={branding.logo_url ?? ''}
                onChange={(e) =>
                  setBranding((b) => ({ ...b, logo_url: e.target.value || null }))
                }
                placeholder="https://…/logo.png"
                className="rounded-xl font-mono text-xs"
              />
              <p className="text-xs text-gray-500">
                Pega un enlace directo a la imagen (URL pública, incl. enlaces firmados de
                Google Drive, Cloud Storage, etc.).
              </p>
            </div>

            <ColorField
              label="Color de fondo"
              value={branding.color_primary}
              onChange={(v) => setBranding((b) => ({ ...b, color_primary: v }))}
            />
            <ColorField
              label="Color de texto"
              value={branding.color_text}
              onChange={(v) => setBranding((b) => ({ ...b, color_text: v }))}
            />
            <ColorField
              label="Color de botón"
              value={branding.color_secondary}
              onChange={(v) => setBranding((b) => ({ ...b, color_secondary: v }))}
            />

            <div className="space-y-1.5">
              <Label>Tipografía</Label>
              <select
                value={branding.font_id}
                onChange={(e) =>
                  setBranding((b) => ({ ...b, font_id: e.target.value as FormFontId }))
                }
                className="flex h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              >
                {FORM_FONT_OPTIONS.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>

            <div
              className="rounded-xl border border-gray-200 p-4 text-center"
              style={{
                backgroundColor: branding.color_primary,
                color: branding.color_text,
                fontFamily: resolveFormFontFamily(
                  (branding.font_id || 'system') as FormFontId
                ),
              }}
            >
              <p className="mb-3 text-xs font-medium opacity-70">Vista previa</p>
              {branding.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.logo_url}
                  alt="Logo"
                  className="mx-auto mb-2 max-h-12 max-w-[160px] object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : null}
              <p className="text-sm font-semibold">{demoNombre}</p>
              <div
                className="mx-auto mt-3 max-w-xs rounded-xl border p-3"
                style={{ borderColor: `${branding.color_text}22` }}
              >
                <div
                  className="inline-block rounded-lg px-4 py-2 text-xs font-medium text-white"
                  style={{ backgroundColor: branding.color_secondary }}
                >
                  Botón de ejemplo
                </div>
              </div>
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
          {step === 'design' && (
            <Button
              variant="outline"
              onClick={() => setStep('access')}
              className="rounded-xl"
              disabled={saving}
            >
              Volver
            </Button>
          )}
          {step === 'fields' && (
            <Button
              variant="outline"
              onClick={() => setStep('design')}
              className="rounded-xl"
              disabled={saving}
            >
              Volver
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancelar
          </Button>
          {step === 'access' && (
            <Button onClick={saveAccess} disabled={saving} className="rounded-xl">
              {saving
                ? 'Guardando…'
                : access.has_password && !password
                  ? 'Continuar'
                  : 'Guardar y continuar'}
            </Button>
          )}
          {step === 'design' && (
            <Button onClick={saveDesign} disabled={saving} className="rounded-xl">
              <Palette className="mr-2 h-4 w-4" />
              {saving ? 'Guardando…' : 'Guardar diseño'}
            </Button>
          )}
          {step === 'fields' && (
            <Button onClick={saveFields} disabled={saving} className="rounded-xl">
              {saving ? 'Guardando…' : 'Guardar campos'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
