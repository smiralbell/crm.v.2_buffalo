import { useEffect, useState } from 'react'
import { Loader2, Plus, Save, X } from 'lucide-react'
import ws from '@/components/retencion/WatchSystemMap.module.css'
import s from './qa.module.css'
import type { WhatsappConfig } from '@/lib/retencion/qa/types'

/** Nodo «Enviar por WhatsApp»: activar y elegir los móviles (con prefijo de país). */
export default function WhatsappEditor({
  value,
  isAdmin,
  saving,
  hint,
  onSave,
}: {
  value: WhatsappConfig
  isAdmin: boolean
  saving: boolean
  hint: string
  onSave: (v: WhatsappConfig) => void
}) {
  const [enabled, setEnabled] = useState(value.enabled)
  const [to, setTo] = useState<string[]>(value.to)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState('')
  const key = JSON.stringify(value)
  useEffect(() => {
    setEnabled(value.enabled)
    setTo(value.to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const add = () => {
    const d = draft.replace(/\D/g, '')
    if (d.length < 9 || d.length > 15) {
      setErr('Escribe el móvil con el prefijo del país, por ejemplo 34600111222.')
      return
    }
    if (!to.includes(d)) setTo([...to, d])
    setDraft('')
    setErr('')
  }

  const dirty = enabled !== value.enabled || JSON.stringify(to) !== JSON.stringify(value.to)

  return (
    <>
      <p className="text-sm text-gray-600">{hint}</p>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-800">
        {enabled ? 'Activo' : 'Apagado'}
        <input type="checkbox" className="h-4 w-4" checked={enabled} disabled={!isAdmin} onChange={() => setEnabled((v) => !v)} />
      </label>
      <div className={ws.field}>
        <label>Móviles</label>
        <div className="mt-1.5 flex gap-2">
          <input
            value={draft}
            disabled={!isAdmin}
            inputMode="tel"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            placeholder="34600111222"
            style={{ marginTop: 0 }}
          />
          <button type="button" className={ws.hudBtn} disabled={!isAdmin || !draft.trim()} onClick={add} aria-label="Añadir móvil">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      {err && <p className="text-[13px] text-red-700">{err}</p>}
      {to.length > 0 ? (
        <div className={s.list}>
          {to.map((p) => (
            <div key={p} className={s.li}>
              <span className="flex items-center justify-between gap-2">
                <span className="tabular-nums">+{p}</span>
                {isAdmin && (
                  <button type="button" onClick={() => setTo(to.filter((x) => x !== p))} aria-label={`Quitar ${p}`} className="text-gray-400 hover:text-gray-700">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-gray-500">Sin móviles todavía.</p>
      )}
      {isAdmin && (
        <button
          type="button"
          disabled={saving || !dirty || (enabled && !to.length)}
          onClick={() => onSave({ enabled, to })}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </button>
      )}
      <p className="text-xs text-gray-400">Sale desde el número de WhatsApp del CRM (Evolution API).</p>
    </>
  )
}
