import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Settings = { whatsapp_phone: string | null; notify_whatsapp: boolean; briefing_whatsapp: boolean }

/** Número de WhatsApp del usuario + avisos urgentes + briefing diario (solo admin). */
export default function UserWhatsappSettings({ userId, isComercial }: { userId: number; isComercial: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/users/${userId}/whatsapp`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'No disponible')
        setSettings(data)
        setPhone(data.whatsapp_phone || '')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No disponible'))
  }, [userId])

  const save = async (patch: Partial<Settings>) => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/users/${userId}/whatsapp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      setSettings(data)
      setPhone(data.whatsapp_phone || '')
      setMessage('Guardado')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  if (!settings && !error) return null

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">WhatsApp y avisos</h2>
        <p className="mt-1 text-xs text-gray-500">
          Los avisos llegan siempre a la campana del CRM. Aquí decides si los urgentes también le llegan por WhatsApp.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {settings && (
        <>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void save({ whatsapp_phone: phone.trim() || null })
            }}
          >
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor="wa_phone">Número de WhatsApp</Label>
              <Input
                id="wa_phone"
                inputMode="tel"
                placeholder="+34 600 000 000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" className="rounded-xl" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar número'}
            </Button>
          </form>
          <label className="flex items-start gap-2.5 text-sm text-gray-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={settings.notify_whatsapp}
              disabled={saving || !settings.whatsapp_phone}
              onChange={(e) => void save({ notify_whatsapp: e.target.checked })}
            />
            <span>Avisos urgentes por WhatsApp (tickets críticos, fallos del sistema…)</span>
          </label>
          {isComercial && (
            <label className="flex items-start gap-2.5 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={settings.briefing_whatsapp}
                disabled={saving || !settings.whatsapp_phone}
                onChange={(e) => void save({ briefing_whatsapp: e.target.checked })}
              />
              <span>Briefing cada mañana laborable: devoluciones de llamada y reuniones por confirmar</span>
            </label>
          )}
          {message && <p className="text-xs text-emerald-600">{message}</p>}
        </>
      )}
    </div>
  )
}
