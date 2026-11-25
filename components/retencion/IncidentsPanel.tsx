import { useCallback, useEffect, useState } from 'react'
import { Download, AlertTriangle, CheckCircle2, Copy, Check, ChevronDown, Trash2 } from 'lucide-react'
import { parseIncidentText } from '@/lib/retencion/incident-parse'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Stats = { open: number; solved: number; deleted: number; occurrences: number; max_occurrences: number }

type Incident = {
  id: string
  error_text: string
  status: 'open' | 'solved' | 'deleted'
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
  const [webhookToken, setWebhookToken] = useState('')
  const [clientId, setClientId] = useState(proyectoId)
  const [markdown, setMarkdown] = useState('')
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [copied, setCopied] = useState<'id' | 'url' | 'token' | 'env' | null>(null)
  const [solving, setSolving] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [showSolved, setShowSolved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/incidents`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar incidencias')
      setWebhookUrl(data.webhook_url || '')
      setWebhookToken(data.webhook_token || '')
      setClientId(data.client_id || proyectoId)
      setMarkdown(data.markdown || '')
      setIncidents(data.incidents || [])
      setStats(data.stats || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [proyectoId])

  useEffect(() => {
    void load()
  }, [load])

  const envBlock = [
    `BUFFALO_INCIDENTS_WEBHOOK_URL=${webhookUrl}`,
    `BUFFALO_INCIDENTS_WEBHOOK_TOKEN=${webhookToken}`,
    `BUFFALO_CLIENT_ID=${clientId}`,
  ].join('\n')

  const copy = async (text: string, which: 'id' | 'url' | 'token' | 'env') => {
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

  const webhookDialog = (
    <>
      <Dialog open={webhookOpen} onOpenChange={onWebhookOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[28px] border-2 border-white sm:rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Conexión de incidencias · {proyectoName}</DialogTitle>
            <DialogDescription>
              Lo que necesita el panel de este cliente para avisarnos de errores de producción. Su sistema envía{' '}
              <code className="text-xs">{'{ error, client_id }'}</code> a este endpoint; el{' '}
              <code className="text-xs">client_id</code> es el id de este proyecto, para que no caiga en otro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <section className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Variables para el panel del cliente
              </span>
              <pre className="overflow-x-auto rounded-xl bg-gray-950 px-4 py-3 font-mono text-xs leading-relaxed text-gray-100">
                {envBlock}
              </pre>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-400">Pégalas en el .env o en EasyPanel de su panel.</p>
                <button
                  type="button"
                  onClick={() => copy(envBlock, 'env')}
                  disabled={!webhookUrl}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  {copied === 'env' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  Copiar todo
                </button>
              </div>
            </section>
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
              <label className="block sm:col-span-2">
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
              <label className="block sm:col-span-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Token (Authorization Bearer)
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800">
                    {webhookToken || '…'}
                  </code>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                    onClick={() => copy(webhookToken, 'token')}
                    aria-label="Copiar token"
                    disabled={!webhookToken}
                  >
                    {copied === 'token' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-400">
                  Es el mismo token para todos los proyectos. Viene de{' '}
                  <code className="text-[10px]">RETENCION_INCIDENTS_TOKEN</code> (o{' '}
                  <code className="text-[10px]">INGEST_TOKEN</code>) en EasyPanel.
                </p>
              </label>
              <label className="block sm:col-span-2">
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
              Dale al developer: URL + token + este <code className="text-[10px]">client_id</code>. El mismo error no
              vuelve a avisarnos por correo/Telegram mientras esté abierto. Al marcarlo como solucionado se reabre la
              barrera. Errores distintos sí avisan.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )

  const remove = async (inc: Incident) => {
    if (!window.confirm('¿Eliminar esta incidencia? Dejará de verse en la lista (cuenta como eliminada).')) return
    setSolving(inc.id)
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/incidents/${inc.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || 'No se pudo eliminar')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar')
    } finally {
      setSolving(null)
    }
  }

  const open = incidents.filter((i) => i.status === 'open')
  const solved = incidents.filter((i) => i.status === 'solved')
  const kpis = [
    { label: 'Abiertas ahora', value: stats?.open ?? open.length, tone: (stats?.open ?? open.length) > 0 ? 'text-amber-700' : 'text-gray-900' },
    { label: 'Solucionadas', value: stats?.solved ?? solved.length, tone: 'text-emerald-700' },
    { label: 'Eliminadas', value: stats?.deleted ?? 0, tone: 'text-gray-900' },
    { label: 'Avisos recibidos', value: stats?.occurrences ?? 0, tone: 'text-gray-900', hint: stats?.max_occurrences ? `la que más: ${stats.max_occurrences} veces` : undefined },
  ]
  const busy = (id: string) => solving === id

  return (
    <div className="space-y-5">
      {webhookDialog}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Cargando incidencias…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{k.label}</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${k.tone}`}>{k.value}</p>
                {k.hint && <p className="text-[11px] text-gray-400">{k.hint}</p>}
              </div>
            ))}
          </div>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Abiertas ({open.length})</h3>
            {open.length === 0 && (
              <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                Ninguna incidencia abierta.
              </p>
            )}
            {open.map((inc) => (
              <IncidentCard key={inc.id} inc={inc}>
                <button
                  type="button"
                  disabled={busy(inc.id)}
                  onClick={() => solve(inc.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {busy(inc.id) ? 'Guardando…' : 'Marcar solucionada'}
                </button>
                <button
                  type="button"
                  disabled={busy(inc.id)}
                  onClick={() => remove(inc)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-red-200 hover:text-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              </IncidentCard>
            ))}
          </section>

          <section className="space-y-3">
            <label className="inline-flex cursor-pointer items-center gap-2.5 select-none">
              <button
                type="button"
                role="switch"
                aria-checked={showSolved}
                onClick={() => setShowSolved((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${showSolved ? 'bg-gray-900' : 'bg-gray-300'}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${showSolved ? 'translate-x-4' : 'translate-x-0.5'}`}
                />
              </button>
              <span className="text-sm font-semibold text-gray-800">Ver solucionadas ({solved.length})</span>
            </label>
            {showSolved &&
              (solved.length === 0 ? (
                <p className="text-sm text-gray-400">Todavía no hay incidencias solucionadas.</p>
              ) : (
                solved.map((inc) => (
                  <IncidentCard key={inc.id} inc={inc} solved>
                    <button
                      type="button"
                      disabled={busy(inc.id)}
                      onClick={() => remove(inc)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-red-200 hover:text-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  </IncidentCard>
                ))
              ))}
          </section>
        </>
      )}
    </div>
  )
}

/** Una incidencia legible: título, ruta, veces, fechas; el detalle técnico se despliega. */
function IncidentCard({ inc, solved = false, children }: { inc: Incident; solved?: boolean; children: React.ReactNode }) {
  const [openDetail, setOpenDetail] = useState(false)
  const p = parseIncidentText(inc.error_text)
  const hasDetail = p.stack.length > 0 || p.context.length > 0 || !!p.contextRaw
  return (
    <article
      className={`rounded-2xl border p-4 ${solved ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50/40'}`}
    >
      <div className="flex items-start gap-3">
        {solved ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {p.tag && (
              <span className="rounded-md bg-gray-900/5 px-1.5 py-0.5 font-mono text-[11px] text-gray-700">{p.tag}</span>
            )}
            {p.environment && (
              <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] text-gray-500 ring-1 ring-gray-200">
                {p.environment}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                inc.occurrences > 1 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
              }`}
              title="Veces que ha llegado esta incidencia"
            >
              ×{inc.occurrences}
            </span>
          </div>
          <p className={`text-sm font-medium leading-snug ${solved ? 'text-gray-700' : 'text-gray-900'}`}>{p.title}</p>
          <p className="text-xs text-gray-500">
            Primera vez {fmt(inc.created_at)} · última {fmt(inc.last_seen_at)}
            {solved ? ` · solucionada ${fmt(inc.solved_at)}` : ' · cada día abierta nos avisa por Gmail y Telegram'}
          </p>

          {p.context.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.context.map((c) => (
                <span key={c.key} className="max-w-full truncate rounded-lg bg-white px-2 py-1 text-[11px] text-gray-600 ring-1 ring-gray-200">
                  <span className="text-gray-400">{c.key}:</span> {c.value}
                </span>
              ))}
            </div>
          )}

          {hasDetail && (
            <button
              type="button"
              onClick={() => setOpenDetail((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openDetail ? 'rotate-180' : ''}`} />
              {openDetail ? 'Ocultar detalle técnico' : 'Ver detalle técnico'}
            </button>
          )}
          {openDetail && (
            <pre className="max-h-72 overflow-auto rounded-xl bg-gray-950 p-3 text-[11px] leading-relaxed text-gray-100 whitespace-pre-wrap break-all">
              {[...p.stack, ...(p.contextRaw ? ['', `Contexto: ${p.contextRaw}`] : [])].join('\n')}
            </pre>
          )}

          <div className="flex flex-wrap gap-2 pt-1">{children}</div>
        </div>
      </div>
    </article>
  )
}
