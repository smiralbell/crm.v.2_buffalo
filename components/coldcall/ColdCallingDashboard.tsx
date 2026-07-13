'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { outcomeLabel } from '@/lib/coldcall/lead-table'
import type { ColdCallDashboardData } from '@/lib/coldcall/dashboard-analytics'
import ColdCallAlertsPanel from '@/components/coldcall/dashboard/ColdCallAlertsPanel'
import ColdCallScopeToolbar from '@/components/coldcall/ColdCallScopeToolbar'
import { coldCallScopeQuery } from '@/lib/coldcall/api-query'
import type { ColdCallFilter } from '@/lib/coldcall/scope'
import { useAuth } from '@/components/AuthContext'
import {
  ArrowRight,
  Bell,
  Clock,
  Loader2,
  Phone,
  Target,
  ThumbsUp,
  Timer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

const MonthlyActivityChart = dynamic(() => import('./dashboard/MonthlyActivityChart'), { ssr: false })
const HourEffectivenessChart = dynamic(() => import('./dashboard/HourEffectivenessChart'), { ssr: false })
const DailyTrendChart = dynamic(() => import('./dashboard/DailyTrendChart'), { ssr: false })

function KpiCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string
  value: string | number
  sub?: string
  trend?: number
}) {
  return (
    <Card className="shadow-sm border-gray-200/80 h-full">
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
        <p className="text-2xl font-semibold text-gray-900 leading-tight mt-1 tabular-nums">{value}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
          {trend != null && trend !== 0 && (
            <span
              className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
                trend > 0 ? 'text-emerald-600' : 'text-red-500'
              }`}
            >
              {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trend > 0 ? '+' : ''}
              {trend}% sem.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function InsightPill({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 h-full shadow-sm">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold text-gray-900 mt-0.5 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDuration(sec: number | null): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ColdCallingDashboard({
  filter: filterProp,
  onFilterChange,
  reloadToken = 0,
  hideToolbar = false,
  onLoadingChange,
}: {
  filter?: ColdCallFilter
  onFilterChange?: (filter: ColdCallFilter) => void
  reloadToken?: number
  hideToolbar?: boolean
  onLoadingChange?: (loading: boolean) => void
}) {
  const { user } = useAuth()
  const defaultFilter: ColdCallFilter = user?.id ?? 'team'
  const [data, setData] = useState<ColdCallDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [localFilter, setLocalFilter] = useState<ColdCallFilter>(filterProp ?? defaultFilter)

  const effectiveFilter = onFilterChange ? (filterProp ?? defaultFilter) : localFilter
  const setFilter = onFilterChange ?? setLocalFilter

  useEffect(() => {
    if (filterProp !== undefined) setLocalFilter(filterProp)
  }, [filterProp])

  const load = useCallback(() => {
    setLoading(true)
    onLoadingChange?.(true)
    fetch(`/api/coldcall/dashboard${coldCallScopeQuery(effectiveFilter, user?.id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setData(d)
      })
      .catch(() => setData(null))
      .finally(() => {
        setLoading(false)
        onLoadingChange?.(false)
      })
  }, [effectiveFilter, onLoadingChange, user?.id])

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
        <Phone className="h-10 w-10 text-gray-300 mx-auto" />
        <p className="mt-3 text-sm text-gray-500">No se pudieron cargar las métricas.</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={load}>
          Reintentar
        </Button>
      </div>
    )
  }

  const { kpis, insights } = data
  const recentCalls = data.recent_calls.slice(0, 2)

  return (
    <div className="space-y-6">
      {!hideToolbar && (
        <ColdCallScopeToolbar
          filter={effectiveFilter}
          onFilterChange={setFilter}
          onRefresh={load}
          loading={loading}
        />
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Interesados"
          value={kpis.interested_total}
          sub={`${kpis.interested_this_week} esta semana · ${kpis.positive_leads} leads activos`}
        />
        <KpiCard
          label="Reuniones agendadas"
          value={kpis.meetings_total}
          sub={`${kpis.meetings_this_week} esta semana`}
        />
        <KpiCard
          label="Tasa de interés"
          value={`${kpis.interest_rate}%`}
          sub={`${kpis.conversion_rate}% conv. a reunión`}
        />
        <KpiCard
          label="Duración media"
          value={kpis.avg_duration_min > 0 ? `${kpis.avg_duration_min} min` : '—'}
          sub={
            kpis.avg_duration_interested_min > 0
              ? `${kpis.avg_duration_interested_min} min en positivos`
              : 'Todas las llamadas'
          }
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Llamadas hoy"
          value={kpis.calls_today}
          sub={`${kpis.calls_this_week} esta semana`}
          trend={kpis.week_change_pct}
        />
        <KpiCard label="Total llamadas" value={kpis.total_calls} sub={`${kpis.leads_contacted} leads contactados`} />
        <KpiCard label="Leads en cola" value={kpis.leads_in_queue} sub={`${kpis.total_leads} leads totales`} />
        <KpiCard
          label="Callbacks pendientes"
          value={kpis.callback_leads}
          sub={`${kpis.contact_rate}% del listado llamado`}
        />
      </div>

      {/* Insights + Alertas — rellena el hueco */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-4 grid grid-cols-2 gap-3">
          <InsightPill
            label="Mejor hora para llamar"
            value={insights.best_hour_label ?? '—'}
            hint={
              insights.best_hour_rate > 0
                ? `${insights.best_hour_rate}% respuestas positivas`
                : 'Sin datos suficientes'
            }
          />
          <InsightPill
            label="Mejor día"
            value={insights.best_weekday ?? '—'}
            hint={
              insights.best_weekday_rate > 0
                ? `${insights.best_weekday_rate}% respuestas positivas`
                : 'Sin datos suficientes'
            }
          />
          <InsightPill
            label="Campañas activas"
            value={String(kpis.active_campaigns)}
            hint={`${kpis.campaigns} en total`}
          />
          <InsightPill
            label="Llamadas registradas"
            value={String(kpis.total_calls)}
            hint="Histórico completo"
          />
        </div>

        <Card className="shadow-sm border-gray-200/80 lg:col-span-8 flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-gray-500" />
                <CardTitle className="text-sm font-semibold text-gray-700">Alertas</CardTitle>
              </div>
              {data.alerts.length > 0 && (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {data.alerts.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            <ColdCallAlertsPanel alerts={data.alerts} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="shadow-sm border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Evolución mensual</CardTitle>
            <p className="text-xs text-gray-400">Últimos 12 meses — llamadas, interesados y reuniones</p>
          </CardHeader>
          <CardContent>
            <MonthlyActivityChart data={data.calls_by_month} />
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Duración media por mes</CardTitle>
            <p className="text-xs text-gray-400">Minutos por llamada registrada</p>
          </CardHeader>
          <CardContent>
            <MonthlyActivityChart data={data.calls_by_month} mode="duration" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="shadow-sm border-gray-200/80 xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Mejor franja horaria</CardTitle>
            <p className="text-xs text-gray-400">
              Llamadas vs respuestas positivas — últimos 30 días
            </p>
          </CardHeader>
          <CardContent>
            <HourEffectivenessChart data={data.calls_by_hour} />
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Por día de la semana</CardTitle>
            <p className="text-xs text-gray-400">Volumen y % positivo</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.weekday_activity.map((d) => (
              <div key={d.day} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700 w-8">{d.day}</span>
                  <span className="text-gray-500 tabular-nums">
                    {d.calls} llamadas · {d.positive} positivas
                  </span>
                  <span className="text-gray-900 font-semibold tabular-nums w-10 text-right">
                    {d.rate}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-800 rounded-full transition-all"
                    style={{ width: `${Math.max(d.rate, d.calls > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-gray-200/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Últimos 30 días</CardTitle>
          <p className="text-xs text-gray-400">Actividad diaria de llamadas</p>
        </CardHeader>
        <CardContent>
          <DailyTrendChart data={data.calls_by_day} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card className="shadow-sm border-gray-200/80 xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Campañas</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-0">
            {data.campaigns.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center px-6">No hay campañas</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500">
                      <th className="text-left font-medium px-6 py-2">Campaña</th>
                      <th className="text-right font-medium px-3 py-2">Leads</th>
                      <th className="text-right font-medium px-3 py-2">Llamadas</th>
                      <th className="text-right font-medium px-3 py-2">
                        <ThumbsUp className="h-3.5 w-3.5 inline" />
                      </th>
                      <th className="text-right font-medium px-3 py-2">
                        <Target className="h-3.5 w-3.5 inline" />
                      </th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.campaigns.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50/60">
                        <td className="px-6 py-2.5">
                          <p className="font-medium text-gray-900 truncate max-w-[180px]">{c.name}</p>
                          <p className="text-[11px] text-gray-400">{c.in_queue} en cola</p>
                        </td>
                        <td className="text-right px-3 py-2.5 tabular-nums text-gray-700">{c.total_leads}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums font-medium text-gray-900">
                          {c.calls}
                        </td>
                        <td className="text-right px-3 py-2.5 tabular-nums text-gray-700">{c.interested}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums text-gray-900 font-semibold">
                          {c.meetings}
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={`/coldcalling/campanas/${c.id}`} className="text-gray-400 hover:text-gray-900">
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200/80 xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Últimas llamadas positivas</CardTitle>
            <p className="text-xs text-gray-400">Máximo 2 · interesado, reunión o callback</p>
          </CardHeader>
          <CardContent>
            {recentCalls.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">Sin resultados positivos aún</p>
            ) : (
              <ul className="space-y-2">
                {recentCalls.map((call) => (
                  <li
                    key={call.id}
                    className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{call.lead_nombre}</p>
                        {call.campaign_name && (
                          <p className="text-gray-500 truncate">{call.campaign_name}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] font-normal shrink-0">
                        {outcomeLabel(call.resultado)}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {fmtDateTime(call.fecha)}
                      </span>
                      {call.duracion != null && call.duracion > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {fmtDuration(call.duracion)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
