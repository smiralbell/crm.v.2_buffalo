import { useState, useEffect } from 'react'
import { Mail, RefreshCw, Filter, Clock, User, Send, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface WebhookLog {
  id: number
  event_type: string
  email: string | null
  campaign_id: string | null
  campaign_name: string | null
  status: string | null
  created_at: string
}

interface WebhookResponse {
  logs: WebhookLog[]
  total: number
  limit: number
  offset: number
}

export default function EmailOutreachTab() {
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filterEvent, setFilterEvent] = useState('')
  const [filterEmail, setFilterEmail] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const LIMIT = 50

  const loadLogs = async (p = 1) => {
    setLoading(true)
    const params = new URLSearchParams({
      limit: String(LIMIT),
      offset: String((p - 1) * LIMIT),
      event_type: filterEvent,
      email: filterEmail,
    })
    const res = await fetch(`/api/webhooks/instantly/logs?${params}`)
    if (res.ok) {
      const d: WebhookResponse = await res.json()
      setLogs(d.logs)
      setTotal(d.total)
      setPage(p)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadLogs(1)
  }, [filterEvent, filterEmail])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(() => loadLogs(page), 5000)
    return () => clearInterval(timer)
  }, [autoRefresh, page])

  const pages = Math.ceil(total / LIMIT)

  const getEventIcon = (evt: string) => {
    switch (evt) {
      case 'email_sent': return <Send className="h-4 w-4 text-gray-600" />
      case 'bounce': return <XCircle className="h-4 w-4 text-red-600" />
      case 'reply': return <Mail className="h-4 w-4 text-green-600" />
      case 'campaign_created': return <CheckCircle2 className="h-4 w-4 text-blue-600" />
      default: return <AlertCircle className="h-4 w-4 text-gray-400" />
    }
  }

  const getEventLabel = (evt: string) => {
    return evt.replace('_', ' ').toUpperCase()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-gray-700" />
          <h2 className="text-lg font-bold text-gray-900">Email Outreach (Instantly)</h2>
          <span className="text-sm text-gray-500">({total} eventos)</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-actualizar
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadLogs(page)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Filtrar por tipo de evento (ej: email_sent, bounce, reply)"
          value={filterEvent}
          onChange={e => setFilterEvent(e.target.value)}
          className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <input
          type="email"
          placeholder="Filtrar por email"
          value={filterEmail}
          onChange={e => setFilterEmail(e.target.value)}
          className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
      </div>

      {/* Logs Table */}
      {logs.length === 0 && !loading ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <Mail className="h-8 w-8 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">Sin eventos aún. Waiting for webhooks from Instantly...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Campaña</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getEventIcon(log.event_type)}
                        <span className="text-xs font-medium text-gray-900">{getEventLabel(log.event_type)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-sm text-gray-700 truncate">{log.email || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-gray-500 truncate">{log.campaign_name || log.campaign_id || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-700 font-medium">
                        {log.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(log.created_at).toLocaleString('es-ES')}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500">{total} eventos en total</p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => loadLogs(page - 1)}
                >
                  ←
                </Button>
                <span className="text-xs text-gray-500 px-2">{page} / {pages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => loadLogs(page + 1)}
                >
                  →
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
