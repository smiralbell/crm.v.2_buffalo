import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'

export type PersonaContacto = {
  id: number
  nombre: string | null
  empresa: string | null
  email: string | null
  telefono: string | null
  ciudad: string | null
  direccion_fiscal?: string | null
  cif?: string | null
}

type Campo = 'nombre' | 'empresa' | 'email' | 'telefono' | 'ciudad' | 'direccion_fiscal' | 'cif'

const CAMPOS: { key: Campo; label: string; wide?: boolean }[] = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'email', label: 'Email' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'cif', label: 'CIF / NIF' },
  { key: 'direccion_fiscal', label: 'Dirección fiscal', wide: true },
]

function toForm(p: PersonaContacto): Record<Campo, string> {
  return {
    nombre: p.nombre || '',
    empresa: p.empresa || '',
    email: p.email || '',
    telefono: p.telefono || '',
    ciudad: p.ciudad || '',
    cif: p.cif || '',
    direccion_fiscal: p.direccion_fiscal || '',
  }
}

/** Datos de contacto de la persona. Se guardan en la ficha del contacto del CRM. */
export default function PersonaContactoForm({
  leadId,
  persona,
  onSaved,
}: {
  leadId: number
  persona: PersonaContacto
  onSaved: (persona: PersonaContacto) => void
}) {
  const [form, setForm] = useState<Record<Campo, string>>(() => toForm(persona))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  useEffect(() => {
    setForm(toForm(persona))
    setError('')
    setOk(false)
  }, [persona.id])

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(persona))

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/onboarding/personas/${leadId}/contacto`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      onSaved(data.persona)
      setOk(true)
      window.setTimeout(() => setOk(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Contacto</h3>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gray-900 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar contacto
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {CAMPOS.map((c) => (
          <label key={c.key} className={`block space-y-1 ${c.wide ? 'sm:col-span-2' : ''}`}>
            <span className="text-xs font-medium text-gray-500">{c.label}</span>
            <input
              value={form[c.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [c.key]: e.target.value }))}
              className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:border-gray-400"
            />
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {ok && <p className="text-xs text-emerald-700">Contacto guardado</p>}
    </div>
  )
}
