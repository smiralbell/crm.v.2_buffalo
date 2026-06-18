import { useState, useEffect, useCallback } from 'react'
import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  RefreshCw, ChevronDown, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import ColdCallingTab from '@/components/ColdCallingTab'
import EmailOutreachTab from '@/components/EmailOutreachTab'

// ── Types ────────────────────────────────────────────────────────────────────

interface MetricRow {
  id: number
  channel: string
  period: string
  spend: number
  emails_sent: number
  contacts_sent: number
  replies: number
  interested: number
  not_interested: number
  bounced: number
  unsubscribed: number
  meetings_booked: number
  impressions: number | null
  clicks: number | null
  notes: string | null
}

interface EmailLead {
  id: number
  estado: string | null
  prioridad: string | null
  valor: number | null
  created_at: string
  contact: {
    nombre: string | null
    email: string | null
    empresa: string | null
  } | null
}

interface MarketingData {
  period: string
  periods: string[]
  global: {
    totalLeads: number
    meetingsBooked: number
    totalSpend: number
    emailsSent: number
    contactsSent: number
    replies: number
    interested: number
    bounced: number
    unsubscribed: number
    notInterested: number
    closedLeads: number
    cashCollected: number
    cac: number | null
  }
  metrics: MetricRow[]
  emailHistory: MetricRow[]
  emailLeads: EmailLead[]
  meetingTasks: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null) return '—'
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function pct(num: number, den: number): string {
  if (!den) return '0%'
  return ((num / den) * 100).toFixed(1) + '%'
}

function periodLabel(p: string) {
  const [y, m] = p.split('-')
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${months[parseInt(m) - 1]} ${y}`
}

const estadoColors: Record<string, string> = {
  frio:       'bg-blue-50 text-blue-700',
  caliente:   'bg-orange-50 text-orange-700',
  cerrado:    'bg-green-50 text-green-700',
  cliente:    'bg-emerald-50 text-emerald-700',
  perdido:    'bg-red-50 text-red-700',
  reunion:    'bg-purple-50 text-purple-700',
  propuesta:  'bg-yellow-50 text-yellow-700',
}
const estadoLabel: Record<string, string> = {
  frio: 'Frío', caliente: 'Caliente', cerrado: 'Cerrado',
  cliente: 'Cliente', perdido: 'Perdido', reunion: 'Reunión',
  propuesta: 'Propuesta',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, trend,
}: {
  label: string
  value: string
  sub?: string
  trend?: { value: string; up: boolean } | null
}) {
  return (
    <Card className="shadow-sm border-gray-200/80">
      <CardContent className="pt-5 pb-4">
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 leading-tight">{value}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trend.up ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {trend.value}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function FunnelBar({
  label, count, total, color,
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
        <span className="font-semibold text-gray-800">{fmt(count)} <span className="text-gray-400 font-normal">({pct(count, total)})</span></span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  )
}

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
  { id: 'email',       label: 'Email Outreach' },
  { id: 'coldcalling', label: 'Cold Calling' },
  { id: 'meta',        label: 'Meta Ads' },
  { id: 'google',      label: 'Google Ads' },
]

// ── Main Page ─────────────────────────────────────────────────────────────────

const VALID_TABS = ['global', 'email', 'coldcalling', 'meta', 'google'] as const
type TabId = typeof VALID_TABS[number]

export default function MarketingPage() {
  const router = useRouter()
  const tabFromUrl = VALID_TABS.includes(router.query.tab as TabId) ? router.query.tab as TabId : 'global'
  const [tab, setTab] = useState<TabId>(tabFromUrl)
  const [data, setData] = useState<MarketingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('')

  // Sync tab with URL param
  useEffect(() => {
    if (tabFromUrl !== tab) setTab(tabFromUrl)
  }, [tabFromUrl])

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
    load(p)
  }

  const emailMetric = data?.metrics.find(m => m.channel === 'email_outreach')

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">

        {/* Toolbar: tabs centered + period controls */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 justify-center overflow-x-auto border-b border-gray-200 lg:border-b-0 lg:pb-0">
            <div className="flex gap-0">
              {TABS.map(t => {
                const isActive = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTab(t.id as typeof tab)
                      router.push({ pathname: '/marketing', query: { tab: t.id } }, undefined, { shallow: true })
                    }}
                    className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors rounded-t-lg ${
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
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => load(period)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-28 bg-gray-100 rounded-xl" />
            ))}
          </div>
        )}

        {/* No data yet */}
        {!loading && !data && (
          <div className="rounded-xl border border-dashed border-gray-200 p-16 text-center">
            <p className="text-gray-400 text-sm">No hay datos de marketing todavía.</p>
            <p className="text-gray-400 text-xs mt-1">Conecta Instantly para que los datos empiecen a llegar automáticamente.</p>
          </div>
        )}

        {/* ── GLOBAL TAB ───────────────────────────────────────────────────── */}
        {!loading && data && tab === 'global' && (
          <div className="space-y-6">

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                label="Leads captados"
                value={fmt(data.global.interested + data.global.replies)}
                sub="respuestas + interesados"
              />
              <KpiCard
                label="Reuniones"
                value={fmt(data.global.meetingsBooked)}
                sub={`${data.meetingTasks} pendientes`}
              />
              <KpiCard
                label="Cierres"
                value={fmt(data.global.closedLeads)}
                sub="leads → cliente"
              />
              <KpiCard
                label="Cash Collected"
                value={data.global.cashCollected > 0 ? `${fmt(data.global.cashCollected)} €` : '—'}
                sub="valor leads cerrados"
              />
              <KpiCard
                label="Inversión total"
                value={data.global.totalSpend > 0 ? `${fmt(data.global.totalSpend)} €` : '—'}
                sub="todos los canales"
              />
              <KpiCard
                label="CAC"
                value={data.global.cac != null ? `${fmt(data.global.cac)} €` : '—'}
                sub="coste adquisición"
              />
              <KpiCard
                label="Emails enviados"
                value={fmt(data.global.emailsSent)}
                sub={`${fmt(data.global.contactsSent)} contactos únicos`}
              />
              <KpiCard
                label="Tasa de respuesta"
                value={pct(data.global.replies, data.global.contactsSent)}
                sub={`${fmt(data.global.replies)} respuestas`}
              />
            </div>

            {/* Channel breakdown */}
            {data.metrics.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-700">Canales activos · {periodLabel(period)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-gray-50">
                    {data.metrics.map(m => (
                      <div key={m.id} className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-800 capitalize">
                            {m.channel.replace('_', ' ')}
                          </p>
                          <p className="text-xs text-gray-400">
                            {m.spend > 0 ? `${fmt(Number(m.spend))} € invertidos` : 'Sin inversión registrada'}
                          </p>
                        </div>
                        <div className="flex items-center gap-6 text-right">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{fmt(m.contacts_sent)}</p>
                            <p className="text-xs text-gray-400">contactos</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{fmt(m.replies)}</p>
                            <p className="text-xs text-gray-400">respuestas</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{fmt(m.meetings_booked)}</p>
                            <p className="text-xs text-gray-400">reuniones</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── EMAIL OUTREACH TAB ────────────────────────────────────────────── */}
        {!loading && data && tab === 'email' && (
          <div className="space-y-6">

            {/* KPIs email */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Emails enviados" value={fmt(emailMetric?.emails_sent)} sub="este período" />
              <KpiCard label="Contactos únicos" value={fmt(emailMetric?.contacts_sent)} sub="sin repetidos" />
              <KpiCard
                label="Respuestas"
                value={fmt(emailMetric?.replies)}
                sub={pct(emailMetric?.replies ?? 0, emailMetric?.contacts_sent ?? 0) + ' tasa respuesta'}
              />
              <KpiCard
                label="Interesados"
                value={fmt(emailMetric?.interested)}
                sub={pct(emailMetric?.interested ?? 0, emailMetric?.replies ?? 0) + ' de respuestas'}
              />
              <KpiCard label="Reuniones" value={fmt(emailMetric?.meetings_booked)} sub="booked via Instantly" />
              <KpiCard label="No interesados" value={fmt(emailMetric?.not_interested)} />
              <KpiCard
                label="Bounces"
                value={fmt(emailMetric?.bounced)}
                sub={pct(emailMetric?.bounced ?? 0, emailMetric?.emails_sent ?? 0) + ' tasa bounce'}
              />
              <KpiCard label="Bajas" value={fmt(emailMetric?.unsubscribed)} sub="unsubscribes" />
            </div>

            {/* Funnel */}
            {emailMetric && emailMetric.contacts_sent > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-700">Embudo de conversión · {periodLabel(period)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FunnelBar label="Contactos alcanzados" count={emailMetric.contacts_sent} total={emailMetric.contacts_sent} color="bg-gray-700" />
                  <FunnelBar label="Respuestas" count={emailMetric.replies} total={emailMetric.contacts_sent} color="bg-gray-600" />
                  <FunnelBar label="Interesados" count={emailMetric.interested} total={emailMetric.contacts_sent} color="bg-gray-500" />
                  <FunnelBar label="Reuniones" count={emailMetric.meetings_booked} total={emailMetric.contacts_sent} color="bg-gray-400" />
                </CardContent>
              </Card>
            )}

            {/* Monthly trend */}
            {data.emailHistory.length > 1 && (
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-700">Tendencia mensual</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase tracking-wide border-b">
                          <th className="text-left pb-2 font-medium">Mes</th>
                          <th className="text-right pb-2 font-medium">Contactos</th>
                          <th className="text-right pb-2 font-medium">Respuestas</th>
                          <th className="text-right pb-2 font-medium">% Resp.</th>
                          <th className="text-right pb-2 font-medium">Interesados</th>
                          <th className="text-right pb-2 font-medium">Reuniones</th>
                          <th className="text-right pb-2 font-medium">Inversión</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.emailHistory.map(h => (
                          <tr key={h.period} className={`${h.period === period ? 'bg-blue-50' : ''}`}>
                            <td className="py-2 font-medium text-gray-800">
                              {periodLabel(h.period)}
                              {h.period === period && <span className="ml-2 text-xs text-blue-500">actual</span>}
                            </td>
                            <td className="py-2 text-right text-gray-600">{fmt(h.contacts_sent)}</td>
                            <td className="py-2 text-right text-gray-600">{fmt(h.replies)}</td>
                            <td className="py-2 text-right text-gray-600">{pct(h.replies, h.contacts_sent)}</td>
                            <td className="py-2 text-right text-gray-600">{fmt(h.interested)}</td>
                            <td className="py-2 text-right text-gray-600">{fmt(h.meetings_booked)}</td>
                            <td className="py-2 text-right text-gray-600">{Number(h.spend) > 0 ? `${fmt(Number(h.spend))} €` : '500 €'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Leads from email outreach */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-700">
                    Leads en CRM · Email Outreach
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">{data.emailLeads.length} contactos</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {data.emailLeads.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-sm text-gray-400">Todavía no hay leads de email outreach.</p>
                    <p className="text-xs text-gray-400 mt-1">Llegarán automáticamente cuando alguien responda en Instantly.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 -mx-2">
                    {data.emailLeads.map(lead => (
                      <a
                        key={lead.id}
                        href={`/leads/${lead.id}`}
                        className="flex items-center justify-between px-2 py-3 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
                            {(lead.contact?.nombre || lead.contact?.email || '?')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`}
                            </p>
                            {lead.contact?.empresa && (
                              <p className="text-xs text-gray-400 truncate">{lead.contact.empresa}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {lead.valor && (
                            <span className="text-xs font-semibold text-gray-700">{fmt(lead.valor)} €</span>
                          )}
                          <Badge
                            className={`text-xs ${estadoColors[lead.estado ?? 'frio'] ?? 'bg-gray-100 text-gray-600'}`}
                          >
                            {estadoLabel[lead.estado ?? 'frio'] ?? lead.estado}
                          </Badge>
                          <span className="text-xs text-gray-400">
                            {new Date(lead.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Webhook info banner */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
              <div className="text-sm">
                <p className="font-medium text-gray-800">Webhook de Instantly activo</p>
                <p className="text-gray-500 mt-0.5">
                  Configura en Instantly → Integrations → Webhooks:
                </p>
                <code className="mt-2 block text-xs bg-white rounded-lg border border-gray-200 px-2 py-1.5 text-gray-700 break-all">
                  POST https://n8n-crmv2-buffalo.zedf6b.easypanel.host/api/webhooks/instantly
                </code>
                <p className="text-gray-400 text-xs mt-1">
                  Header: <code>Authorization: Bearer buf-instantly-2026</code>
                </p>
              </div>
            </div>

            {/* Webhook Monitor */}
            <div className="mt-8 pt-8 border-t border-gray-200">
              <EmailOutreachTab />
            </div>
          </div>
        )}

        {/* ── COLD CALLING TAB ─────────────────────────────────────────────── */}
        {tab === 'coldcalling' && (
          <ColdCallingTab />
        )}

        {/* ── META ADS TAB ─────────────────────────────────────────────────── */}
        {!loading && data && tab === 'meta' && (
          <ComingSoon name="Meta Ads" />
        )}

        {/* ── GOOGLE ADS TAB ───────────────────────────────────────────────── */}
        {!loading && data && tab === 'google' && (
          <ComingSoon name="Google Ads" />
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
