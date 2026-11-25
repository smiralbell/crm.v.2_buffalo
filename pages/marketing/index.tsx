import { useState, useEffect, useCallback, useMemo } from 'react'
import { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, ChevronDown } from 'lucide-react'
import WebMarketingTab from '@/components/WebMarketingTab'
import ColdCallingDashboard from '@/components/coldcall/ColdCallingDashboard'
import ColdCallTeamDashboard from '@/components/coldcall/ColdCallTeamDashboard'
import ColdCallingCampanasTab from '@/components/ColdCallingCampanasTab'
import ColdCallScopeToolbar from '@/components/coldcall/ColdCallScopeToolbar'
import ChannelCostsEditor from '@/components/leads/ChannelCostsEditor'
import MetaAdsDashboard from '@/components/marketing/MetaAdsDashboard'
import MetaAdsConfigButton from '@/components/marketing/MetaAdsConfigButton'
import MarketingOverview from '@/components/marketing/MarketingOverview'
import MarketingPlanCalendar from '@/components/marketing/MarketingPlanCalendar'
import { AddLeadButton, AttributionInbox } from '@/components/marketing/LeadAttribution'
import SalesFunnel from '@/components/marketing/SalesFunnel'
import FollowUps from '@/components/marketing/FollowUps'
import WeeklyReview from '@/components/marketing/WeeklyReview'
import MarketingChannelSection from '@/components/marketing/MarketingChannelSection'
import { parseColdCallFilterParam } from '@/lib/coldcall/api-query'
import type { ColdCallFilter } from '@/lib/coldcall/scope'
import { useAuth } from '@/components/AuthContext'
import { canSeeClientPrices } from '@/lib/price-visibility'
import { cn } from '@/lib/utils'

const LeadsAnalyticsPanel = dynamic(() => import('@/components/leads/LeadsAnalyticsPanel'), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />,
})

const BlogWorkspace = dynamic(() => import('@/components/blog/BlogWorkspace'), {
  ssr: false,
  loading: () => <div className="flex justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" /></div>,
})

// ── Estructura de Marketing ─────────────────────────────────────────────────
// Panel general · Paid · Orgánico · Outbound · Relaciones · Planificación

type SectionId =
  | 'panel'
  | 'embudo'
  | 'seguimiento'
  | 'revision'
  | 'meta'
  | 'google'
  | 'web'
  | 'redes'
  | 'blog'
  | 'coldcalling'
  | 'email'
  | 'relaciones'
  | 'plan'

type GroupId = 'panel' | 'paid' | 'organic' | 'outbound' | 'relations' | 'plan'

/** Google Ads se muestra cuando haya campaña activa (NEXT_PUBLIC_GOOGLE_ADS=1). */
const SHOW_GOOGLE_ADS = process.env.NEXT_PUBLIC_GOOGLE_ADS === '1'

const GROUPS: { id: GroupId; label: string; sections: { id: SectionId; label: string }[] }[] = [
  { id: 'panel', label: 'Panel general', sections: [
      { id: 'panel', label: 'Resumen' },
      { id: 'embudo', label: 'Embudo' },
      { id: 'seguimiento', label: 'Leads parados' },
      { id: 'revision', label: 'Revisión del lunes' },
    ],
  },
  {
    id: 'paid',
    label: 'Paid',
    sections: [
      { id: 'meta', label: 'Meta Ads' },
      ...(SHOW_GOOGLE_ADS ? [{ id: 'google' as const, label: 'Google Ads' }] : []),
    ],
  },
  {
    id: 'organic',
    label: 'Orgánico',
    sections: [
      { id: 'web', label: 'Web · SEO · GEO' },
      { id: 'redes', label: 'Redes sociales' },
      { id: 'blog', label: 'Blog' },
    ],
  },
  {
    id: 'outbound',
    label: 'Outbound',
    sections: [
      { id: 'coldcalling', label: 'Cold calling' },
      { id: 'email', label: 'Email outreach' },
    ],
  },
  { id: 'relations', label: 'Relaciones', sections: [{ id: 'relaciones', label: 'Referidos y partners' }] },
  { id: 'plan', label: 'Planificación', sections: [{ id: 'plan', label: 'Calendario' }] },
]

const ALL_SECTIONS: SectionId[] = ['panel', 'embudo', 'seguimiento', 'revision', 'meta', 'google', 'web', 'redes', 'blog', 'coldcalling', 'email', 'relaciones', 'plan']

const groupOf = (s: SectionId): GroupId =>
  GROUPS.find((g) => g.sections.some((x) => x.id === s))?.id ?? (s === 'google' ? 'paid' : 'panel')

const COLD_CALLING_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'campanas', label: 'Campañas' },
] as const
type ColdCallingSection = typeof COLD_CALLING_SECTIONS[number]['id']

/** Acepta los enlaces antiguos (?tab=global, ?tab=chat…). */
function resolveSection(queryTab: string | string[] | undefined): SectionId {
  const t = Array.isArray(queryTab) ? queryTab[0] : queryTab
  if (t === 'chat') return 'web'
  if (t === 'global') return 'panel'
  return ALL_SECTIONS.includes(t as SectionId) ? (t as SectionId) : 'panel'
}

function resolveColdCallingSection(queryCc: string | string[] | undefined): ColdCallingSection {
  const cc = Array.isArray(queryCc) ? queryCc[0] : queryCc
  if (cc === 'campanas') return 'campanas'
  if (cc === 'equipo') return 'equipo'
  return 'dashboard'
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
function periodLabel(p: string) {
  const [y, m] = p.split('-')
  return `${MONTHS[parseInt(m) - 1]} ${y}`
}
function currentPeriod() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
/** 12 meses atrás + 3 adelante (para planificar), más los que tengan datos. */
function buildPeriods(extra: string[]): string[] {
  const out = new Set<string>(extra)
  const now = new Date()
  for (let i = -3; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return Array.from(out).sort().reverse()
}

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center space-y-3 py-24">
      <div className="space-y-1 text-center">
        <h3 className="text-base font-semibold text-gray-700">{name}</h3>
        <p className="max-w-xs text-sm text-gray-400">
          Este canal todavía no tiene datos. Cuando empiece a generar métricas aparecerán aquí automáticamente.
        </p>
      </div>
      <Badge variant="outline" className="rounded-full border-gray-200 text-xs text-gray-400">
        Próximamente
      </Badge>
    </div>
  )
}

export default function MarketingPage() {
  const router = useRouter()
  const { user } = useAuth()
  // Project manager: ve lo invertido, no lo cobrado a clientes
  const showClientPrices = canSeeClientPrices(user?.role)
  const sectionFromUrl = resolveSection(router.query.tab)
  const ccFromUrl = resolveColdCallingSection(router.query.cc)
  const ccFilterFromUrl = parseColdCallFilterParam(router.query.ccUser, user?.id ?? 0)
  const chatSectionOpen = router.query.section === 'chat' || router.query.tab === 'chat'

  const [section, setSection] = useState<SectionId>(sectionFromUrl)
  const [ccSection, setCcSection] = useState<ColdCallingSection>(ccFromUrl)
  const [ccFilter, setCcFilter] = useState<ColdCallFilter>(ccFilterFromUrl)
  const [coldCallLoading, setColdCallLoading] = useState(false)
  const [coldCallReload, setColdCallReload] = useState(0)
  const [dataPeriods, setDataPeriods] = useState<string[]>([])
  const [period, setPeriod] = useState(currentPeriod())
  const [metaRange, setMetaRange] = useState<{ since: string; until: string } | null>(null)
  const [metaReload, setMetaReload] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  // Al añadir un lead o pulsar Actualizar se recarga también la bandeja de canales
  const [addKey, setAddKey] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (sectionFromUrl !== section) setSection(sectionFromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionFromUrl])
  useEffect(() => {
    if (ccFromUrl !== ccSection) setCcSection(ccFromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ccFromUrl])
  useEffect(() => {
    setCcFilter(ccFilterFromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [String(ccFilterFromUrl)])

  // Meses con métricas guardadas (para el selector)
  const loadPeriods = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/metrics')
      if (res.ok) {
        const json = await res.json()
        setDataPeriods(json.periods || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    loadPeriods()
  }, [loadPeriods])

  const periods = useMemo(() => buildPeriods(dataPeriods), [dataPeriods])
  const group = groupOf(section)
  const groupDef = GROUPS.find((g) => g.id === group)!

  const go = (s: SectionId, cc?: ColdCallingSection) => {
    setSection(s)
    const query: Record<string, string> = { tab: s }
    if (s === 'coldcalling') {
      const c = cc || ccSection
      setCcSection(c)
      query.cc = c
      query.ccUser = ccFilter === 'team' ? 'team' : String(ccFilter)
    }
    router.push({ pathname: '/marketing', query }, undefined, { shallow: true })
  }

  const setColdCallFilter = (filter: ColdCallFilter) => {
    setCcFilter(filter)
    router.push(
      { pathname: '/marketing', query: { tab: 'coldcalling', cc: ccSection, ccUser: filter === 'team' ? 'team' : String(filter) } },
      undefined,
      { shallow: true }
    )
  }

  const refresh = () => {
    if (section === 'coldcalling') {
      setColdCallLoading(true)
      setColdCallReload((n) => n + 1)
      return
    }
    if (section === 'meta') setMetaReload((n) => n + 1)
    setReloadKey((n) => n + 1)
    setAddKey((n) => n + 1)
    loadPeriods()
  }

  const showPeriodSelect = section !== 'blog' && section !== 'coldcalling' && section !== 'seguimiento' && section !== 'revision'

  return (
    <Layout>
      <div className="space-y-5">
        {/* Nivel 1: grupos */}
        <div className="hide-scrollbar overflow-x-auto border-b border-gray-200">
          <div className="flex min-w-max gap-0 sm:justify-center">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => go(g.sections[0].id)}
                className={cn(
                  'whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4',
                  group === g.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Nivel 2: secciones del grupo + controles */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {groupDef.sections.length > 1 &&
              groupDef.sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(s.id)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    section === s.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {s.label}
                </button>
              ))}
            {section === 'coldcalling' && (
              <div className="ml-1 inline-flex rounded-full border border-gray-200 bg-white p-0.5">
                {COLD_CALLING_SECTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => go('coldcalling', c.id)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium',
                      ccSection === c.id ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-800'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {section === 'coldcalling' && ccSection === 'dashboard' && (
              <ChannelCostsEditor
                period={period}
                periodLabel={periodLabel(period)}
                filterChannel="cold_calling"
                triggerLabel="Costes"
                dialogTitle="Costes Cold calling"
              />
            )}
            {section === 'coldcalling' && ccSection !== 'equipo' && (
              <ColdCallScopeToolbar filter={ccFilter} onFilterChange={setColdCallFilter} onRefresh={refresh} loading={coldCallLoading} />
            )}
            {showPeriodSelect && (
              <div className="relative">
                <select
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value)
                    setMetaRange(null)
                  }}
                  className="cursor-pointer appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      {periodLabel(p)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            )}
            {(section === 'meta' || section === 'google' || section === 'email') && (
              <ChannelCostsEditor
                period={period}
                periodLabel={periodLabel(period)}
                filterChannel={section === 'meta' ? 'meta' : section === 'google' ? 'google' : 'email'}
                triggerLabel="Costes"
                dialogTitle={section === 'meta' ? 'Costes Meta Ads' : section === 'google' ? 'Costes Google Ads' : 'Costes Email outreach'}
              />
            )}
            {section === 'meta' && (
              <MetaAdsConfigButton
                period={period}
                onRangeApplied={(since, until) => setMetaRange({ since, until })}
                onSynced={() => setMetaReload((n) => n + 1)}
              />
            )}
            {section !== 'blog' && section !== 'plan' && section !== 'coldcalling' && (
              <AddLeadButton
                onAdded={() => {
                  setReloadKey((n) => n + 1)
                  setAddKey((n) => n + 1)
                }}
              />
            )}
            {(section !== 'coldcalling' || ccSection === 'equipo') && section !== 'blog' && (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={refresh} disabled={loading || coldCallLoading}>
                <RefreshCw className={cn('h-4 w-4', (loading || coldCallLoading) && 'animate-spin')} />
              </Button>
            )}
          </div>
        </div>

        {/* ── Panel general ── */}
        {section === 'panel' && (
          <div className="space-y-6">
            {showClientPrices ? (
              <>
                <MarketingOverview key={`ov-${reloadKey}`} period={period} onOpenPlan={() => go('plan')} />
                <AttributionInbox key={`in-${addKey}`} period={period} onChanged={() => setReloadKey((n) => n + 1)} />
                {/* Detalle completo (el mismo bloque que Dashboard → Analítica de leads) */}
                <LeadsAnalyticsPanel key={`la-${reloadKey}`} period={period} onPeriodChange={setPeriod} hidePeriodSelect defaultOpen={false} />
              </>
            ) : (
              <>
                <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                  El panel general incluye lo cobrado a clientes y solo lo ven los administradores. Tienes acceso a cada canal y a Planificación.
                </p>
                <AttributionInbox key={`in-${addKey}`} period={period} />
              </>
            )}
          </div>
        )}

        {section === 'embudo' && <SalesFunnel key={`em-${reloadKey}`} period={period} />}
        {section === 'seguimiento' && <FollowUps key={`se-${reloadKey}`} />}
        {section === 'revision' && <WeeklyReview key={`re-${reloadKey}`} />}

        {/* ── Paid ── */}
        {section === 'meta' && <MetaAdsDashboard period={period} range={metaRange} reloadToken={metaReload} />}
        {section === 'google' && <ComingSoon name="Google Ads" />}

        {/* ── Orgánico ── */}
        {section === 'web' && <WebMarketingTab key={`web-${reloadKey}`} period={period} initialChatOpen={chatSectionOpen} />}
        {section === 'redes' && (
          <MarketingChannelSection
            key={`redes-${reloadKey}`}
            period={period}
            title="Redes sociales"
            description="Leads que llegan por Instagram, LinkedIn, YouTube, TikTok y recomendaciones de asistentes de IA, y lo planificado en Instagram, LinkedIn, YouTube Shorts y TikTok."
            channels={['instagram', 'linkedin', 'youtube', 'tiktok', 'ai_search']}
            planChannels={['instagram', 'linkedin', 'youtube', 'tiktok']}
          />
        )}
        {section === 'blog' && <BlogWorkspace />}

        {/* ── Outbound ── */}
        {section === 'coldcalling' && ccSection === 'equipo' && (
          <ColdCallTeamDashboard reloadToken={coldCallReload} onLoadingChange={setColdCallLoading} />
        )}
        {section === 'coldcalling' && ccSection === 'dashboard' && (
          <ColdCallingDashboard
            filter={ccFilter}
            onFilterChange={setColdCallFilter}
            reloadToken={coldCallReload}
            hideToolbar
            onLoadingChange={setColdCallLoading}
          />
        )}
        {section === 'coldcalling' && ccSection === 'campanas' && (
          <ColdCallingCampanasTab
            filter={ccFilter}
            onFilterChange={setColdCallFilter}
            reloadToken={coldCallReload}
            hideToolbar
            onLoadingChange={setColdCallLoading}
          />
        )}
        {section === 'email' && (
          <MarketingChannelSection
            key={`email-${reloadKey}`}
            period={period}
            title="Email outreach"
            description="Leads que han llegado por las campañas de correo. El coste se edita en «Costes»."
            channels={['email']}
          />
        )}

        {/* ── Relaciones ── */}
        {section === 'relaciones' && (
          <MarketingChannelSection
            key={`rel-${reloadKey}`}
            period={period}
            title="Referidos y partners"
            description="Clientes que llegan por recomendación, partners, eventos y ponencias. Para que cuenten aquí, pon como origen del lead «referido», «partner» o «evento»."
            channels={['referral', 'event']}
            emptyHint="Ningún lead con origen referido, partner o evento este mes."
          />
        )}

        {/* ── Planificación ── */}
        {section === 'plan' && <MarketingPlanCalendar key={`plan-${period}-${reloadKey}`} period={period} />}
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
