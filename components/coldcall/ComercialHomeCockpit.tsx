'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import PhoneLookupBar from '@/components/coldcall/PhoneLookupBar'
import ComercialIncentiveCard from '@/components/coldcall/ComercialIncentiveCard'
import ColdCallingDashboard from '@/components/coldcall/ColdCallingDashboard'
import { useMeetingReminders } from '@/components/coldcall/MeetingReminders'
import { MeetingConfirmReminders } from '@/components/coldcall/MeetingReminders'
import { telHref } from '@/lib/coldcall/lead-links'
import { formatPhoneForDisplay } from '@/lib/coldcall/whatsapp'
import {
  getLastCampaignId,
  lastCampaignCallHref,
  saveLastCampaignId,
} from '@/lib/coldcall/last-campaign'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChevronDown,
  ChevronUp,
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
  campaign_id: number | null
  campaign_name: string | null
  at: string
}

interface CampaignLite {
  id: number
  name: string
  stats?: { in_queue?: number; total_leads?: number; contacted?: number }
}

function isSameDay(iso: string, day: Date) {
  const d = new Date(iso)
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  )
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export default function ComercialHomeCockpit() {
  const [campaigns, setCampaigns] = useState<CampaignLite[]>([])
  const [callbacks, setCallbacks] = useState<CallbackRow[]>([])
  const [meetingsWeek, setMeetingsWeek] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showMetrics, setShowMetrics] = useState(false)
  const { confirm, loading: remindersLoading, reload: reloadReminders } = useMeetingReminders()

  const [lastCampaignId, setLastCampaignId] = useState<number | null>(null)

  const callHref = lastCampaignCallHref(lastCampaignId)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/coldcall/campaigns').then((r) => r.json()),
      fetch('/api/coldcall/callbacks?daysBack=7&daysAhead=2').then((r) => r.json()),
      fetch('/api/coldcall/dashboard').then((r) => r.json()),
    ])
      .then(([camps, cbs, dash]) => {
        const list = (camps.campaigns || []) as CampaignLite[]
        setCampaigns(list)
        setCallbacks(cbs.callbacks || [])
        setMeetingsWeek(dash.kpis?.meetings_this_week ?? 0)
        const stored = getLastCampaignId()
        const chosen =
          (stored && list.find((c) => c.id === stored)?.id) || list[0]?.id || null
        if (chosen) {
          saveLastCampaignId(chosen)
          setLastCampaignId(chosen)
        } else {
          setLastCampaignId(null)
        }
      })
      .catch(() => {
        setCampaigns([])
        setCallbacks([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setLastCampaignId(getLastCampaignId())
    load()
  }, [load])

  const today = startOfToday()

  const overdueCallbacks = useMemo(
    () => callbacks.filter((c) => new Date(c.at) < today),
    [callbacks, today]
  )
  const todayCallbacks = useMemo(
    () => callbacks.filter((c) => isSameDay(c.at, today)),
    [callbacks, today]
  )

  const activeCampaign =
    campaigns.find((c) => c.id === lastCampaignId) || campaigns[0] || null
  const queueCount = activeCampaign?.stats?.in_queue ?? 0
  const inboxCount = overdueCallbacks.length + todayCallbacks.length + confirm.length

  const refreshAll = () => {
    load()
    reloadReminders()
  }

  return (
    <div className="space-y-5 w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Hoy</h1>
          <p className="text-sm text-gray-500 mt-1">
            Llama, identifica devoluciones y resuelve lo pendiente del día.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl gap-1.5"
          onClick={refreshAll}
          disabled={loading || remindersLoading}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading || remindersLoading ? 'animate-spin' : ''}`}
          />
          Actualizar
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-12 xl:items-start">
        <div className="space-y-5 xl:col-span-7">
          <div className="rounded-2xl bg-[#091E14] text-white p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#22D97A]">
                  Estación de llamadas
                </p>
                <p className="text-xl font-bold mt-1 truncate">
                  {activeCampaign?.name || 'Elige una campaña'}
                </p>
                <p className="text-sm text-white/60 mt-1">
                  {activeCampaign
                    ? `${queueCount} en cola · ${activeCampaign.stats?.contacted ?? 0} ya llamados`
                    : 'Crea o pide una campaña para empezar'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button
                  size="lg"
                  className="rounded-xl gap-2 bg-[#22D97A] text-[#091E14] hover:bg-[#1fc46e] font-semibold"
                  asChild
                >
                  <Link href={callHref}>
                    <Phone className="h-4 w-4" />
                    Llamar ahora
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  asChild
                >
                  <Link href="/comercial/campanas">Campañas</Link>
                </Button>
              </div>
            </div>
          </div>

          <PhoneLookupBar autofocus={false} />

          <ComercialIncentiveCard meetingsThisWeek={meetingsWeek} periodLabel="Esta semana" />
        </div>

        <div className="xl:col-span-5">
          <Card className="shadow-sm border-gray-200/80 overflow-hidden xl:sticky xl:top-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                Inbox de hoy
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {inboxCount}
                </Badge>
              </CardTitle>
              <p className="text-xs text-gray-500">
                Callbacks atrasados/hoy + reuniones a confirmar (próximas 48 h).
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              {loading && callbacks.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                </div>
              ) : (
                <>
                  {(overdueCallbacks.length > 0 || todayCallbacks.length > 0) && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Llamar más tarde
                      </p>
                      {[...overdueCallbacks, ...todayCallbacks].map((c) => {
                        const overdue = new Date(c.at) < today
                        const tel = telHref(c.telefono)
                        const station =
                          c.campaign_id != null
                            ? `/coldcalling/campanas/${c.campaign_id}/llamadas?leadId=${c.id}`
                            : null
                        const when = new Date(c.at).toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                        return (
                          <div
                            key={`cb-${c.id}-${c.at}`}
                            className={`rounded-xl border px-3 py-2.5 flex flex-wrap items-center gap-2 ${
                              overdue
                                ? 'border-red-200 bg-red-50/70'
                                : 'border-amber-100 bg-amber-50/40'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {c.nombre}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {overdue ? 'Atrasado' : `Hoy ${when}`}
                                {c.campaign_name ? ` · ${c.campaign_name}` : ''}
                                {c.telefono
                                  ? ` · ${formatPhoneForDisplay(c.telefono) || c.telefono}`
                                  : ''}
                              </p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              {tel && (
                                <Button size="sm" variant="outline" className="rounded-lg h-8" asChild>
                                  <a href={tel}>
                                    <Phone className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              )}
                              {station && (
                                <Button
                                  size="sm"
                                  className="rounded-lg h-8 bg-gray-900 hover:bg-gray-800"
                                  asChild
                                >
                                  <Link href={station}>Abrir</Link>
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {confirm.length > 0 && (
                    <MeetingConfirmReminders items={confirm} onChanged={reloadReminders} />
                  )}

                  {inboxCount === 0 && !remindersLoading && (
                    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center">
                      <AlertTriangle className="h-7 w-7 text-gray-300 mx-auto" />
                      <p className="text-sm text-gray-500 mt-2">Nada pendiente para hoy.</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Cuando tengas callbacks o reuniones cercanas, aparecerán aquí.
                      </p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          className="rounded-xl gap-1.5 text-gray-500"
          onClick={() => setShowMetrics((v) => !v)}
        >
          {showMetrics ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Ocultar métricas
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Ver métricas completas
            </>
          )}
        </Button>
      </div>

      {showMetrics && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 w-full">
          <ColdCallingDashboard hideToolbar />
        </div>
      )}
    </div>
  )
}
