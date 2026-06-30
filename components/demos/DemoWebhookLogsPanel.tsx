import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, ScrollText, ChevronDown, ChevronUp } from 'lucide-react'
import type { DemoWebhookLogRow } from '@/lib/demos/webhook-log'

const levelClass: Record<string, string> = {
  info: 'bg-sky-50 text-sky-800',
  warn: 'bg-amber-50 text-amber-800',
  error: 'bg-red-50 text-red-800',
  success: 'bg-emerald-50 text-emerald-800',
}

const stepLabel: Record<string, string> = {
  received: 'Recibido',
  auth_failed: 'Auth fallida',
  auth_skipped: 'Sin secret',
  parse: 'Parseo',
  parsed: 'Parseado OK',
  phone: 'Teléfono',
  phone_match: 'Match alt.',
  no_demo: 'Sin demo',
  demo_found: 'Demo encontrada',
  openrouter: 'OpenRouter',
  wasender_send: 'Enviando',
  done: 'Completado',
  error: 'Error',
  handler_error: 'Error handler',
  empty_body: 'Body vacío',
}

export default function DemoWebhookLogsPanel() {
  const [open, setOpen] = useState(true)
  const [logs, setLogs] = useState<DemoWebhookLogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/demos/webhook-logs?limit=60')
      const data = await res.json()
      if (res.ok) setLogs(data.logs || [])
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    load()
  }, [open, load])

  useEffect(() => {
    if (!open || !autoRefresh) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [open, autoRefresh, load])

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

  return (
    <Card className="border border-gray-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-gray-500" />
          <CardTitle className="text-base font-semibold">Logs del webhook</CardTitle>
          {autoRefresh && open && (
            <span className="text-xs text-gray-400">· actualiza cada 5s</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setAutoRefresh((v) => !v)}
          >
            Auto {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="pt-0">
          {logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-8 text-center text-sm text-gray-500">
              <p>No hay logs todavía.</p>
              <p className="mt-1 text-xs">
                Envía un WhatsApp de prueba. Si no aparece nada aquí, Wasender no está llegando al
                CRM (revisa URL del webhook y secret).
              </p>
              <p className="mt-3 font-mono text-xs text-gray-400">
                POST /api/demos/webhook
              </p>
            </div>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-gray-400">{fmtTime(log.created_at)}</span>
                    <Badge className={levelClass[log.level] || 'bg-gray-100 text-gray-700'}>
                      {log.level}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {stepLabel[log.step] || log.step}
                    </Badge>
                    {log.event && (
                      <span className="font-mono text-xs text-violet-600">{log.event}</span>
                    )}
                    {log.phone && (
                      <span className="font-mono text-xs text-gray-600">{log.phone}</span>
                    )}
                  </div>
                  <p className="mt-1 text-gray-800">{log.message}</p>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-gray-500 underline hover:text-gray-700"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      {expandedId === log.id ? 'Ocultar detalle' : 'Ver detalle'}
                    </button>
                  )}
                  {expandedId === log.id && log.details && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-gray-50 p-2 font-mono text-[11px] text-gray-600">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
