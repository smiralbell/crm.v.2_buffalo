import { useEffect, useState } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  userId: number
  userName: string
  roleLabel: string
}

/** Móvil con el que esta persona habla con el agente de WhatsApp (solo sus proyectos y su módulo). */
export default function UserWhatsAppAgentCard({ userId, userName }: Props) {
  const [saved, setSaved] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/users/${userId}/whatsapp`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!alive) return
        if (!ok) throw new Error(d.error || 'No se pudo cargar')
        setSaved(d.phone ?? null)
        setValue(d.phone ?? '')
        setEnabled(Boolean(d.agent_enabled))
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [userId])

  const save = async (phone: string) => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/users/${userId}/whatsapp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar')
      setSaved(d.phone ?? null)
      setValue(d.phone ?? '')
      setNotice(d.phone ? 'Guardado. Ya puede escribir al agente desde ese móvil.' : 'Quitado. Ese móvil ya no tiene acceso al agente.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const dirty = value.replace(/\D/g, '') !== (saved ?? '')

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <MessageCircle className="h-4 w-4 text-gray-500" />
        Agente de WhatsApp
        {saved && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            Con acceso
          </span>
        )}
      </h2>
      <p className="mt-0.5 max-w-xl text-xs text-gray-500">
        {userName} podrá escribir al agente desde este móvil. De momento solo tiene acceso a su módulo de Tareas: sus
        tareas sueltas y las de sus proyectos. Nada de facturación, proyectos ni otros usuarios. El agente lo reconoce
        por el número, no por lo que diga en el chat.
      </p>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando…
        </div>
      ) : (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save(value)
          }}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="34600111222 (con prefijo)"
            inputMode="tel"
            className="h-10 w-full rounded-xl sm:w-64"
          />
          <Button type="submit" className="h-10 rounded-xl" disabled={saving || !dirty || !value.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
          {saved && (
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={saving}
              onClick={() => {
                if (window.confirm(`¿Quitar el acceso de ${userName} al agente de WhatsApp?`)) void save('')
              }}
            >
              Quitar acceso
            </Button>
          )}
        </form>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {notice && !error && <p className="mt-2 text-xs text-emerald-700">{notice}</p>}
      {!loading && !enabled && (
        <p className="mt-2 text-xs text-amber-700">
          El agente de WhatsApp no está activado en este servidor: el móvil se guarda, pero no contestará hasta que se
          active.
        </p>
      )}
    </div>
  )
}
