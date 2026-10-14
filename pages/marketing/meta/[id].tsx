import { useCallback, useEffect, useMemo, useState } from 'react'
import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { monthDateBounds } from '@/lib/integrations/meta/ads-parse'
import type { MetaAdsCampaignListRow } from '@/lib/integrations/meta/ads-list'
import type { MetaAdsLeadRow } from '@/lib/integrations/meta/list'
import MetaAdsKpi, { formatInt, formatMoney } from '@/components/marketing/MetaAdsKpi'
import MetaAdsCampaignCharts from '@/components/marketing/MetaAdsCampaignCharts'
import MetaAdsLeadsTable from '@/components/marketing/MetaAdsLeadsTable'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

const statusClass: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-800 border-amber-200',
  CAMPAIGN_PAUSED: 'bg-amber-50 text-amber-800 border-amber-200',
  ARCHIVED: 'bg-gray-100 text-gray-600 border-gray-200',
}

function fmtDay(iso: string | null) {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!d) return null
  return `${d}/${m}/${y}`
}

function Funnel({ campaign }: { campaign: MetaAdsCampaignListRow }) {
  const steps = [
    { label: 'Impresiones', value: campaign.impressions },
    { label: 'Clics enlace', value: campaign.link_clicks },
    { label: 'Visitas destino', value: campaign.landing_page_views },
    { label: 'Leads Meta', value: campaign.leads_meta },
  ]
  let max = 1
  for (let i = 0; i < steps.length; i++) {
    const n = steps[i].value || 0
    if (n > max) max = n
  }
  return (
    <Card className="border-gray-200/80 shadow-sm">
      <CardContent className="pt-5 pb-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800">Embudo</p>
        {steps.map((s, i) => {
          const prev = i === 0 ? s.value : steps[i - 1].value
          const pct = prev && s.value != null ? Math.round((s.value / prev) * 100) : null
          const w = Math.max(6, ((s.value || 0) / max) * 100)
          return (
            <div key={s.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600">{s.label}</span>
                <span className="font-medium text-gray-900">
                  {formatInt(s.value) ?? 'No disponible'}
                  {i > 0 && pct != null && <span className="text-gray-400 font-normal ml-2">{pct}%</span>}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gray-900 rounded-full" style={{ width: `${w}%` }} />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export default function MetaAdsCampaignPage() {
  const router = useRouter()
  const id = typeof router.query.id === 'string' ? router.query.id : ''
  const period =
    typeof router.query.period === 'string' && /^\d{4}-\d{2}$/.test(router.query.period)
      ? router.query.period
      : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const bounds = useMemo(() => monthDateBounds(period), [period])

  const [campaign, setCampaign] = useState<MetaAdsCampaignListRow | null>(null)
  const [leads, setLeads] = useState<MetaAdsLeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [leadsLoading, setLeadsLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setLeadsLoading(true)
    try {
      const qs = new URLSearchParams({ since: bounds.since, until: bounds.until })
      const [campRes, leadRes] = await Promise.all([
        fetch(`/api/marketing/meta-campaigns?${qs}`),
        fetch(
          `/api/marketing/meta-leads?period=${encodeURIComponent(period)}&campaign_id=${encodeURIComponent(id)}`
        ),
      ])
      const campJson = await campRes.json().catch(() => ({}))
      const leadJson = await leadRes.json().catch(() => ({}))
      const found = (campJson.campaigns || []).find((c: MetaAdsCampaignListRow) => c.id === id) || null
      setCampaign(found)
      if (leadRes.ok) setLeads(leadJson.leads || [])
    } finally {
      setLoading(false)
      setLeadsLoading(false)
    }
  }, [id, bounds.since, bounds.until, period])

  useEffect(() => {
    void load()
  }, [load])

  const currency = campaign?.currency || 'EUR'
  const budget =
    campaign?.daily_budget != null
      ? `${formatMoney(campaign.daily_budget, currency)} / día`
      : campaign?.lifetime_budget != null
        ? `${formatMoney(campaign.lifetime_budget, currency)} total`
        : 'No disponible'

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" className="rounded-xl -ml-2 mb-2 text-gray-600" asChild>
              <Link href="/marketing?tab=meta">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Meta Ads
              </Link>
            </Button>
            {loading ? (
              <p className="text-sm text-gray-400 flex items-center">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Cargando campaña…
              </p>
            ) : campaign ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-semibold text-gray-900">{campaign.name}</h1>
                  {campaign.status && (
                    <Badge
                      variant="outline"
                      className={cn('text-[10px]', statusClass[campaign.status] || 'bg-gray-50 text-gray-700')}
                    >
                      {campaign.status}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {fmtDay(campaign.start_time) || '—'} → {fmtDay(campaign.stop_time) || 'activa'}
                  {' · '}
                  Presupuesto {budget}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No encontramos esta campaña en el periodo {period}.</p>
            )}
          </div>
        </div>

        {campaign && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
              <MetaAdsKpi label="Gasto" value={formatMoney(campaign.spend, currency)} tip="Inversión de esta campaña en el periodo." />
              <MetaAdsKpi label="Impresiones" value={formatInt(campaign.impressions)} tip="Veces que se mostró un anuncio de esta campaña." />
              <MetaAdsKpi
                label="Clics enlace"
                value={formatInt(campaign.link_clicks)}
                tip="Clics en el enlace. No equivalen a visitas a la web."
              />
              <MetaAdsKpi
                label="Visitas destino"
                value={formatInt(campaign.landing_page_views)}
                tip="Llegadas reales a la página de destino."
              />
              <MetaAdsKpi label="Leads Meta" value={formatInt(campaign.leads_meta)} tip="Conversiones que Meta atribuye a esta campaña." />
              <MetaAdsKpi label="Leads CRM" value={formatInt(campaign.crm_leads)} tip="Personas que han entrado al CRM con este campaign_id." />
              <MetaAdsKpi label="CPC" value={formatMoney(campaign.cpc, currency)} tip="Gasto dividido entre clics en enlace del periodo." />
              <MetaAdsKpi
                label="Coste/lead"
                value={formatMoney(campaign.cost_per_lead, currency)}
                tip="Gasto dividido entre leads que reporta Meta."
              />
            </div>

            <Funnel campaign={campaign} />
            <MetaAdsCampaignCharts campaign={campaign} />

            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Leads de esta campaña</h2>
              <MetaAdsLeadsTable
                rows={leads}
                loading={leadsLoading}
                showCampaign={false}
                empty="Ningún lead del CRM está ligado a esta campaña en el periodo."
              />
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
    return { props: {} }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
}
