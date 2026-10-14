import { useCallback, useEffect, useState } from 'react'
import { Copy, Link2, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type PortalLink = { id: string; created_by: string | null; created_at: string; last_seen_at: string | null }

const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

/** Enlaces del portal del cliente («Mis tickets») de un proyecto. */
export default function PortalLinksCard({ projectId }: { projectId: string }) {
  const [links, setLinks] = useState<PortalLink[]>([])
  const [newUrl, setNewUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    const res = await fetch(`/api/tickets/portal-links?project_id=${projectId}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return setError(data.error || 'No disponible')
    setLinks(data.links || [])
  }, [projectId])

  useEffect(() => {
    setNewUrl('')
    void load()
  }, [load])

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/tickets/portal-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo crear')
      setNewUrl(data.url)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (linkId: string) => {
    if (!confirm('¿Revocar este enlace? El cliente dejará de poder entrar con él.')) return
    setBusy(true)
    await fetch('/api/tickets/portal-links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, link_id: linkId }),
    }).catch(() => undefined)
    setBusy(false)
    await load()
  }

  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900">Portal del cliente</p>
          <p className="text-xs text-gray-500">El cliente ve sus tickets y abre nuevos sin integrar el webhook.</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={create} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          Crear enlace
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {newUrl && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-xs text-emerald-800">Cópialo ahora: por seguridad no se vuelve a mostrar.</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-xs text-emerald-900">{newUrl}</code>
            <button
              type="button"
              title="Copiar"
              className="shrink-0 p-1.5 text-emerald-700 hover:text-emerald-900"
              onClick={() => void navigator.clipboard?.writeText(newUrl)}
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {links.length > 0 && (
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 text-xs text-gray-600">
              <span>
                Creado {fmt(l.created_at)}
                {l.created_by ? ` por ${l.created_by}` : ''} ·{' '}
                {l.last_seen_at ? `último acceso ${fmt(l.last_seen_at)}` : 'sin usar'}
              </span>
              <button type="button" title="Revocar" className="p-1 text-gray-400 hover:text-red-600" onClick={() => void revoke(l.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
