'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowUpRight } from 'lucide-react'
import WebDashboardAlerts from '@/components/marketing/WebDashboardAlerts'
import type { WebDashboardMetrics } from '@/lib/marketing/web-dashboard.types'

const WebChannelTimelineChart = dynamic(
  () => import('@/components/marketing/WebChannelTimelineChart'),
  { ssr: false }
)

function fmt(n: number) {
  return n.toLocaleString('es-ES')
}

function pct(num: number, den: number): string {
  if (!den) return '0%'
  return ((num / den) * 100).toFixed(1) + '%'
}

function KpiLink({
  label,
  value,
  sub,
  href,
}: {
  label: string
  value: string
  sub?: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl transition-all hover:ring-1 hover:ring-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900"
    >
      <Card className="shadow-sm border-gray-200/80 h-full group">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
              <p className="text-2xl font-semibold text-gray-900 leading-tight">{value}</p>
              {sub && <p className="text-xs text-gray-400">{sub}</p>}
              <p className="text-[11px] text-gray-400 pt-0.5 group-hover:text-gray-600">
                Abrir detalle →
              </p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-gray-600 shrink-0 mt-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function FunnelBar({
  label,
  count,
  total,
  color,
}: {
  label: string
  count: number
  total: number
  color: string
}) {
  const w = total > 0 ? Math.max(2, (count / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-800">
          {fmt(count)} <span className="text-gray-400 font-normal">({pct(count, total)})</span>
        </span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  )
}

export default function WebMarketingTab({
  period,
}: {
  period: string
  initialChatOpen?: boolean
}) {
  const [data, setData] = useState<WebDashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = period ? `?period=${encodeURIComponent(period)}` : ''
      const res = await fetch(`/api/marketing/web-dashboard${qs}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-gray-100 rounded-xl" />
          <div className="h-64 bg-gray-100 rounded-xl" />
        </div>
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (!data) {
    return (
      <p className="text-center text-sm text-gray-500 py-16">No se pudieron cargar las métricas web.</p>
    )
  }

  const total = data.totals.total || 0
  const periodQs = period ? `?period=${encodeURIComponent(period)}` : ''

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiLink
          label="Agendaron en el calendario"
          value={data.cal_available ? fmt(data.totals.cal) : '—'}
          sub={
            data.cal_available
              ? data.cal_upcoming > 0
                ? `${data.cal_upcoming} próximas`
                : 'Cal.com web'
              : 'Webhook pendiente de configurar'
          }
          href={`/marketing/web/calendario${periodQs}`}
        />
        <KpiLink
          label="Formulario rellenado"
          value={data.form_available ? fmt(data.totals.form) : '—'}
          sub={
            data.form_available
              ? data.form_pending > 0
                ? `${data.form_pending} pendientes`
                : 'Todos gestionados'
              : 'Tabla de formularios no disponible'
          }
          href={`/marketing/web/formularios${periodQs}`}
        />
        <KpiLink
          label="Respondieron al chat"
          value={fmt(data.totals.chat)}
          sub="Widget IA · sesiones con respuesta"
          href="/marketing/web/chat"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm border-gray-200/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-gray-900">Embudo web</CardTitle>
            <p className="text-xs text-gray-500 font-normal">Calendario · formulario · widget</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <FunnelBar label="Calendario Cal.com" count={data.totals.cal} total={total} color="bg-gray-800" />
            <FunnelBar label="Formulario completado" count={data.totals.form} total={total} color="bg-slate-600" />
            <FunnelBar label="Chat con respuesta" count={data.totals.chat} total={total} color="bg-slate-400" />
            {data.cal_from_form_pct != null && data.totals.form > 0 && (
              <p className="text-xs text-gray-500 pt-1 border-t border-gray-100">
                Formulario → calendario:{' '}
                <span className="font-semibold text-gray-800">{data.cal_from_form_pct}%</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-gray-900">Alertas</CardTitle>
            <p className="text-xs text-gray-500 font-normal">
              Leads nuevos, pendientes y seguimiento
            </p>
          </CardHeader>
          <CardContent>
            <WebDashboardAlerts alerts={data.alerts} />
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-gray-200/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-900">Actividad diaria</CardTitle>
          <p className="text-xs text-gray-500 font-normal">
            {fmt(total)} entradas en el período · formulario, calendario y widget
          </p>
        </CardHeader>
        <CardContent className="pb-2">
          <WebChannelTimelineChart data={data.timeline} />
        </CardContent>
      </Card>
    </div>
  )
}
