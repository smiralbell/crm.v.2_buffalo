'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  ESTADO_LABELS,
  ETIQUETA_LABELS,
  type WebFormSubmissionRow,
} from '@/lib/marketing/web-form-submissions.types'
import {
  FORMACION_INTENT_LABELS,
  type FormacionDiagnosticoRow,
} from '@/lib/marketing/formacion-diagnosticos.types'
import { Check, ChevronDown, ChevronUp, ExternalLink, GraduationCap, RefreshCw, XCircle } from 'lucide-react'
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

type UnifiedItem =
  | { kind: 'web'; sortAt: string; row: WebFormSubmissionRow }
  | { kind: 'formacion'; sortAt: string; row: FormacionDiagnosticoRow }

export default function WebFormSubmissionsPanel({ period }: { period: string }) {
  const [rows, setRows] = useState<WebFormSubmissionRow[]>([])
  const [formacion, setFormacion] = useState<FormacionDiagnosticoRow[]>([])
  const [formacionAvailable, setFormacionAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = period ? `?period=${encodeURIComponent(period)}` : ''
      const res = await fetch(`/api/marketing/web-form-submissions${qs}`)
      const data = await res.json()
      if (res.ok) {
        setRows(data.submissions || [])
        setFormacion(data.formacion || [])
        setFormacionAvailable(data.formacion_available !== false)
        setTableMissing(!!data.table_missing && !(data.formacion || []).length)
      }
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  const items = useMemo<UnifiedItem[]>(() => {
    const web: UnifiedItem[] = rows.map((row) => ({
      kind: 'web',
      sortAt: row.submitted_at,
      row,
    }))
    const form: UnifiedItem[] = formacion.map((row) => ({
      kind: 'formacion',
      sortAt: row.created_at,
      row,
    }))
    return [...web, ...form].sort(
      (a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime()
    )
  }, [rows, formacion])

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

  if (tableMissing && items.length === 0) {
    return (
      <Card className="border-amber-200/80 bg-amber-50/40">
        <CardContent className="py-4 text-sm text-amber-950/90">
          Ejecuta <code className="text-xs">prisma/CREATE_WEB_FORM_SUBMISSIONS.sql</code> en PostgreSQL
          y configura n8n para insertar en <code className="text-xs">web_form_submissions</code>.
          {!formacionAvailable && (
            <>
              {' '}
              Tampoco se pudo leer <code className="text-xs">formacion_diagnosticos</code> (DB n8n /
              DATABASE_URL_chat).
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  if (items.length === 0) {
    return (
      <Card className="border-gray-200/80">
        <CardContent className="py-10 text-center text-sm text-gray-500">
          Sin formularios en este período. Incluye web (agenciabuffalo.es) y formación
          (formacion.agenciabuffalo.es).
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {rows.length} web · {formacion.length} formación
        </span>
        {!formacionAvailable && (
          <span className="text-amber-700">Formación no disponible (revisa DATABASE_URL_chat)</span>
        )}
      </div>
      <Card className="border-gray-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="p-3 whitespace-nowrap">Fecha</th>
                <th className="p-3">Persona</th>
                <th className="p-3">Contacto</th>
                <th className="p-3">Origen</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Estado</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => {
                if (item.kind === 'web') {
                  const row = item.row
                  return (
                    <tr key={`web-${row.id}`} className="hover:bg-gray-50/60 align-top">
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
                        {row.phone && (
                          <p className="text-xs text-gray-600 font-mono mt-0.5">{row.phone}</p>
                        )}
                        {row.calls && (
                          <p className="text-xs text-gray-400">{row.calls} llamadas/mes</p>
                        )}
                      </td>
                      <td className="p-3 min-w-[120px] max-w-[200px]">
                        <p
                          className="text-xs text-gray-700 truncate"
                          title={row.page_url || row.source || ''}
                        >
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
                        <Badge
                          variant="outline"
                          className={cn('text-[10px]', estadoClass[row.estado])}
                        >
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
                  )
                }

                const row = item.row
                const expandKey = `formacion-${row.id}`
                const open = expandedId === expandKey
                return (
                  <Fragment key={expandKey}>
                    <tr className="hover:bg-teal-50/40 align-top">
                      <td className="p-3 whitespace-nowrap text-gray-600 text-xs">
                        {fmtDate(row.created_at)}
                      </td>
                      <td className="p-3 min-w-[140px]">
                        <p className="font-medium text-gray-900">{row.nombre || '—'}</p>
                        <p className="text-xs text-gray-500">{row.empresa}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{row.funcion}</p>
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
                        {row.telefono && (
                          <p className="text-xs text-gray-600 font-mono mt-0.5">{row.telefono}</p>
                        )}
                      </td>
                      <td className="p-3 min-w-[120px]">
                        <p className="text-xs text-teal-800 font-medium flex items-center gap-1">
                          <GraduationCap className="h-3.5 w-3.5" />
                          formacion.agenciabuffalo.es
                        </p>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px]',
                            row.intent === 'fundae'
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-teal-50 text-teal-800'
                          )}
                        >
                          {FORMACION_INTENT_LABELS[row.intent]}
                        </Badge>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-800 border-sky-200">
                          Recibido
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setExpandedId(open ? null : expandKey)}
                          >
                            {open ? (
                              <>
                                <ChevronUp className="h-3.5 w-3.5 mr-1" />
                                Ocultar
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                                Detalle
                              </>
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-teal-50/30">
                        <td colSpan={7} className="p-4">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                            <div>
                              <p className="text-gray-500 uppercase tracking-wide text-[10px] font-semibold">
                                Trabajadores
                              </p>
                              <p className="text-gray-900 mt-0.5">{row.trabajadores}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 uppercase tracking-wide text-[10px] font-semibold">
                                Uso IA
                              </p>
                              <p className="text-gray-900 mt-0.5">{row.uso_ia}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 uppercase tracking-wide text-[10px] font-semibold">
                                Crédito FUNDAE
                              </p>
                              <p className="text-gray-900 mt-0.5">{row.credito_fundae}</p>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3">
                              <p className="text-gray-500 uppercase tracking-wide text-[10px] font-semibold">
                                Objetivo
                              </p>
                              <p className="text-gray-900 mt-0.5 whitespace-pre-wrap">{row.objetivo}</p>
                            </div>
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
    </div>
  )
}
