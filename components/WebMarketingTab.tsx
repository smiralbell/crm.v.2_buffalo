'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Globe, FileText, MessageCircle, Info, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import AgentChatsPanel from '@/components/AgentChatsPanel'
import type { WebMarketingMetrics } from '@/lib/marketing/web-metrics'

function fmt(n: number) {
  return n.toLocaleString('es-ES')
}

const estadoColors: Record<string, string> = {
  frio: 'bg-blue-50 text-blue-700',
  caliente: 'bg-orange-50 text-orange-700',
  cerrado: 'bg-green-50 text-green-700',
  cliente: 'bg-emerald-50 text-emerald-700',
  perdido: 'bg-red-50 text-red-700',
  reunion: 'bg-purple-50 text-purple-700',
  propuesta: 'bg-yellow-50 text-yellow-700',
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  active?: boolean
  onClick?: () => void
}) {
  const inner = (
    <CardContent className="pt-5 pb-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 leading-tight">{value}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
          {onClick && (
            <p className="text-[11px] text-gray-400 flex items-center gap-0.5 pt-0.5">
              Ver conversaciones
              <ChevronDown className={cn('h-3 w-3 transition-transform', active && 'rotate-180')} />
            </p>
          )}
        </div>
        <span className={cn(
          'shrink-0 rounded-lg p-2',
          active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
        )}>
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
          active
            ? 'ring-2 ring-gray-900 shadow-sm'
            : 'hover:ring-1 hover:ring-gray-200'
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

export default function WebMarketingTab({
  period,
  initialChatOpen = false,
}: {
  period: string
  initialChatOpen?: boolean
}) {
  const [data, setData] = useState<WebMarketingMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [showChat, setShowChat] = useState(initialChatOpen)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = period ? `?period=${encodeURIComponent(period)}` : ''
      const res = await fetch(`/api/marketing/web-metrics${qs}`)
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-xl" />
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <p className="text-center text-sm text-gray-500 py-16">No se pudieron cargar las métricas web.</p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi
          icon={Globe}
          label="Leads por la web"
          value={fmt(data.web_leads)}
          sub="Origen web o canal web en el período"
        />
        <Kpi
          icon={FileText}
          label="Formulario rellenado"
          value={fmt(data.form_submissions)}
          sub={
            data.conversion_form_pct != null
              ? `${data.conversion_form_pct}% sobre leads web`
              : 'Sin leads web en el período'
          }
        />
        <Kpi
          icon={MessageCircle}
          label="Respondieron al chat"
          value={data.chat_available ? fmt(data.chat_replied) : '—'}
          sub={
            data.chat_available
              ? `${fmt(data.chat_sessions)} sesiones · ${
                  data.conversion_chat_pct != null ? `${data.conversion_chat_pct}% engagement` : '—'
                }`
              : 'Chat no configurado (DATABASE_URL_chat)'
          }
          active={showChat}
          onClick={data.chat_available ? () => setShowChat((v) => !v) : undefined}
        />
      </div>

      {showChat && data.chat_available && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800 px-0.5">Chat IA — conversaciones</h3>
          <AgentChatsPanel embedded />
        </div>
      )}

      {!data.chat_available && (
        <Card className="border-amber-200/80 bg-amber-50/40">
          <CardContent className="pt-4 pb-4 flex gap-3">
            <Info className="h-5 w-5 text-amber-700 shrink-0" />
            <p className="text-sm text-amber-950/90">
              Para métricas de chat, configura <code className="text-xs">DATABASE_URL_chat</code> con la base
              del historial n8n. Los leads web se detectan por <code className="text-xs">origen_principal</code>{' '}
              (web, formulario_web, etc.).
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm border-gray-200/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-900">Embudo web</CardTitle>
          <p className="text-xs text-gray-500 font-normal mt-0.5">
            Visita → formulario o chat con respuesta del visitante
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Leads web</span>
              <span className="font-semibold">{fmt(data.web_leads)}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-gray-800 rounded-full w-full" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Formulario completado</span>
              <span className="font-semibold">{fmt(data.form_submissions)}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-slate-600 rounded-full"
                style={{
                  width: `${data.web_leads > 0 ? Math.min(100, (data.form_submissions / data.web_leads) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Chat con respuesta</span>
              <span className="font-semibold">{data.chat_available ? fmt(data.chat_replied) : '—'}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-slate-400 rounded-full"
                style={{
                  width: `${
                    data.chat_sessions > 0
                      ? Math.min(100, (data.chat_replied / data.chat_sessions) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-gray-200/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-900">Últimos leads web</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent_web_leads.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              Sin leads con origen web en este período. Asigna{' '}
              <code className="text-xs">origen_principal: web</code> o{' '}
              <code className="text-xs">formulario_web</code> al crear el lead desde n8n.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.recent_web_leads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50/80 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {lead.contact?.empresa || lead.origen_principal || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {lead.estado && (
                      <Badge
                        variant="secondary"
                        className={`text-[10px] ${estadoColors[lead.estado] || 'bg-gray-100 text-gray-600'}`}
                      >
                        {lead.estado}
                      </Badge>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(lead.created_at).toLocaleDateString('es-ES')}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
