import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertCircle, Send } from 'lucide-react'
import {
  flattenCustomFieldsForDisplay,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/tickets/ingest'

interface TicketDetail {
  id: string
  project_name: string
  title: string
  description: string | null
  priority: string
  status: string
  reporter_name: string | null
  reporter_email: string | null
  custom_fields: Record<string, unknown>
  created_at: string
}

interface TicketUpdate {
  id: string
  author_name: string | null
  message: string
  status: string | null
  is_from_client: boolean
  created_at: string
}

const priorityClass: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-50 text-blue-800',
  high: 'bg-amber-50 text-amber-800',
  critical: 'bg-red-50 text-red-800',
}

const statusClass: Record<string, string> = {
  open: 'bg-sky-50 text-sky-800',
  in_progress: 'bg-violet-50 text-violet-800',
  resolved: 'bg-emerald-50 text-emerald-800',
  closed: 'bg-gray-100 text-gray-600',
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
  const [updates, setUpdates] = useState<TicketUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reply, setReply] = useState('')
  const [replyStatus, setReplyStatus] = useState('')
  const [sending, setSending] = useState(false)
  const [notifyWarning, setNotifyWarning] = useState('')

  const load = useCallback(async () => {
    if (!id || typeof id !== 'string') return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/tickets/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setTicket(data.ticket)
      setUpdates(data.updates || [])
      setReplyStatus(data.ticket?.status || '')
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

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })

  const sendReply = async () => {
    if (!ticket || !reply.trim()) return
    setSending(true)
    setError('')
    setNotifyWarning('')
    try {
      const body: { message: string; status?: string } = { message: reply.trim() }
      if (replyStatus && replyStatus !== ticket.status) body.status = replyStatus

      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al enviar')

      setTicket((t) => (t ? { ...t, status: data.status || t.status } : t))
      setUpdates(data.updates || [])
      setReply('')

      if (data.notify && !data.notify.sent && data.notify.error) {
        setNotifyWarning(data.notify.error)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar')
    } finally {
      setSending(false)
    }
  }

  const setStatusOnly = async (status: string) => {
    if (!ticket || ticket.status === status) return
    setSending(true)
    setError('')
    setNotifyWarning('')
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setTicket((t) => (t ? { ...t, status } : t))
      setReplyStatus(status)
      if (data.notify && !data.notify.sent && data.notify.error) {
        setNotifyWarning(data.notify.error)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setSending(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-5 max-w-3xl mx-auto">
        <div className="flex items-start gap-3">
          <Link
            href="/tickets"
            className="inline-flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 shrink-0 mt-1"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-gray-900 leading-snug">
              {ticket?.title || 'Cargando…'}
            </h1>
            {ticket && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-sm text-gray-500">{ticket.project_name}</span>
                <Badge className={priorityClass[ticket.priority] || priorityClass.medium}>
                  {PRIORITY_LABELS[ticket.priority as TicketPriority] || ticket.priority}
                </Badge>
                <Badge className={statusClass[ticket.status] || statusClass.open}>
                  {STATUS_LABELS[ticket.status as TicketStatus] || ticket.status}
                </Badge>
              </div>
            )}
          </div>
        </div>

        {loading && <div className="py-12 text-center text-sm text-gray-400">Cargando…</div>}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {notifyWarning && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Respuesta guardada, pero no se pudo notificar al cliente: {notifyWarning}
          </div>
        )}

        {ticket && (
          <>
            <div className="flex flex-wrap gap-2">
              {(['open', 'in_progress', 'resolved', 'closed'] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={ticket.status === s ? 'default' : 'outline'}
                  disabled={sending || ticket.status === s}
                  onClick={() => setStatusOnly(s)}
                  className={ticket.status === s ? 'bg-gray-900' : ''}
                >
                  {STATUS_LABELS[s]}
                </Button>
              ))}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
              <div className="p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-gray-900">
                    {ticket.reporter_name || ticket.reporter_email || 'Cliente'}
                  </p>
                  <span className="text-xs text-gray-400">{fmtDate(ticket.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {ticket.description || 'Sin descripción'}
                </p>
              </div>

              {fieldRows.length > 0 && (
                <div className="px-4 py-3 bg-gray-50/50">
                  <p className="text-xs font-medium text-gray-500 mb-2">Datos del cliente</p>
                  <div className="flex flex-wrap gap-2">
                    {fieldRows.map((row) => (
                      <span
                        key={row.key}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs"
                      >
                        <span className="text-gray-400">{row.key}:</span>
                        <span className="text-gray-800 max-w-[200px] truncate">{row.value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {updates.map((u) => (
                <div key={u.id} className={`p-4 ${u.is_from_client ? '' : 'bg-sky-50/40'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-gray-900">
                      {u.author_name || (u.is_from_client ? 'Cliente' : 'Buffalo')}
                    </p>
                    <span className="text-xs text-gray-400">{fmtDate(u.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{u.message}</p>
                  {u.status && (
                    <p className="text-xs text-gray-400 mt-1">
                      Estado → {STATUS_LABELS[u.status as TicketStatus] || u.status}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <p className="text-sm font-medium text-gray-900">Responder al cliente</p>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={4}
                placeholder="Escribe tu respuesta…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y min-h-[100px]"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <select
                  value={replyStatus}
                  onChange={(e) => setReplyStatus(e.target.value)}
                  className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700"
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <Button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="bg-gray-900 hover:bg-gray-800"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Enviar respuesta
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
