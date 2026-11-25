import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Mail, Plus, RefreshCw, X } from 'lucide-react'

type Data = { emails: string[]; last_import: { imported_at: string; found: number } | null }

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'ahora mismo'
  if (mins < 60) return `hace ${mins} min`
  const h = Math.round(mins / 60)
  if (h < 24) return `hace ${h} h`
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

/**
 * Correos del cliente: el principal y otros desde los que escribe (el de la empresa,
 * un socio…). Con todos ellos se trae el historial completo de Gmail al contexto.
 * La primera vez que se abre la ficha se importa solo.
 */
export default function LeadCorreos({
  leadId,
  mainEmail,
  onImported,
}: {
  leadId: number
  mainEmail: string | null
  /** Se llama cuando entran correos nuevos, para refrescar el mapa y el resumen */
  onImported: () => void
}) {
  const [data, setData] = useState<Data | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<'import' | 'add' | string | null>(null)
  const [msg, setMsg] = useState('')
  const autoDone = useRef(false)

  const run = useCallback(
    async (init: RequestInit, kind: string) => {
      setBusy(kind)
      setMsg('')
      try {
        const res = await fetch(`/api/leads/${leadId}/correos`, {
          ...init,
          headers: { 'Content-Type': 'application/json' },
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((d as { error?: string }).error || 'No se pudo completar')
        const next = d as Data & { result?: { inserted: number; mailboxes: number; errors: string[] } }
        setData((prev) => ({ emails: next.emails, last_import: next.last_import ?? prev?.last_import ?? null }))
        if (next.result) {
          const r = next.result
          if (!r.mailboxes) setMsg('No hay ningún buzón de Gmail conectado con permiso de lectura.')
          else setMsg(r.inserted ? `${r.inserted} correo${r.inserted === 1 ? '' : 's'} nuevo${r.inserted === 1 ? '' : 's'} en el contexto.` : 'No había correos nuevos.')
          if (r.inserted) onImported()
        }
        return true
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'No se pudo completar')
        return false
      } finally {
        setBusy(null)
      }
    },
    [leadId, onImported]
  )

  useEffect(() => {
    autoDone.current = false
    fetch(`/api/leads/${leadId}/correos`)
      .then(async (r) => (r.ok ? ((await r.json()) as Data) : null))
      .then((d) => {
        if (!d) return
        setData(d)
        // Nunca se ha buscado su historial: se trae solo, una vez
        if (!d.last_import && !autoDone.current && mainEmail) {
          autoDone.current = true
          void run({ method: 'POST', body: JSON.stringify({ importar: true }) }, 'import')
        }
      })
      .catch(() => undefined)
  }, [leadId, mainEmail, run])

  const add = async () => {
    const email = draft.trim()
    if (!email) return
    if (await run({ method: 'POST', body: JSON.stringify({ email }) }, 'add')) {
      setDraft('')
      setAdding(false)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Mail className="h-4 w-4" />
          Correos del cliente
        </h2>
        <button
          type="button"
          onClick={() => void run({ method: 'POST', body: JSON.stringify({ importar: true }) }, 'import')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
          title="Busca en Gmail todos los correos con estas direcciones, sin límite de fechas"
        >
          {busy === 'import' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Buscar en Gmail
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {mainEmail && (
          <li className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
            <span className="min-w-0 truncate text-sm text-gray-900">{mainEmail}</span>
            <span className="shrink-0 text-[11px] text-gray-400">principal</span>
          </li>
        )}
        {(data?.emails || []).map((e) => (
          <li key={e} className="group flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
            <span className="min-w-0 truncate text-sm text-gray-900">{e}</span>
            <button
              type="button"
              onClick={() => void run({ method: 'DELETE', body: JSON.stringify({ email: e }) }, `del-${e}`)}
              disabled={busy !== null}
              className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 hover:text-red-600 group-hover:opacity-100 disabled:opacity-40"
              aria-label={`Quitar ${e}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            type="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="otro@empresa.com"
            className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-gray-400"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy !== null || !draft.trim()}
            className="h-9 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {busy === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Añadir'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          <Plus className="h-3.5 w-3.5" /> Añadir otro correo
        </button>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
        {busy === 'import'
          ? 'Buscando en Gmail todo el historial con este cliente…'
          : msg ||
            (data?.last_import
              ? `Última búsqueda ${ago(data.last_import.imported_at)}. Los correos nuevos entran solos.`
              : 'Si escribe desde otra cuenta, añádela y se traerán también sus correos.')}
      </p>
    </section>
  )
}
