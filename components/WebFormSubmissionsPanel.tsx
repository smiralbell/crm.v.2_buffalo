'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  ESTADO_LABELS,
  ETIQUETA_LABELS,
  type WebFormSubmissionRow,
} from '@/lib/marketing/web-form-submissions.types'
import { Check, ExternalLink, RefreshCw, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const estadoClass: Record<string, string> = {
  pendiente: 'bg-amber-50 text-amber-800 border-amber-200',
  contactado: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  descartado: 'bg-gray-100 text-gray-600 border-gray-200',
}

const etiquetaClass: Record<string, string> = {
  agente_llamadas: 'bg-violet-50 text-violet-800',
  agente_texto: 'bg-blue-50 text-blue-800',
  contacto: 'bg-sky-50 text-sky-800',
  footer: 'bg-slate-100 text-slate-700',
  automatizaciones: 'bg-orange-50 text-orange-800',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function pageLabel(row: WebFormSubmissionRow) {
  if (row.page_url) {
    try {
      const u = new URL(row.page_url)
      return u.pathname || row.page_url
    } catch {
      return row.page_url
    }
  }
  return row.source || '—'
}

export default function WebFormSubmissionsPanel({ period }: { period: string }) {
  const [rows, setRows] = useState<WebFormSubmissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = period ? `?period=${encodeURIComponent(period)}` : ''
      const res = await fetch(`/api/marketing/web-form-submissions${qs}`)
      const data = await res.json()
      if (res.ok) {
        setRows(data.submissions || [])
        setTableMissing(!!data.table_missing)
      }
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

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

  if (loading) {
    return (
      <Card className="border-gray-200/80">
        <CardContent className="py-12 flex justify-center text-sm text-gray-500">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          Cargando formularios…
        </CardContent>
      </Card>
    )
  }

  if (tableMissing) {
    return (
      <Card className="border-amber-200/80 bg-amber-50/40">
        <CardContent className="py-4 text-sm text-amber-950/90">
          Ejecuta <code className="text-xs">prisma/CREATE_WEB_FORM_SUBMISSIONS.sql</code> en PostgreSQL
          y configura n8n para insertar en <code className="text-xs">web_form_submissions</code>.
        </CardContent>
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card className="border-gray-200/80">
        <CardContent className="py-10 text-center text-sm text-gray-500">
          Sin formularios en este período. Cuando n8n guarde envíos en la tabla, aparecerán aquí.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-gray-200/80 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="p-3 whitespace-nowrap">Fecha</th>
              <th className="p-3">Persona</th>
              <th className="p-3">Contacto</th>
              <th className="p-3">Página / origen</th>
              <th className="p-3">Etiqueta</th>
              <th className="p-3">Estado</th>
              <th className="p-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50/60 align-top">
                <td className="p-3 whitespace-nowrap text-gray-600 text-xs">
                  {fmtDate(row.submitted_at)}
                </td>
                <td className="p-3 min-w-[140px]">
                  <p className="font-medium text-gray-900">{row.fullname || '—'}</p>
                  {row.company && <p className="text-xs text-gray-500">{row.company}</p>}
                  {row.service && (
                    <p className="text-xs text-gray-400 mt-0.5">{row.service}</p>
                  )}
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
                  {row.phone && <p className="text-xs text-gray-600 font-mono mt-0.5">{row.phone}</p>}
                  {row.calls && <p className="text-xs text-gray-400">{row.calls} llamadas/mes</p>}
                </td>
                <td className="p-3 min-w-[120px] max-w-[200px]">
                  <p className="text-xs text-gray-700 truncate" title={row.page_url || row.source || ''}>
                    {pageLabel(row)}
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
                  <Badge
                    variant="secondary"
                    className={cn('text-[10px]', etiquetaClass[row.etiqueta] || 'bg-gray-100')}
                  >
                    {ETIQUETA_LABELS[row.etiqueta] || row.etiqueta}
                  </Badge>
                </td>
                <td className="p-3 whitespace-nowrap">
                  <Badge variant="outline" className={cn('text-[10px]', estadoClass[row.estado])}>
                    {ESTADO_LABELS[row.estado]}
                  </Badge>
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1 flex-wrap">
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
                    {row.estado !== 'pendiente' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={updatingId === row.id}
                        onClick={() => setEstado(row.id, 'pendiente')}
                      >
                        Pendiente
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
