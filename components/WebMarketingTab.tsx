'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, MessageCircle, CalendarDays, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import AgentChatsPanel from '@/components/AgentChatsPanel'
import WebFormSubmissionsPanel from '@/components/WebFormSubmissionsPanel'
import WebCalBookingsPanel from '@/components/WebCalBookingsPanel'
import WebDashboardAlerts from '@/components/marketing/WebDashboardAlerts'
import type { WebDashboardMetrics } from '@/lib/marketing/web-dashboard.types'

const WebChannelTimelineChart = dynamic(
  () => import('@/components/marketing/WebChannelTimelineChart'),
  { ssr: false }
)
const WebChannelBarChart = dynamic(
  () => import('@/components/marketing/WebChannelBarChart'),
  { ssr: false }
)

function fmt(n: number) {
  return n.toLocaleString('es-ES')
}

function Kpi({
  label,
  value,
  sub,
  hint,
  icon: Icon,
  active,
  onClick,
  accent,
}: {
  label: string
  value: string
  sub?: string
  hint?: string
  icon: React.ElementType
  active?: boolean
  onClick?: () => void
  accent?: string
}) {
  const inner = (
    <CardContent className="pt-5 pb-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 leading-tight">{value}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
          {onClick && hint && (
            <p className="text-[11px] text-gray-400 flex items-center gap-0.5 pt-0.5">
              {hint}
              <ChevronDown className={cn('h-3 w-3 transition-transform', active && 'rotate-180')} />
            </p>
          )}
        </div>
        <span
          className={cn(
            'shrink-0 rounded-lg p-2',
            active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
          )}
          style={!active && accent ? { backgroundColor: `${accent}18`, color: accent } : undefined}
        >
          <Icon className="h-4 w-4" />
        </span>
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

  return (
    <Card className="shadow-sm border-gray-200/80">
      {inner}
    </Card>
  )
}

function ShareBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-72 bg-gray-100 rounded-xl" />
          <div className="h-72 bg-gray-100 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <p className="text-center text-sm text-gray-500 py-16">No se pudieron cargar las métricas web.</p>
    )
  }

  const closeOthers = (panel: 'cal' | 'forms' | 'chat') => {
    if (panel !== 'cal') setShowCal(false)
    if (panel !== 'forms') setShowForms(false)
    if (panel !== 'chat') setShowChat(false)
  }

  return (
    <div className="space-y-6">
      <WebDashboardAlerts alerts={data.alerts} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi
          icon={CalendarDays}
          label="Agendaron en el calendario"
          value={data.cal_available ? fmt(data.totals.cal) : '—'}
          sub={
            data.cal_available
              ? data.cal_upcoming_today > 0
                ? `${data.cal_upcoming_today} hoy · ${data.cal_upcoming} próximas`
                : data.cal_upcoming > 0
                  ? `${data.cal_upcoming} reuniones próximas`
                  : 'Cal.com — reunion-agente-llamada'
              : 'Webhook Cal.com + CREATE_CAL_BOOKINGS.sql'
          }
          hint="Ver lead y reunión"
          active={showCal}
          accent="#8B5CF6"
          onClick={data.cal_available ? () => {
            setShowCal((v) => !v)
            if (!showCal) closeOthers('cal')
          } : undefined}
        />
        <Kpi
          icon={FileText}
          label="Formulario rellenado"
          value={data.form_available ? fmt(data.totals.form) : '—'}
          sub={
            data.form_available
              ? data.form_pending > 0
                ? `${data.form_pending} pendientes de contactar`
                : 'Todos gestionados en el período'
              : 'Ejecuta CREATE_WEB_FORM_SUBMISSIONS.sql'
          }
          hint="Ver formularios"
          active={showForms}
          accent="#374151"
          onClick={data.form_available ? () => {
            setShowForms((v) => !v)
            if (!showForms) closeOthers('forms')
          } : undefined}
        />
        <Kpi
          icon={MessageCircle}
          label="Respondieron al chat"
          value={fmt(data.totals.chat)}
          sub={
            data.chat_available
              ? `${data.share_chat_pct}% del tráfico web · widget IA`
              : 'Configura DATABASE_URL_chat'
          }
          hint="Ver conversaciones"
          active={showChat}
          accent="#3B82F6"
          onClick={() => {
            setShowChat((v) => !v)
            if (!showChat) closeOthers('chat')
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-900">Actividad en el tiempo</CardTitle>
            <p className="text-xs text-gray-500 font-normal">Formulario, calendario y widget por día</p>
          </CardHeader>
          <CardContent className="pb-4">
            <WebChannelTimelineChart data={data.timeline} />
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-900">Comparativa de vías</CardTitle>
            <p className="text-xs text-gray-500 font-normal">
              {fmt(data.totals.total)} entradas web en el período
            </p>
          </CardHeader>
          <CardContent className="pb-4">
            <WebChannelBarChart totals={data.totals} />
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-gray-200/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-900">Mix de canales web</CardTitle>
          <p className="text-xs text-gray-500 font-normal">
            Distribución del tráfico convertido · Pipeline WEB sincronizado
            {data.pipeline_available ? ` (${data.pipeline_synced} tarjetas)` : ' (pipeline no encontrado)'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ShareBar label="Formulario web" pct={data.share_form_pct} color="#374151" />
          <ShareBar label="Calendario Cal.com" pct={data.share_cal_pct} color="#8B5CF6" />
          <ShareBar label="Widget chat" pct={data.share_chat_pct} color="#3B82F6" />
          {data.cal_from_form_pct != null && data.totals.form > 0 && (
            <p className="text-xs text-gray-500 pt-1 border-t border-gray-100">
              Tasa formulario → calendario:{' '}
              <span className="font-semibold text-gray-800">{data.cal_from_form_pct}%</span>
            </p>
          )}
        </CardContent>
      </Card>

      {showCal && data.cal_available && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800 px-0.5">Calendario — lead y reunión</h3>
          <WebCalBookingsPanel period={period} />
        </div>
      )}

      {showForms && data.form_available && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800 px-0.5">Formularios web — envíos n8n</h3>
          <WebFormSubmissionsPanel period={period} />
        </div>
      )}

      {showChat && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800 px-0.5">Chat IA — conversaciones</h3>
          <AgentChatsPanel embedded />
        </div>
      )}
    </div>
  )
}
