'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { telHref } from '@/lib/coldcall/lead-links'
import { formatPhoneForDisplay } from '@/lib/coldcall/whatsapp'
import {
  commissionPerClosedSale,
  formatCommissionFormula,
  formatEur,
  projectCommission,
} from '@/lib/coldcall/commission'
import ComercialIncentiveCard from '@/components/coldcall/ComercialIncentiveCard'
import { MeetingRemindersBlock } from '@/components/coldcall/MeetingReminders'
import MeetingsMonthCalendar from '@/components/coldcall/MeetingsMonthCalendar'
import {
  Calendar,
  ExternalLink,
  LayoutList,
  Loader2,
  Phone,
  RefreshCw,
  Sparkles,
} from 'lucide-react'

interface MeetingRow {
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

const CAL_BOOKING_URL = 'https://cal.com/buffalo-agencia/reunion-agente-llamada'

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

export default function ComercialReunionesPanel() {
  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  const [meetingsThisWeek, setMeetingsThisWeek] = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista' | 'calendario'>('lista')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/coldcall/meetings?daysBack=45&daysAhead=90').then((r) => r.json()),
      fetch('/api/coldcall/dashboard').then((r) => r.json()),
    ])
      .then(([meetingsData, dashboardData]) => {
        setMeetings(meetingsData.meetings || [])
        setMeetingsThisWeek(dashboardData.kpis?.meetings_this_week ?? 0)
      })
      .catch(() => {
        setMeetings([])
        setMeetingsThisWeek(0)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const hoy = meetings.filter((m) => fmtWhen(m.at).isToday)
  const proximas = meetings.filter((m) => !fmtWhen(m.at).isPast)
  const weekProjection = projectCommission({ meetings: meetingsThisWeek })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reuniones</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-lg">
            Gente que quiere una reunión contigo — agendada en Cal.com desde la estación de llamadas.
            No confundir con &quot;llámame más tarde&quot;.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-0.5">
            <Button
              type="button"
              size="sm"
              variant={view === 'lista' ? 'default' : 'ghost'}
              className={`rounded-lg gap-1.5 h-8 ${
                view === 'lista' ? 'bg-gray-900 hover:bg-gray-800' : 'text-gray-600'
              }`}
              onClick={() => setView('lista')}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Lista
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === 'calendario' ? 'default' : 'ghost'}
              className={`rounded-lg gap-1.5 h-8 ${
                view === 'calendario' ? 'bg-gray-900 hover:bg-gray-800' : 'text-gray-600'
              }`}
              onClick={() => setView('calendario')}
            >
              <Calendar className="h-3.5 w-3.5" />
              Calendario
            </Button>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button size="sm" className="rounded-xl gap-2 bg-gray-900 hover:bg-gray-800" asChild>
            <a href={CAL_BOOKING_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Abrir Cal.com
            </a>
          </Button>
        </div>
      </div>

      <ComercialIncentiveCard
        meetingsThisWeek={meetingsThisWeek}
        pipelineMeetings={proximas.length}
        periodLabel="Esta semana"
        compact={meetingsThisWeek === 0 && proximas.length === 0}
      />

      <MeetingRemindersBlock alwaysShowConfirm />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Reuniones hoy" value={hoy.length} />
        <StatCard label="Próximas reuniones" value={proximas.length} />
        <StatCard
          label="Comisión semanal est."
          value={formatEur(weekProjection.commissionEur)}
          hint={formatCommissionFormula(weekProjection)}
        />
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      ) : view === 'calendario' ? (
        meetings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-16 text-center">
            <Calendar className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="mt-3 text-sm text-gray-500">No hay reuniones para mostrar en el calendario.</p>
          </div>
        ) : (
          <MeetingsMonthCalendar meetings={meetings} />
        )
      ) : meetings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-16 text-center">
          <Calendar className="h-10 w-10 text-gray-300 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">No hay reuniones agendadas.</p>
          <p className="text-xs text-gray-400 mt-1">
            Cuando marques &quot;Interesado → Sí, reunión&quot; y agendes en Cal.com, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {hoy.length > 0 && <MeetingSection title="Hoy" items={hoy} highlight />}
          {proximas.filter((m) => !fmtWhen(m.at).isToday).length > 0 && (
            <MeetingSection
              title="Próximas reuniones"
              items={proximas.filter((m) => !fmtWhen(m.at).isToday)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: number | string
  hint?: string
}) {
  return (
    <Card className="shadow-sm border-gray-200/80">
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 tabular-nums mt-0.5">{value}</p>
        {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function MeetingSection({
  title,
  items,
  highlight = false,
}: {
  title: string
  items: MeetingRow[]
  highlight?: boolean
}) {
  return (
    <Card className={`shadow-sm ${highlight ? 'border-emerald-200 bg-emerald-50/20' : 'border-gray-200/80'}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          {title}
          <Badge variant="secondary" className="text-[10px] font-normal">
            {items.length}
          </Badge>
          {items.length > 0 && (
            <span className="text-[11px] font-normal text-emerald-700 ml-1">
              · {formatEur(projectCommission({ meetings: items.length }).commissionEur)} est.
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {items.map((m) => (
          <MeetingRowCard key={`${m.id}-${m.at}`} meeting={m} />
        ))}
      </CardContent>
    </Card>
  )
}

function MeetingRowCard({ meeting: m }: { meeting: MeetingRow }) {
  const when = fmtWhen(m.at)
  const tel = telHref(m.telefono)
  const phoneDisplay = formatPhoneForDisplay(m.telefono)
  const callHref =
    m.campaign_id != null
      ? `/coldcalling/campanas/${m.campaign_id}/llamadas?leadId=${m.id}`
      : null

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
      <div className="shrink-0 text-center min-w-[72px]">
        <p className={`text-lg font-bold tabular-nums ${when.isToday ? 'text-emerald-700' : 'text-gray-900'}`}>
          {when.time}
        </p>
        <p className="text-[11px] text-gray-500 capitalize">{when.date}</p>
      </div>

      <div className="flex-1 min-w-[160px]">
        <p className="font-semibold text-gray-900">{m.nombre}</p>
        <p className="text-sm text-gray-500">
          {[m.empresa, m.campaign_name].filter(Boolean).join(' · ') || '—'}
        </p>
        <p className="text-xs text-emerald-700 font-medium mt-1 flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          Reunión Cal.com · {formatEur(commissionPerClosedSale())} si cierra la venta
        </p>
      </div>

      <div className="flex flex-wrap gap-2 shrink-0">
        {tel && (
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5" asChild>
            <a href={tel}>
              <Phone className="h-3.5 w-3.5" />
              {phoneDisplay || 'Llamar'}
            </a>
          </Button>
        )}
        {callHref && (
          <Button size="sm" className="rounded-xl gap-1.5 bg-gray-900 hover:bg-gray-800" asChild>
            <Link href={callHref}>Ver lead</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
