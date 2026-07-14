'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import AgentChatsPanel from '@/components/AgentChatsPanel'
import WebFormSubmissionsPanel from '@/components/WebFormSubmissionsPanel'
import WebCalBookingsPanel from '@/components/WebCalBookingsPanel'
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

function KpiCard({
  label,
  value,
  sub,
  active,
  hint,
  onClick,
}: {
  label: string
  value: string
  sub?: string
  active?: boolean
  hint?: string
  onClick?: () => void
}) {
  const inner = (
    <CardContent className="pt-5 pb-4">
      <div className="space-y-1">
        <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
        <p className="text-2xl font-semibold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
        {onClick && hint && (
          <p className="text-[11px] text-gray-400 flex items-center gap-0.5 pt-0.5">
            {hint}
            <ChevronDown className={cn('h-3 w-3 transition-transform', active && 'rotate-180')} />
          </p>
        )}
      </div>
    </CardContent>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full text-left rounded-xl transition-all',
          active ? 'ring-2 ring-gray-900 shadow-sm' : 'hover:ring-1 hover:ring-gray-200'
        )}
      >
        <Card className="shadow-sm border-gray-200/80 h-full">{inner}</Card>
      </button>
    )
  }

  return <Card className="shadow-sm border-gray-200/80">{inner}</Card>
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
  initialChatOpen = false,
}: {
  period: string
  initialChatOpen?: boolean
}) {
  const [data, setData] = useState<WebDashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [showChat, setShowChat] = useState(initialChatOpen)
  const [showForms, setShowForms] = useState(false)
  const [showCal, setShowCal] = useState(false)

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

  useEffect(() => {
    if (initialChatOpen) setShowChat(true)
  }, [initialChatOpen])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 bg-gray-100 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <p className="text-center text-sm text-gray-500 py-16">No se pudieron cargar las métricas web.</p>
    )
  }

  const total = data.totals.total || 0

  const closeOthers = (panel: 'cal' | 'forms' | 'chat') => {
    if (panel !== 'cal') setShowCal(false)
    if (panel !== 'forms') setShowForms(false)
    if (panel !== 'chat') setShowChat(false)
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm border-gray-200/80">
        <CardContent className="py-3 px-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-gray-700">Pipelines — IDs para configuración</p>
            {data.web_pipeline_id ? (
              <Link
                href={`/pipelines/${data.web_pipeline_id}`}
                className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
              >
                Abrir pipeline WEB
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {data.all_pipelines.map((p) => (
              <Link
                key={p.id}
                href={`/pipelines/${p.id}`}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors',
                  p.id === data.web_pipeline_id
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                )}
              >
                <span className="font-medium">{p.name}</span>
                <code className={cn('font-mono', p.id === data.web_pipeline_id ? 'text-gray-300' : 'text-gray-400')}>
                  {p.id}
                </code>
              </Link>
            ))}
          </div>
          {data.web_pipeline_id ? (
            <p className="text-[11px] text-gray-500">
              WEB activo: <code className="text-gray-700">{data.web_pipeline_id}</code>
              {data.web_stages.length > 0 && (
                <>
                  {' '}
                  · Columnas:{' '}
                  {data.web_stages.map((s) => `${s.name} (${s.id.slice(0, 8)}…)`).join(', ')}
                </>
              )}
              {data.pipeline_synced > 0 && (
                <span className="text-gray-600"> · {data.pipeline_synced} tarjetas sincronizadas</span>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-amber-800">
              No se encontró pipeline WEB. Crea uno llamado <strong>WEB</strong> o define{' '}
              <code>WEB_PIPELINE_ID</code> en el servidor.
            </p>
          )}
          {data.pipeline_errors.length > 0 && (
            <p className="text-[11px] text-red-700">{data.pipeline_errors.slice(0, 3).join(' · ')}</p>
          )}
        </CardContent>
      </Card>

      {data.form_pending > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs border-amber-200 text-amber-800 bg-amber-50">
            {data.form_pending} formularios pendientes
          </Badge>
          {data.cal_upcoming_today > 0 && (
            <Badge variant="outline" className="text-xs border-gray-200 text-gray-700">
              {data.cal_upcoming_today} reunión{data.cal_upcoming_today > 1 ? 'es' : ''} hoy
            </Badge>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Agendaron en el calendario"
          value={data.cal_available ? fmt(data.totals.cal) : '—'}
          sub={
            data.cal_available
              ? data.cal_upcoming > 0
                ? `${data.cal_upcoming} próximas`
                : 'Cal.com web'
              : 'Webhook + CREATE_CAL_BOOKINGS.sql'
          }
          hint="Ver lead y reunión"
          active={showCal}
          onClick={data.cal_available ? () => {
            setShowCal((v) => !v)
            if (!showCal) closeOthers('cal')
          } : undefined}
        />
        <KpiCard
          label="Formulario rellenado"
          value={data.form_available ? fmt(data.totals.form) : '—'}
          sub={
            data.form_available
              ? data.form_pending > 0
                ? `${data.form_pending} pendientes`
                : 'Todos gestionados'
              : 'CREATE_WEB_FORM_SUBMISSIONS.sql'
          }
          hint="Ver formularios"
          active={showForms}
          onClick={data.form_available ? () => {
            setShowForms((v) => !v)
            if (!showForms) closeOthers('forms')
          } : undefined}
        />
        <KpiCard
          label="Respondieron al chat"
          value={fmt(data.totals.chat)}
          sub="Widget IA · sesiones con respuesta"
          hint="Ver conversaciones"
          active={showChat}
          onClick={() => {
            setShowChat((v) => !v)
            if (!showChat) closeOthers('chat')
          }}
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
            <CardTitle className="text-base font-semibold text-gray-900">Actividad diaria</CardTitle>
            <p className="text-xs text-gray-500 font-normal">{fmt(total)} entradas en el período</p>
          </CardHeader>
          <CardContent className="pb-2">
            <WebChannelTimelineChart data={data.timeline} />
          </CardContent>
        </Card>
      </div>

      {showCal && data.cal_available && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800 px-0.5">Calendario — lead y reunión</h3>
          <WebCalBookingsPanel period={period} />
        </div>
      )}

      {showForms && data.form_available && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800 px-0.5">Formularios web</h3>
          <WebFormSubmissionsPanel period={period} />
        </div>
      )}

      {showChat && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800 px-0.5">Chat IA</h3>
          <AgentChatsPanel embedded />
        </div>
      )}
    </div>
  )
}
