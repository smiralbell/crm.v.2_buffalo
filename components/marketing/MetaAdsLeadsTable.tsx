'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { estadoLabel } from '@/lib/leads/estados'
import { formatMetaRef } from '@/lib/integrations/meta/parse'
import type { MetaAdsLeadRow } from '@/lib/integrations/meta/list'
import { ChevronDown, ChevronUp, ExternalLink, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

const statusLabel: Record<string, string> = {
  processed: 'En CRM',
  pending: 'Pendiente',
  failed: 'Error',
  ignored: 'Ignorado',
}

const statusClass: Record<string, string> = {
  processed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  ignored: 'bg-gray-100 text-gray-600 border-gray-200',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function MetaAdsLeadsTable({
  rows,
  loading,
  empty,
  showCampaign = true,
}: {
  rows: MetaAdsLeadRow[]
  loading?: boolean
  empty?: string
  showCampaign?: boolean
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const cols = showCampaign ? 6 : 5

  if (loading) {
    return (
      <Card className="border-gray-200/80">
        <CardContent className="py-10 flex justify-center text-sm text-gray-500">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          Cargando leads…
        </CardContent>
      </Card>
    )
  }

  if (!rows.length) {
    return (
      <Card className="border-gray-200/80">
        <CardContent className="py-8 text-center text-sm text-gray-500">
          {empty || 'Aún no ha entrado ningún lead de Meta en este periodo.'}
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
              {showCampaign && <th className="p-3">Campaña</th>}
              <th className="p-3">Estado</th>
              <th className="p-3 text-right"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => {
              const open = expandedId === row.id
              return (
                <Fragment key={row.id}>
                  <tr className="hover:bg-gray-50/60 align-top">
                    <td className="p-3 whitespace-nowrap text-gray-600 text-xs">{fmtDate(row.created_at)}</td>
                    <td className="p-3 min-w-[140px]">
                      <p className="font-medium text-gray-900">{row.nombre || '—'}</p>
                      {row.empresa && <p className="text-xs text-gray-500">{row.empresa}</p>}
                    </td>
                    <td className="p-3 min-w-[160px]">
                      {row.email && (
                        <a href={`mailto:${row.email}`} className="text-xs text-blue-600 hover:underline block truncate max-w-[220px]">
                          {row.email}
                        </a>
                      )}
                      {row.telefono && <p className="text-xs text-gray-600 font-mono mt-0.5">{row.telefono}</p>}
                    </td>
                    {showCampaign && (
                      <td className="p-3 min-w-[160px] max-w-[260px]">
                        <p className="text-xs font-medium text-gray-800 truncate">
                          {formatMetaRef(row.campaign_name, row.campaign_id) || '—'}
                        </p>
                        {formatMetaRef(row.ad_name, row.ad_id) && (
                          <p className="text-xs text-gray-500 truncate">{formatMetaRef(row.ad_name, row.ad_id)}</p>
                        )}
                      </td>
                    )}
                    <td className="p-3 whitespace-nowrap">
                      <Badge variant="outline" className={cn('text-[10px]', statusClass[row.status])}>
                        {statusLabel[row.status] || row.status}
                      </Badge>
                      {row.lead_estado && (
                        <p className="text-[10px] text-gray-400 mt-1">{estadoLabel(row.lead_estado)}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        {row.answers.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setExpandedId(open ? null : row.id)}
                          >
                            {open ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                            Respuestas
                          </Button>
                        )}
                        {row.lead_id && (
                          <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
                            <Link href={`/leads/${row.lead_id}`}>
                              Abrir
                              <ExternalLink className="h-3.5 w-3.5 ml-1" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {open && row.answers.length > 0 && (
                    <tr className="bg-gray-50/70">
                      <td colSpan={cols} className="p-4">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                          {row.answers.map((f) => (
                            <div key={f.name}>
                              <p className="text-gray-500 uppercase tracking-wide text-[10px] font-semibold">{f.name}</p>
                              <p className="text-gray-900 mt-0.5 whitespace-pre-wrap">{f.values.join(', ')}</p>
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
  )
}
