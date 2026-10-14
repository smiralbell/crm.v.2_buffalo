'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ESTADO_LABELS,
  SITE_LABELS,
  type WebFormSubmissionRow,
} from '@/lib/marketing/web-form-submissions.types'
import { Check, ChevronDown, ChevronUp, Copy, Download, ExternalLink, RefreshCw, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const estadoClass: Record<string, string> = {
  pendiente: 'bg-amber-50 text-amber-800 border-amber-200',
  contactado: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  descartado: 'bg-gray-100 text-gray-600 border-gray-200',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function siteLabel(site: string | null) {
  if (!site) return '—'
  return SITE_LABELS[site] || site
}

export default function WebFormSubmissionsPanel({
  period,
  webhookOpen,
  onWebhookOpenChange,
}: {
  period: string
  webhookOpen: boolean
  onWebhookOpenChange: (open: boolean) => void
}) {
  const [rows, setRows] = useState<WebFormSubmissionRow[]>([])
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookToken, setWebhookToken] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [copied, setCopied] = useState<'url' | 'token' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = period ? `?period=${encodeURIComponent(period)}` : ''
      const res = await fetch(`/api/marketing/web-form-submissions${qs}`)
      const data = await res.json()
      if (res.ok) {
        setRows(data.submissions || [])
        setWebhookUrl(data.webhook_url || '')
        setWebhookToken(data.webhook_token || '')
        setMarkdown(data.markdown || '')
      }
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  const copy = async (value: string, key: 'url' | 'token') => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      /* ignore */
    }
  }

  const downloadMd = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'webhook-formularios.md'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const setEstado = async (id: number, estado: 'contactado' | 'descartado' | 'pendiente') => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/marketing/web-form-submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estado }),
      })
      if (res.ok) {
        const data = await res.json()
        setRows((prev) => prev.map((r) => (r.id === id ? data.submission : r)))
      }
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <Dialog open={webhookOpen} onOpenChange={onWebhookOpenChange}>
        <DialogContent className="max-w-2xl rounded-[28px] border-2 border-white sm:rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Webhook de formularios</DialogTitle>
            <DialogDescription>
              Todas las webs envían aquí. JSON con <code className="text-xs">site</code>,{' '}
              <code className="text-xs">page</code> y <code className="text-xs">form</code> (campos libres). Ya no hace
              falta n8n.
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
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Bearer token</span>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800">
                    {webhookToken || '…'}
                  </code>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                    onClick={() => copy(webhookToken, 'token')}
                    aria-label="Copiar token"
                  >
                    {copied === 'token' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            </div>
            <p className="text-xs text-gray-500">
              Dentro de <code className="text-[11px]">form</code> cada web manda los campos que tenga: mensaje, tipo,
              sexo, presupuesto… lo que sea. Nombre / email / teléfono se muestran en la tabla; el resto aparece al
              pulsar Campos.
            </p>
            <pre className="overflow-auto rounded-2xl bg-gray-50 px-3 py-2 text-[11px] text-gray-800">
{`Authorization: Bearer ${webhookToken || '<token>'}
Content-Type: application/json

{
  "site": "agenciabuffalo.es",
  "page": "/contacto",
  "form": {
    "nombre": "Ana López",
    "email": "ana@empresa.com",
    "telefono": "+34600000000",
    "empresa": "Empresa",
    "mensaje": "Quiero una demo",
    "tipo": "Agente de llamadas",
    "sexo": "mujer"
  }
}`}
            </pre>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <Card className="border-gray-200/80">
          <CardContent className="py-12 flex justify-center text-sm text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Cargando formularios…
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="border-gray-200/80">
          <CardContent className="py-10 text-center text-sm text-gray-500">
            Sin formularios en este período. Configura el webhook (botón de arriba) en cada web.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="p-3 whitespace-nowrap">Fecha</th>
                  <th className="p-3">Persona</th>
                  <th className="p-3">Contacto</th>
                  <th className="p-3">Web / página</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row) => {
                  const open = expandedId === row.id
                  return (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-gray-50/60 align-top">
                        <td className="p-3 whitespace-nowrap text-gray-600 text-xs">
                          {fmtDate(row.submitted_at)}
                        </td>
                        <td className="p-3 min-w-[140px]">
                          <p className="font-medium text-gray-900">{row.fullname || '—'}</p>
                          {row.company && <p className="text-xs text-gray-500">{row.company}</p>}
                          {row.service && <p className="text-xs text-gray-400 mt-0.5">{row.service}</p>}
                        </td>
                        <td className="p-3 min-w-[160px]">
                          {row.email && (
                            <a
                              href={`mailto:${row.email}`}
                              className="text-xs text-blue-600 hover:underline block truncate max-w-[200px]"
                            >
                              {row.email}
                            </a>
                          )}
                          {row.phone && (
                            <p className="text-xs text-gray-600 font-mono mt-0.5">{row.phone}</p>
                          )}
                        </td>
                        <td className="p-3 min-w-[140px] max-w-[220px]">
                          <p className="text-xs font-medium text-gray-800">{siteLabel(row.site)}</p>
                          <p className="text-xs text-gray-500 truncate" title={row.page || row.page_url || ''}>
                            {row.page || '—'}
                          </p>
                          {row.page_url && (
                            <a
                              href={row.page_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-gray-600 mt-0.5"
                            >
                              Ver página
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <Badge variant="outline" className={cn('text-[10px]', estadoClass[row.estado])}>
                            {ESTADO_LABELS[row.estado]}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1 flex-wrap">
                            {row.extra_fields?.length > 0 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => setExpandedId(open ? null : row.id)}
                              >
                                {open ? (
                                  <ChevronUp className="h-3.5 w-3.5 mr-1" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 mr-1" />
                                )}
                                Campos
                              </Button>
                            )}
                            {row.estado !== 'contactado' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                                disabled={updatingId === row.id}
                                onClick={() => setEstado(row.id, 'contactado')}
                              >
                                <Check className="h-3.5 w-3.5 mr-1" />
                                Contactado
                              </Button>
                            )}
                            {row.estado !== 'descartado' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-gray-500 hover:text-gray-700"
                                disabled={updatingId === row.id}
                                onClick={() => setEstado(row.id, 'descartado')}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Descartar
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {open && row.extra_fields?.length > 0 && (
                        <tr className="bg-gray-50/70">
                          <td colSpan={6} className="p-4">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                              {row.extra_fields.map((f) => (
                                <div key={f.key}>
                                  <p className="text-gray-500 uppercase tracking-wide text-[10px] font-semibold">
                                    {f.key}
                                  </p>
                                  <p className="text-gray-900 mt-0.5 whitespace-pre-wrap">{f.value}</p>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
