import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, Ticket, User, Mail, Calendar, Copy, Check,
  AlertCircle, Code2, Layers,
} from 'lucide-react'
import {
  flattenCustomFieldsForDisplay,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/tickets/ingest'

interface TicketDetail {
  id: string
  project_id: string
  project_name: string
  config_ref: string | null
  title: string
  description: string | null
  priority: string
  status: string
  reporter_name: string | null
  reporter_email: string | null
  source: string
  external_id: string | null
  payload: Record<string, unknown>
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

const priorityClass: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-50 text-blue-800',
  high: 'bg-amber-50 text-amber-800',
  critical: 'bg-red-50 text-red-800',
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function TicketDetailPage() {
  const router = useRouter()
  const { id } = router.query

  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<'ref' | 'url' | null>(null)
  const [savingStatus, setSavingStatus] = useState(false)

  const load = useCallback(async () => {
    if (!id || typeof id !== 'string') return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/tickets/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setTicket(data.ticket)
      setWebhookUrl(data.webhook_url || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (router.isReady) load()
  }, [router.isReady, load])

  const fieldRows = useMemo(() => {
    if (!ticket) return []
    return flattenCustomFieldsForDisplay(ticket.custom_fields || {})
  }, [ticket])

  const copy = async (text: string, which: 'ref' | 'url') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* ignore */ }
  }

  const updateStatus = async (status: string) => {
    if (!ticket) return
    setSavingStatus(true)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setTicket((t) => (t ? { ...t, status } : t))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setSavingStatus(false)
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('es-ES', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <Link
            href="/tickets"
            className="inline-flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Ticket</p>
            <h1 className="text-xl font-semibold text-gray-900 truncate">
              {ticket?.title || 'Cargando…'}
            </h1>
          </div>
        </div>

        {loading && <div className="py-12 text-center text-sm text-gray-400">Cargando…</div>}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {ticket && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={priorityClass[ticket.priority] || priorityClass.medium}>
                {PRIORITY_LABELS[ticket.priority as TicketPriority] || ticket.priority}
              </Badge>
              <Badge variant="secondary">{STATUS_LABELS[ticket.status as TicketStatus] || ticket.status}</Badge>
              {ticket.external_id && (
                <span className="text-xs font-mono text-gray-400">#{ticket.external_id}</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {(['open', 'in_progress', 'resolved', 'closed'] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={ticket.status === s ? 'default' : 'outline'}
                  disabled={savingStatus || ticket.status === s}
                  onClick={() => updateStatus(s)}
                  className={ticket.status === s ? 'bg-gray-900' : ''}
                >
                  {STATUS_LABELS[s]}
                </Button>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-gray-400" />
                    Detalle
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {ticket.description && (
                    <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
                  )}
                  <dl className="space-y-2">
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-400">Proyecto</dt>
                      <dd className="font-medium text-gray-900 text-right">{ticket.project_name}</dd>
                    </div>
                    {ticket.config_ref && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-400">Referencia</dt>
                        <dd className="font-mono text-xs text-gray-700">{ticket.config_ref}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-400 flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Recibido</dt>
                      <dd className="text-gray-900">{fmtDate(ticket.created_at)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-400">Origen</dt>
                      <dd className="text-gray-900">{ticket.source}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card className="border border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    Reportado por
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {ticket.reporter_name && (
                    <p className="font-medium text-gray-900">{ticket.reporter_name}</p>
                  )}
                  {ticket.reporter_email && (
                    <p className="flex items-center gap-1.5 text-gray-600">
                      <Mail className="h-3.5 w-3.5" />
                      <a href={`mailto:${ticket.reporter_email}`} className="hover:underline">
                        {ticket.reporter_email}
                      </a>
                    </p>
                  )}
                  {!ticket.reporter_name && !ticket.reporter_email && (
                    <p className="text-gray-400">Sin datos del reportador</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-gray-400" />
                  Campos del cliente
                  <span className="text-xs font-normal text-gray-400">(dinámicos)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {fieldRows.length === 0 ? (
                  <p className="text-sm text-gray-400">No se enviaron campos adicionales en `fields`.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-gray-500">
                          <th className="text-left font-medium px-4 py-2.5 w-1/3">Campo</th>
                          <th className="text-left font-medium px-4 py-2.5">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fieldRows.map((row) => (
                          <tr key={row.key} className="border-b border-gray-50 last:border-0">
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{row.key}</td>
                            <td className="px-4 py-2.5 text-gray-900 break-all">{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-gray-400" />
                  Integración webhook
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="text-gray-500 text-xs">
                  Todos los proyectos usan la misma URL. Este ticket pertenece al proyecto indicado en{' '}
                  <code className="text-gray-700">project_ref</code>.
                </p>
                <div>
                  <p className="text-xs text-gray-400 mb-1">URL (única para todos)</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg border bg-gray-50 px-3 py-2 text-xs break-all">
                      {webhookUrl}
                    </code>
                    <Button type="button" variant="outline" size="icon" onClick={() => copy(webhookUrl, 'url')}>
                      {copied === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">project_ref de este proyecto</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg border bg-gray-50 px-3 py-2 text-xs break-all font-mono">
                      {ticket.config_ref || ticket.project_id}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => copy(ticket.config_ref || ticket.project_id, 'ref')}
                    >
                      {copied === 'ref' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Guía para desarrolladores: <code>docs/TICKETS_WEBHOOK.md</code>
                </p>
              </CardContent>
            </Card>

            <details className="rounded-xl border border-gray-200 bg-white">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-gray-600">
                Ver payload JSON completo
              </summary>
              <pre className="px-5 pb-5 text-xs text-gray-700 overflow-x-auto font-mono">
                {JSON.stringify(ticket.payload, null, 2)}
              </pre>
            </details>
          </>
        )}
      </div>
    </Layout>
  )
}
