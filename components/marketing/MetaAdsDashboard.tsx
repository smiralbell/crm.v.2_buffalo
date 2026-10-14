'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { monthDateBounds } from '@/lib/integrations/meta/ads-parse'
import type { MetaAdsCampaignListRow } from '@/lib/integrations/meta/ads-list'
import type { MetaAdsLeadRow } from '@/lib/integrations/meta/list'
import MetaAdsKpi, { formatInt, formatMoney } from '@/components/marketing/MetaAdsKpi'
import MetaAdsLeadsTable from '@/components/marketing/MetaAdsLeadsTable'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

const statusClass: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-800 border-amber-200',
  CAMPAIGN_PAUSED: 'bg-amber-50 text-amber-800 border-amber-200',
  ARCHIVED: 'bg-gray-100 text-gray-600 border-gray-200',
  DELETED: 'bg-red-50 text-red-700 border-red-200',
  WITH_ISSUES: 'bg-red-50 text-red-700 border-red-200',
}

function fmtDay(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function Cell({ value }: { value: string | null }) {
  if (value == null) return <span className="text-gray-400">No disponible</span>
  return <span>{value}</span>
}

export default function MetaAdsDashboard({
  period,
  range,
  reloadToken = 0,
}: {
  period: string
  range?: { since: string; until: string } | null
  reloadToken?: number
}) {
  const router = useRouter()
  const month = useMemo(() => monthDateBounds(period), [period])
  const applied = range && range.since && range.until ? range : month
  const [campaigns, setCampaigns] = useState<MetaAdsCampaignListRow[]>([])
  const [summary, setSummary] = useState<{
    campaigns: number
    spend: number | null
    impressions: number | null
    link_clicks: number | null
    landing_page_views: number | null
    leads_meta: number | null
    crm_leads: number
    cpc: number | null
    cost_per_lead: number | null
  } | null>(null)
  const [leads, setLeads] = useState<MetaAdsLeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [leadsLoading, setLeadsLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setLeadsLoading(true)
    try {
      const qs = new URLSearchParams({ since: applied.since, until: applied.until })
      const [campRes, leadRes] = await Promise.all([
        fetch(`/api/marketing/meta-campaigns?${qs}`),
        fetch(`/api/marketing/meta-leads?period=${encodeURIComponent(period)}`),
      ])
      const campJson = await campRes.json().catch(() => ({}))
      const leadJson = await leadRes.json().catch(() => ({}))
      if (campRes.ok) {
        setCampaigns(campJson.campaigns || [])
        setSummary(campJson.summary || null)
      }
      if (leadRes.ok) setLeads(leadJson.leads || [])
    } finally {
      setLoading(false)
      setLeadsLoading(false)
    }
  }, [applied.since, applied.until, period])

  useEffect(() => {
    void load()
  }, [load, reloadToken])

  const currency = campaigns.find((c) => c.currency)?.currency || 'EUR'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetaAdsKpi
          label="Gasto"
          value={formatMoney(summary?.spend ?? null, currency)}
          tip="Dinero invertido en anuncios en el periodo. Se suma día a día."
        />
        <MetaAdsKpi
          label="Impresiones"
          value={formatInt(summary?.impressions ?? null)}
          tip="Veces que se mostró un anuncio. Una persona puede generar varias impresiones."
        />
        <MetaAdsKpi
          label="Clics enlace"
          value={formatInt(summary?.link_clicks ?? null)}
          tip="Clics en el enlace del anuncio. No son visitas a la web: parte se queda en Instagram o Facebook."
        />
        <MetaAdsKpi
          label="Visitas destino"
          value={formatInt(summary?.landing_page_views ?? null)}
          tip="Personas que llegaron de verdad a la página de destino tras el clic."
        />
        <MetaAdsKpi
          label="Leads Meta"
          value={formatInt(summary?.leads_meta ?? null)}
          tip="Formularios o conversiones que Meta cuenta en anuncios. Puede no coincidir con el CRM."
        />
        <MetaAdsKpi
          label="Leads CRM"
          value={formatInt(summary?.crm_leads ?? 0)}
          tip="Leads que han entrado al CRM por campaign_id. Son las personas reales en el embudo."
        />
      </div>

      <div>
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Campañas</h2>
            <p className="text-xs text-gray-400 mt-0.5">Pulsa una campaña para ver su evolución y leads.</p>
          </div>
        </div>

        {loading ? (
          <Card className="border-gray-200/80">
            <CardContent className="py-12 flex justify-center text-sm text-gray-500">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Cargando campañas…
            </CardContent>
          </Card>
        ) : !campaigns.length ? (
          <Card className="border-gray-200/80">
            <CardContent className="py-10 text-center text-sm text-gray-500">
              Aún no hay campañas. Ábrelo en Configuración de campañas, al lado de Costes, y pulsa Sincronizar.
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="p-3">Campaña</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-right">Presupuesto</th>
                    <th className="p-3 text-right">Gasto</th>
                    <th className="p-3 text-right">Impresiones</th>
                    <th className="p-3 text-right">Clics</th>
                    <th className="p-3 text-right">Visitas</th>
                    <th className="p-3 text-right">Leads Meta</th>
                    <th className="p-3 text-right">Leads CRM</th>
                    <th className="p-3 text-right">CPC</th>
                    <th className="p-3 text-right">Coste/lead</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {campaigns.map((row) => {
                    const budget =
                      row.daily_budget != null
                        ? `${formatMoney(row.daily_budget, row.currency)}/día`
                        : row.lifetime_budget != null
                          ? `${formatMoney(row.lifetime_budget, row.currency)} total`
                          : null
                    const href = `/marketing/meta/${encodeURIComponent(row.id)}?period=${encodeURIComponent(period)}`
                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-gray-50/80 cursor-pointer"
                        onClick={() => router.push(href)}
                      >
                        <td className="p-3 min-w-[200px]">
                          <Link href={href} className="font-medium text-gray-900 hover:underline" onClick={(e) => e.stopPropagation()}>
                            {row.name}
                          </Link>
                          {(row.start_time || row.stop_time) && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {row.start_time ? fmtDay(row.start_time.slice(0, 10)) : '—'}
                              {' → '}
                              {row.stop_time ? fmtDay(row.stop_time.slice(0, 10)) : 'activa'}
                            </p>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {row.status ? (
                            <Badge
                              variant="outline"
                              className={cn('text-[10px]', statusClass[row.status] || 'bg-gray-50 text-gray-700')}
                            >
                              {row.status}
                            </Badge>
                          ) : (
                            <Cell value={null} />
                          )}
                        </td>
                        <td className="p-3 text-right text-xs whitespace-nowrap">
                          <Cell value={budget} />
                        </td>
                        <td className="p-3 text-right text-xs whitespace-nowrap">
                          <Cell value={formatMoney(row.spend, row.currency)} />
                        </td>
                        <td className="p-3 text-right text-xs">
                          <Cell value={formatInt(row.impressions)} />
                        </td>
                        <td className="p-3 text-right text-xs">
                          <Cell value={formatInt(row.link_clicks)} />
                        </td>
                        <td className="p-3 text-right text-xs">
                          <Cell value={formatInt(row.landing_page_views)} />
                        </td>
                        <td className="p-3 text-right text-xs">
                          <Cell value={formatInt(row.leads_meta)} />
                        </td>
                        <td className="p-3 text-right text-xs font-medium">{formatInt(row.crm_leads)}</td>
                        <td className="p-3 text-right text-xs whitespace-nowrap">
                          <Cell value={formatMoney(row.cpc, row.currency)} />
                        </td>
                        <td className="p-3 text-right text-xs whitespace-nowrap">
                          <Cell value={formatMoney(row.cost_per_lead, row.currency)} />
                        </td>
                        <td className="p-3 text-gray-400">
                          <Link href={href} onClick={(e) => e.stopPropagation()} className="inline-flex">
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Leads recientes</h2>
        <MetaAdsLeadsTable rows={leads} loading={leadsLoading} />
      </div>
    </div>
  )
}
