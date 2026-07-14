'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { telHref } from '@/lib/coldcall/lead-links'
import { formatPhoneForDisplay } from '@/lib/coldcall/whatsapp'
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  Loader2,
  Phone,
  RefreshCw,
} from 'lucide-react'

interface CallbackRow {
  id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  campaign_id: number | null
  campaign_name: string | null
  at: string
  notas: string | null
}

function fmtWhen(iso: string): { date: string; time: string; isToday: boolean; isPast: boolean } {
  const d = new Date(iso)
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)
  return {
    date: d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    isToday: d >= todayStart && d < todayEnd,
    isPast: d < now,
  }
}

export default function ComercialCallbacksPanel() {
  const [callbacks, setCallbacks] = useState<CallbackRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/coldcall/callbacks')
      .then((r) => r.json())
      .then((d) => setCallbacks(d.callbacks || []))
      .catch(() => setCallbacks([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const atrasados = callbacks.filter((c) => fmtWhen(c.at).isPast)
  const hoy = callbacks.filter((c) => fmtWhen(c.at).isToday)
  const proximos = callbacks.filter((c) => !fmtWhen(c.at).isPast && !fmtWhen(c.at).isToday)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Llamar más tarde</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-lg">
            Te dijeron cuándo volver a llamar — &quot;llámame el lunes a las 10&quot;.
            Esto no es una reunión de Cal.com.
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Atrasados" value={atrasados.length} warn={atrasados.length > 0} />
        <StatCard label="Hoy" value={hoy.length} />
        <StatCard label="Próximos" value={proximos.length} />
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      ) : callbacks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-16 text-center">
          <Clock className="h-10 w-10 text-gray-300 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">No tienes callbacks pendientes.</p>
          <p className="text-xs text-gray-400 mt-1">
            Al marcar &quot;Llamar más tarde&quot; y poner fecha/hora, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {atrasados.length > 0 && (
            <CallbackSection title="Atrasados — llama ya" items={atrasados} overdue />
          )}
          {hoy.length > 0 && <CallbackSection title="Hoy" items={hoy} highlight />}
          {proximos.length > 0 && <CallbackSection title="Próximos" items={proximos} />}
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  warn = false,
}: {
  label: string
  value: number
  warn?: boolean
}) {
  return (
    <Card className={`shadow-sm ${warn ? 'border-red-200 bg-red-50/30' : 'border-gray-200/80'}`}>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className={`text-2xl font-bold tabular-nums mt-0.5 ${warn ? 'text-red-700' : 'text-gray-900'}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function CallbackSection({
  title,
  items,
  highlight = false,
  overdue = false,
}: {
  title: string
  items: CallbackRow[]
  highlight?: boolean
  overdue?: boolean
}) {
  return (
    <Card
      className={`shadow-sm ${
        overdue ? 'border-red-200 bg-red-50/20' : highlight ? 'border-amber-200 bg-amber-50/20' : 'border-gray-200/80'
      }`}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          {overdue ? (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          ) : (
            <CalendarClock className="h-4 w-4" />
          )}
          {title}
          <Badge variant="secondary" className="text-[10px] font-normal">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {items.map((c) => (
          <CallbackRowCard key={`${c.id}-${c.at}`} callback={c} overdue={overdue} />
        ))}
      </CardContent>
    </Card>
  )
}

function CallbackRowCard({ callback: c, overdue }: { callback: CallbackRow; overdue?: boolean }) {
  const when = fmtWhen(c.at)
  const tel = telHref(c.telefono)
  const phoneDisplay = formatPhoneForDisplay(c.telefono)
  const callHref =
    c.campaign_id != null
      ? `/coldcalling/campanas/${c.campaign_id}/llamadas?leadId=${c.id}`
      : null

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
      <div className="shrink-0 text-center min-w-[72px]">
        <p
          className={`text-lg font-bold tabular-nums ${
            overdue ? 'text-red-700' : when.isToday ? 'text-amber-700' : 'text-gray-900'
          }`}
        >
          {when.time}
        </p>
        <p className="text-[11px] text-gray-500 capitalize">{when.date}</p>
      </div>

      <div className="flex-1 min-w-[160px]">
        <p className="font-semibold text-gray-900">{c.nombre}</p>
        <p className="text-sm text-gray-500">
          {[c.empresa, c.campaign_name].filter(Boolean).join(' · ') || '—'}
        </p>
        <p className="text-xs text-amber-800 font-medium mt-1">Volver a llamar — no es reunión</p>
        {c.notas && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{c.notas}</p>}
      </div>

      <div className="flex flex-wrap gap-2 shrink-0">
        {tel && (
          <Button
            size="sm"
            className={`rounded-xl gap-1.5 ${overdue ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'}`}
            asChild
          >
            <a href={tel}>
              <Phone className="h-3.5 w-3.5" />
              Llamar
            </a>
          </Button>
        )}
        {callHref && (
          <Button variant="outline" size="sm" className="rounded-xl" asChild>
            <Link href={callHref}>{phoneDisplay || 'Ver lead'}</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
