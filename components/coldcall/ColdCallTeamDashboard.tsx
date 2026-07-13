'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ColdCallTeamDashboardData } from '@/lib/coldcall/team-analytics'
import { Loader2, Phone, Timer, Trophy, Users } from 'lucide-react'

const TeamCallsBarChart = dynamic(
  () => import('./dashboard/TeamCompareCharts').then((m) => m.TeamCallsBarChart),
  { ssr: false }
)
const TeamDurationBarChart = dynamic(
  () => import('./dashboard/TeamCompareCharts').then((m) => m.TeamDurationBarChart),
  { ssr: false }
)
const TeamActivityTrendChart = dynamic(
  () => import('./dashboard/TeamCompareCharts').then((m) => m.TeamActivityTrendChart),
  { ssr: false }
)

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="shadow-sm border-gray-200/80 h-full">
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

export default function ColdCallTeamDashboard({
  reloadToken = 0,
  onLoadingChange,
}: {
  reloadToken?: number
  onLoadingChange?: (loading: boolean) => void
}) {
  const [data, setData] = useState<ColdCallTeamDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const onLoadingChangeRef = useRef(onLoadingChange)
  onLoadingChangeRef.current = onLoadingChange

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    onLoadingChangeRef.current?.(true)
    fetch('/api/coldcall/team-dashboard')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) {
          setData(null)
          setError(d.error || 'No se pudo cargar el panel de equipo')
          return
        }
        if (!d.error) setData(d)
        else {
          setData(null)
          setError(d.error)
        }
      })
      .catch(() => {
        setData(null)
        setError('No se pudo cargar el panel de equipo')
      })
      .finally(() => {
        setLoading(false)
        onLoadingChangeRef.current?.(false)
      })
  }, [])

  useEffect(() => {
    load()
  }, [load, reloadToken])

  if (loading && !data) {
    return (
      <div className="py-24 flex justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-16 text-center">
        <Users className="h-10 w-10 text-gray-300 mx-auto" />
        <p className="mt-3 text-sm text-gray-500">{error || 'No se pudo cargar el panel de equipo.'}</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={load}>
          Reintentar
        </Button>
      </div>
    )
  }

  const topCaller = data.members[0]
  const topDuration = [...data.members].sort((a, b) => b.duration_min - a.duration_min)[0]
  const barCalls = data.members.map((m) => ({ name: m.name, calls_week: m.calls_week }))
  const barDuration = data.members.map((m) => ({ name: m.name, duration_min: m.duration_min }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Llamadas esta semana" value={data.totals.calls_week} sub="Todo el equipo" />
        <KpiCard
          label="Tiempo en llamadas"
          value={`${data.totals.duration_min_week} min`}
          sub="Esta semana"
        />
        <KpiCard label="Reuniones agendadas" value={data.totals.meetings_week} sub="Esta semana" />
        <KpiCard label="Comerciales activos" value={data.members.length} sub="Admin + comerciales" />
      </div>

      {(topCaller || topDuration) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {topCaller && topCaller.calls_week > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 flex items-center gap-3">
              <Trophy className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-xs text-amber-800 font-medium uppercase tracking-wide">
                  Más llamadas esta semana
                </p>
                <p className="text-sm font-semibold text-amber-950">
                  {topCaller.name} — {topCaller.calls_week} llamadas
                </p>
              </div>
            </div>
          )}
          {topDuration && topDuration.duration_min > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 flex items-center gap-3">
              <Timer className="h-5 w-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-xs text-blue-800 font-medium uppercase tracking-wide">
                  Más tiempo llamando
                </p>
                <p className="text-sm font-semibold text-blue-950">
                  {topDuration.name} — {topDuration.duration_min} min
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-900">Llamadas por persona</CardTitle>
            <p className="text-xs text-gray-500">Comparativa semanal</p>
          </CardHeader>
          <CardContent>
            <TeamCallsBarChart data={barCalls} />
          </CardContent>
        </Card>
        <Card className="shadow-sm border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-900">Tiempo en llamadas</CardTitle>
            <p className="text-xs text-gray-500">Minutos registrados esta semana</p>
          </CardHeader>
          <CardContent>
            <TeamDurationBarChart data={barDuration} />
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-gray-200/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-900">Actividad diaria del equipo</CardTitle>
          <p className="text-xs text-gray-500">Últimos 14 días — llamadas por persona</p>
        </CardHeader>
        <CardContent>
          <TeamActivityTrendChart data={data.calls_by_day} series={data.series} />
        </CardContent>
      </Card>

      <Card className="shadow-sm border-gray-200/80 overflow-hidden">
        <CardHeader className="pb-2 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            Detalle por comercial
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">Persona</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 text-right">Hoy</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 text-right">Semana</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 text-right">Total</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 text-right">Minutos</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 text-right">Interesados</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 text-right">Reuniones</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 text-right">Tasa +</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 text-right">Campañas</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">Última llamada</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.user_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{m.name}</span>
                        <Badge variant="outline" className="text-[10px] font-normal capitalize">
                          {m.role}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">{m.calls_today}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-gray-900">
                      {m.calls_week}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-600">{m.calls_total}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">{m.duration_min}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">{m.interested}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">{m.meetings}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">{m.positive_rate}%</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-600">{m.campaigns}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDateTime(m.last_call_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.members.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
              <Phone className="h-8 w-8 text-gray-300" />
              Aún no hay actividad de llamadas en el equipo
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
