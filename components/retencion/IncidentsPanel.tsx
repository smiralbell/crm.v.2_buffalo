import { useCallback, useEffect, useState } from 'react'
import { Download, AlertTriangle, CheckCircle2, Copy, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Incident = {
  id: string
  error_text: string
  status: 'open' | 'solved'
  occurrences: number
  last_seen_at: string
  created_at: string
  solved_at: string | null
}

function fmt(d: string | null | undefined): string {
  if (!d) return '—'
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? '—' : t.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

export default function IncidentsPanel({
  proyectoId,
  proyectoName,
  webhookOpen,
  onWebhookOpenChange,
}: {
  proyectoId: string
  proyectoName: string
  webhookOpen: boolean
  onWebhookOpenChange: (open: boolean) => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [clientId, setClientId] = useState(proyectoId)
  const [markdown, setMarkdown] = useState('')
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [copied, setCopied] = useState<'id' | 'url' | null>(null)
  const [solving, setSolving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/incidents`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar incidencias')
      setWebhookUrl(data.webhook_url || '')
      setClientId(data.client_id || proyectoId)
      setMarkdown(data.markdown || '')
      setIncidents(data.incidents || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [proyectoId])

  useEffect(() => {
    void load()
  }, [load])

  const copy = async (text: string, which: 'id' | 'url') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      /* ignore */
    }
  }

  const downloadMd = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `incidencias-${proyectoName.replace(/\s+/g, '-').toLowerCase()}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const solve = async (id: string) => {
    setSolving(id)
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'solved' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo marcar')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar')
    } finally {
      setSolving(null)
    }
  }

  const open = incidents.filter((i) => i.status === 'open')
  const solved = incidents.filter((i) => i.status !== 'open')

  return (
    <div className="space-y-5">
      <Dialog open={webhookOpen} onOpenChange={onWebhookOpenChange}>
        <DialogContent className="max-w-2xl rounded-[28px] border-2 border-white sm:rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Webhook de incidencias</DialogTitle>
            <DialogDescription>
              El developer de este proyecto tiene que enviar <code className="text-xs">{'{ error, client_id }'}</code> a
              este endpoint. El <code className="text-xs">client_id</code> es el id de este proyecto, para que no caiga en
              otro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={downloadMd}
                disabled={!markdown}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Descargar markdown
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Endpoint</span>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800">
                    {webhookUrl || '…'}
                  </code>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                    onClick={() => copy(webhookUrl, 'url')}
                    aria-label="Copiar URL"
                  >
                    {copied === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  client_id (este proyecto)
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800">
                    {clientId}
                  </code>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                    onClick={() => copy(clientId, 'id')}
                    aria-label="Copiar client_id"
                  >
                    {copied === 'id' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            </div>
            <p className="text-xs text-gray-400">
              El mismo error no vuelve a avisarnos por correo/Telegram mientras esté abierto. Al marcarlo como
              solucionado se reabre la barrera. Errores distintos sí avisan.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Cargando incidencias…</div>
      ) : (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Abiertas ({open.length})</h3>
            {open.length === 0 && (
              <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                Ninguna incidencia abierta.
              </p>
            )}
            {open.map((inc) => (
              <article key={inc.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="min-w-0">
                      <p className="whitespace-pre-wrap break-words text-sm text-gray-900">{inc.error_text}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {inc.occurrences} vez{inc.occurrences === 1 ? '' : 'es'} · última {fmt(inc.last_seen_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={solving === inc.id}
                    onClick={() => solve(inc.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {solving === inc.id ? 'Marcando…' : 'Marcar solucionado'}
                  </button>
                </div>
              </article>
            ))}
          </section>

          {solved.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Solucionadas</h3>
              {solved.map((inc) => (
                <article key={inc.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{inc.error_text}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {inc.occurrences} vez{inc.occurrences === 1 ? '' : 'es'} · cerrada {fmt(inc.solved_at)}
                  </p>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}
