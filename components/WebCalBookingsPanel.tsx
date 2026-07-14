'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  CAL_BOOKING_STATUS_LABELS,
  type CalBookingRow,
} from '@/lib/marketing/cal-bookings.types'
import { ExternalLink, RefreshCw, Video } from 'lucide-react'
import { cn } from '@/lib/utils'

const statusClass: Record<string, string> = {
  accepted: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  rejected: 'bg-red-50 text-red-800 border-red-200',
}

const leadEstadoClass: Record<string, string> = {
  frio: 'bg-blue-50 text-blue-700',
  caliente: 'bg-orange-50 text-orange-700',
  reunion: 'bg-purple-50 text-purple-700',
  propuesta: 'bg-yellow-50 text-yellow-700',
  cerrado: 'bg-green-50 text-green-700',
  cliente: 'bg-emerald-50 text-emerald-700',
  perdido: 'bg-red-50 text-red-700',
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtMeetingRange(start: string, end: string, duration: number) {
  if (!start) return '—'
  const startDate = new Date(start)
  const endDate = end ? new Date(end) : new Date(startDate.getTime() + duration * 60_000)
  const day = startDate.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })
  const from = startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const to = endDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${from}–${to}`
}

export default function WebCalBookingsPanel({ period }: { period: string }) {
  const [rows, setRows] = useState<CalBookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const qs = period ? `?period=${encodeURIComponent(period)}` : ''
      const res = await fetch(`/api/marketing/cal-bookings${qs}`)
      const data = await res.json()
      if (res.ok) {
        setRows(data.bookings || [])
        setConfigured(data.configured !== false)
        setTableMissing(!!data.table_missing)
      } else {
        setError(data.error || 'No se pudieron cargar las reservas')
      }
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <Card className="border-gray-200/80">
        <CardContent className="py-12 flex justify-center text-sm text-gray-500">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          Cargando reservas del calendario…
        </CardContent>
      </Card>
    )
  }

  if (tableMissing || !configured) {
    return (
      <Card className="border-amber-200/80 bg-amber-50/40">
        <CardContent className="py-4 text-sm text-amber-950/90 space-y-2">
          <p>
            1. Ejecuta <code className="text-xs">prisma/CREATE_CAL_BOOKINGS.sql</code> en PostgreSQL.
          </p>
          <p>
            2. En Cal.com → Developer → Webhooks, apunta a{' '}
            <code className="text-xs">POST /api/webhooks/calcom</code> con el secret{' '}
            <code className="text-xs">CALCOM_WEBHOOK_SECRET</code>.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200/80 bg-red-50/40">
        <CardContent className="py-4 text-sm text-red-900">{error}</CardContent>
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card className="border-gray-200/80">
        <CardContent className="py-10 text-center text-sm text-gray-500">
          Sin reservas en este período. Cuando alguien agende en Cal.com, aparecerá aquí con sus datos de lead.
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
              <th className="p-3 whitespace-nowrap">Agendado</th>
              <th className="p-3">Lead</th>
              <th className="p-3">Reunión</th>
              <th className="p-3">Estado lead</th>
              <th className="p-3">Estado reserva</th>
              <th className="p-3 text-right">Enlaces</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => (
              <tr key={row.uid} className="hover:bg-gray-50/60 align-top">
                <td className="p-3 whitespace-nowrap text-gray-600 text-xs">
                  {fmtDate(row.created_at)}
                </td>
                <td className="p-3 min-w-[160px]">
                  <p className="font-medium text-gray-900">{row.attendee_name || '—'}</p>
                  {row.attendee_email && (
                    <a
                      href={`mailto:${row.attendee_email}`}
                      className="text-xs text-blue-600 hover:underline block truncate max-w-[220px]"
                    >
                      {row.attendee_email}
                    </a>
                  )}
                  {row.empresa && <p className="text-xs text-gray-500 mt-0.5">{row.empresa}</p>}
                  {row.telefono && (
                    <p className="text-xs text-gray-600 font-mono mt-0.5">{row.telefono}</p>
                  )}
                  {row.lead_origen && (
                    <p className="text-[11px] text-gray-400 mt-0.5">Origen: {row.lead_origen}</p>
                  )}
                  {!row.lead_id && row.attendee_email && (
                    <p className="text-[11px] text-amber-700 mt-1">Sin lead en CRM (email no vinculado)</p>
                  )}
                </td>
                <td className="p-3 min-w-[180px]">
                  <p className="text-gray-900">{row.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{fmtMeetingRange(row.start, row.end, row.duration)}</p>
                  {row.location && (
                    <a
                      href={row.location.startsWith('http') ? row.location : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'inline-flex items-center gap-1 text-[11px] mt-1',
                        row.location.startsWith('http')
                          ? 'text-violet-600 hover:text-violet-800'
                          : 'text-gray-500'
                      )}
                    >
                      {row.location.startsWith('http') ? (
                        <>
                          <Video className="h-3 w-3" />
                          Unirse a la reunión
                        </>
                      ) : (
                        row.location
                      )}
                    </a>
                  )}
                </td>
                <td className="p-3 whitespace-nowrap">
                  {row.lead_id ? (
                    <Link
                      href={`/leads/${row.lead_id}`}
                      className="inline-flex items-center gap-1.5 hover:opacity-80"
                    >
                      {row.lead_estado && (
                        <Badge
                          variant="secondary"
                          className={cn('text-[10px]', leadEstadoClass[row.lead_estado] || 'bg-gray-100')}
                        >
                          {row.lead_estado}
                        </Badge>
                      )}
                      <span className="text-xs text-blue-600">Ver lead</span>
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="p-3 whitespace-nowrap">
                  <Badge variant="outline" className={cn('text-[10px]', statusClass[row.status])}>
                    {CAL_BOOKING_STATUS_LABELS[row.status] || row.status}
                  </Badge>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <a
                    href={row.cal_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                  >
                    Cal.com
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
