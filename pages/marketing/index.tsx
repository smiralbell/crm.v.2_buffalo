import { useState, useEffect, useCallback, useRef } from 'react'
import { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, ChevronDown, FileText } from 'lucide-react'
import WebMarketingTab from '@/components/WebMarketingTab'
import ColdCallingDashboard from '@/components/coldcall/ColdCallingDashboard'
import ColdCallTeamDashboard from '@/components/coldcall/ColdCallTeamDashboard'
import ColdCallingCampanasTab from '@/components/ColdCallingCampanasTab'
import ColdCallScopeToolbar from '@/components/coldcall/ColdCallScopeToolbar'
import ChannelCostsEditor from '@/components/leads/ChannelCostsEditor'
import MetaAdsDashboard from '@/components/marketing/MetaAdsDashboard'
import MetaAdsConfigButton from '@/components/marketing/MetaAdsConfigButton'
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

// ── Types ────────────────────────────────────────────────────────────────────

interface MetricRow {
  id: number
  channel: string
  period: string
  spend: number
}

interface MarketingData {
  period: string
  periods: string[]
  metrics: MetricRow[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null) return '—'
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function periodLabel(p: string) {
  const [y, m] = p.split('-')
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${months[parseInt(m) - 1]} ${y}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 space-y-3">
      <div className="text-center space-y-1">
        <h3 className="text-base font-semibold text-gray-700">{name}</h3>
        <p className="text-sm text-gray-400 max-w-xs">
          Este canal todavía no tiene datos. Cuando empiece a generar métricas aparecerán aquí automáticamente.
        </p>
      </div>
      <Badge variant="outline" className="text-xs text-gray-400 border-gray-200 rounded-full">
        Próximamente
      </Badge>
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'global',      label: 'Métricas Globales' },
  { id: 'web',         label: 'Web' },
  { id: 'coldcalling', label: 'Cold Calling', hasSubmenu: true },
  { id: 'meta',        label: 'Meta Ads' },
  { id: 'google',      label: 'Google Ads' },
] as const

const COLD_CALLING_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'campanas', label: 'Campañas' },
] as const

const VALID_TABS = ['blog', 'global', 'web', 'coldcalling', 'meta', 'google'] as const
type TabId = typeof VALID_TABS[number]
type ColdCallingSection = typeof COLD_CALLING_SECTIONS[number]['id']

function resolveTab(queryTab: string | string[] | undefined): TabId {
  const t = Array.isArray(queryTab) ? queryTab[0] : queryTab
  if (t === 'chat') return 'web'
  return VALID_TABS.includes(t as TabId) ? (t as TabId) : 'global'
}

function resolveColdCallingFilter(
  queryCcUser: string | string[] | undefined,
  defaultUserId: number
): ColdCallFilter {
  return parseColdCallFilterParam(queryCcUser, defaultUserId)
}

function resolveColdCallingSection(
  queryCc: string | string[] | undefined
): ColdCallingSection {
  const cc = Array.isArray(queryCc) ? queryCc[0] : queryCc
  if (cc === 'campanas') return 'campanas'
  if (cc === 'equipo') return 'equipo'
  return 'dashboard'
}

export default function MarketingPage() {
  const router = useRouter()
  const { user } = useAuth()
  // Project manager: ve lo invertido, no lo cobrado a clientes
  const showClientPrices = canSeeClientPrices(user?.role)
  const tabFromUrl = resolveTab(router.query.tab)
  const ccFromUrl = resolveColdCallingSection(router.query.cc)
  const ccFilterFromUrl = resolveColdCallingFilter(router.query.ccUser, user?.id ?? 0)
  const chatSectionOpen =
    router.query.section === 'chat' || router.query.tab === 'chat'
  const [tab, setTab] = useState<TabId>(tabFromUrl)
  const [ccSection, setCcSection] = useState<ColdCallingSection>(ccFromUrl)
  const [ccHover, setCcHover] = useState(false)
  const [ccMenuPos, setCcMenuPos] = useState<{ top: number; left: number } | null>(null)
  const ccTabRef = useRef<HTMLDivElement>(null)
  const ccCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [data, setData] = useState<MarketingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [coldCallLoading, setColdCallLoading] = useState(false)
  const [coldCallReload, setColdCallReload] = useState(0)
  const [ccFilter, setCcFilter] = useState<ColdCallFilter>(ccFilterFromUrl)
  const [period, setPeriod] = useState('')
  const [metaRange, setMetaRange] = useState<{ since: string; until: string } | null>(null)
  const [metaReload, setMetaReload] = useState(0)

  useEffect(() => {
    if (tabFromUrl !== tab) setTab(tabFromUrl)
  }, [tabFromUrl])

  useEffect(() => {
    if (ccFromUrl !== ccSection) setCcSection(ccFromUrl)
  }, [ccFromUrl])

  useEffect(() => {
    setCcFilter(ccFilterFromUrl)
  }, [ccFilterFromUrl])

  const load = useCallback(async (p?: string) => {
    setLoading(true)
    try {
      const qs = p ? `?period=${p}` : ''
      const res = await fetch(`/api/marketing/metrics${qs}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
        if (!p) setPeriod(json.period)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handlePeriod = (p: string) => {
    setPeriod(p)
    setMetaRange(null)
    load(p)
  }

  const effectivePeriod =
    period ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  const goToTab = (tabId: TabId, cc?: ColdCallingSection) => {
    setTab(tabId)
    if (tabId === 'coldcalling') {
      const section = cc || ccSection
      setCcSection(section)
      const query: Record<string, string> = { tab: tabId }
      if (section === 'campanas') query.cc = 'campanas'
      else if (section === 'equipo') query.cc = 'equipo'
      else query.cc = 'dashboard'
      if (ccFilter !== 'team' && ccFilter) query.ccUser = String(ccFilter)
      if (ccFilter === 'team') query.ccUser = 'team'
      router.push({ pathname: '/marketing', query }, undefined, { shallow: true })
      return
    }
    router.push({ pathname: '/marketing', query: { tab: tabId } }, undefined, { shallow: true })
  }

  const setColdCallFilter = (filter: ColdCallFilter) => {
    setCcFilter(filter)
    const query: Record<string, string> = { tab: 'coldcalling' }
    if (ccSection === 'campanas') query.cc = 'campanas'
    else if (ccSection === 'equipo') query.cc = 'equipo'
    query.ccUser = filter === 'team' ? 'team' : String(filter)
    router.push({ pathname: '/marketing', query }, undefined, { shallow: true })
  }

  const goToColdCalling = (section: ColdCallingSection) => {
    if (ccCloseTimer.current) {
      clearTimeout(ccCloseTimer.current)
      ccCloseTimer.current = null
    }
    setCcHover(false)
    setCcMenuPos(null)
    goToTab('coldcalling', section)
  }

  const openCcMenu = () => {
    if (ccCloseTimer.current) {
      clearTimeout(ccCloseTimer.current)
      ccCloseTimer.current = null
    }
    const rect = ccTabRef.current?.getBoundingClientRect()
    if (rect) {
      setCcMenuPos({ top: rect.bottom + 2, left: rect.left })
    }
    setCcHover(true)
  }

  const closeCcMenu = () => {
    ccCloseTimer.current = setTimeout(() => {
      setCcHover(false)
      setCcMenuPos(null)
    }, 150)
  }

  return (
    <Layout>
      <div className="space-y-6">

        {tab === 'blog' && <BlogWorkspace />}

        {/* Toolbar: tabs centered + period controls. El blog se abre aparte, sin estas pestañas. */}
        {tab !== 'blog' && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="hide-scrollbar flex flex-1 justify-start sm:justify-center border-b border-gray-200 lg:border-b-0 lg:pb-0 overflow-x-auto">
            <div className="flex gap-0 flex-nowrap sm:flex-wrap justify-start sm:justify-center min-w-max sm:min-w-0">
              {TABS.map(t => {
                const isActive = tab === t.id

                if ('hasSubmenu' in t && t.hasSubmenu) {
                  return (
                    <div
                      key={t.id}
                      ref={ccTabRef}
                      className="relative"
                      onMouseEnter={openCcMenu}
                      onMouseLeave={closeCcMenu}
                    >
                      <button
                        type="button"
                        onClick={() => goToColdCalling('dashboard')}
                        className={cn(
                          'whitespace-nowrap px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors rounded-t-lg inline-flex items-center gap-1',
                          isActive
                            ? 'border-gray-900 text-gray-900'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        )}
                      >
                        {t.label}
                        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                      </button>
                    </div>
                  )
                }

                return (
                  <button
                    key={t.id}
                    onClick={() => goToTab(t.id)}
                    className={`whitespace-nowrap px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors rounded-t-lg ${
                      isActive
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 shrink-0">
            {tab === 'coldcalling' ? (
              ccSection === 'equipo' ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => {
                    setColdCallLoading(true)
                    setColdCallReload((n) => n + 1)
                  }}
                  disabled={coldCallLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${coldCallLoading ? 'animate-spin' : ''}`} />
                </Button>
              ) : (
                <>
                  {ccSection === 'dashboard' && (
                    <ChannelCostsEditor
                      period={effectivePeriod}
                      periodLabel={periodLabel(effectivePeriod)}
                      filterChannel="cold_calling"
                      triggerLabel="Costes"
                      dialogTitle="Costes Cold calling"
                    />
                  )}
                  <ColdCallScopeToolbar
                    filter={ccFilter}
                    onFilterChange={setColdCallFilter}
                    onRefresh={() => {
                      setColdCallLoading(true)
                      setColdCallReload((n) => n + 1)
                    }}
                    loading={coldCallLoading}
                  />
                </>
              )
            ) : (
              <>
                {data && data.periods.length > 0 && (
                  <div className="relative">
                    <select
                      value={period}
                      onChange={e => handlePeriod(e.target.value)}
                      className="appearance-none border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm font-medium bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-200"
                    >
                      {data.periods.map(p => (
                        <option key={p} value={p}>{periodLabel(p)}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                )}
                {(tab === 'meta' || tab === 'google') && (
                  <ChannelCostsEditor
                    period={effectivePeriod}
                    periodLabel={periodLabel(effectivePeriod)}
                    filterChannel={tab === 'meta' ? 'meta' : 'google'}
                    triggerLabel="Costes"
                    dialogTitle={tab === 'meta' ? 'Costes Meta Ads' : 'Costes Google Ads'}
                  />
                )}
                {tab === 'meta' && (
                  <MetaAdsConfigButton
                    period={effectivePeriod}
                    onRangeApplied={(since, until) => setMetaRange({ since, until })}
                    onSynced={() => setMetaReload((n) => n + 1)}
                  />
                )}
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => load(period)} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={() => goToTab('blog')}
              className="inline-flex items-center gap-1.5 appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium bg-white text-gray-700 hover:bg-gray-50"
            >
              <FileText className="h-4 w-4" />
              Blog
            </button>
          </div>
        </div>
        )}

        {/* ── WEB TAB ──────────────────────────────────────────────────────── */}
        {tab === 'web' && (
          <WebMarketingTab period={effectivePeriod} initialChatOpen={chatSectionOpen} />
        )}

        {/* ── GLOBAL TAB ───────────────────────────────────────────────────── */}
        {tab === 'global' && (
          <div className="space-y-6">
            {loading && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-28 bg-gray-100 rounded-xl" />
                ))}
              </div>
            )}

            {!loading && data && (
              <>
                {data.metrics.length > 0 && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-gray-700">
                        Canales activos · {periodLabel(period)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="divide-y divide-gray-50">
                        {data.metrics.map((m) => (
                          <div key={m.id} className="flex items-center justify-between py-3">
                            <div>
                              <p className="text-sm font-medium text-gray-800 capitalize">
                                {m.channel.replace('_', ' ')}
                              </p>
                              <p className="text-xs text-gray-400">
                                {m.spend > 0
                                  ? `${fmt(Number(m.spend))} € invertidos`
                                  : 'Sin inversión registrada'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Mismo bloque que Dashboard → Analítica de leads */}
            {showClientPrices && (
            <LeadsAnalyticsPanel
              period={effectivePeriod || undefined}
              onPeriodChange={handlePeriod}
              hidePeriodSelect
              defaultOpen
            />
            )}
          </div>
        )}

        {/* ── COLD CALLING TAB ─────────────────────────────────────────────── */}
        {tab === 'coldcalling' && ccSection === 'equipo' && (
          <ColdCallTeamDashboard
            reloadToken={coldCallReload}
            onLoadingChange={setColdCallLoading}
          />
        )}
        {tab === 'coldcalling' && ccSection === 'dashboard' && (
          <div className="space-y-6">
            <ColdCallingDashboard
              filter={ccFilter}
              onFilterChange={setColdCallFilter}
              reloadToken={coldCallReload}
              hideToolbar
              onLoadingChange={setColdCallLoading}
            />
          </div>
        )}
        {tab === 'coldcalling' && ccSection === 'campanas' && (
          <ColdCallingCampanasTab
            filter={ccFilter}
            onFilterChange={setColdCallFilter}
            reloadToken={coldCallReload}
            hideToolbar
            onLoadingChange={setColdCallLoading}
          />
        )}

        {/* ── META ADS TAB ─────────────────────────────────────────────────── */}
        {tab === 'meta' && (
          <MetaAdsDashboard period={effectivePeriod} range={metaRange} reloadToken={metaReload} />
        )}

        {/* ── GOOGLE ADS TAB ───────────────────────────────────────────────── */}
        {tab === 'google' && (
          <div className="space-y-6">
            <ComingSoon name="Google Ads" />
          </div>
        )}

      </div>

      {ccHover && ccMenuPos && (
        <div
          className="fixed z-[200] min-w-[160px] rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl"
          style={{ top: ccMenuPos.top, left: ccMenuPos.left }}
          onMouseEnter={openCcMenu}
          onMouseLeave={closeCcMenu}
        >
          {COLD_CALLING_SECTIONS.map((section) => {
            const sectionActive = tab === 'coldcalling' && ccSection === section.id

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => goToColdCalling(section.id)}
                className={cn(
                  'block w-full text-left px-4 py-2.5 text-sm font-medium transition-colors',
                  sectionActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {section.label}
              </button>
            )
          })}
        </div>
      )}
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
