import { useState, useEffect, useCallback } from 'react'
import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Megaphone, TrendingUp, Users, Calendar, DollarSign,
  Mail, MousePointerClick, BarChart3, RefreshCw,
  ChevronDown, ArrowUpRight, ArrowDownRight, Clock,
  CheckCircle2, XCircle, AlertCircle, Zap, Phone,
} from 'lucide-react'
import ColdCallingTab from '@/components/ColdCallingTab'

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
  label, value, sub, icon: Icon, color = 'gray', trend,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  color?: 'gray' | 'green' | 'blue' | 'orange' | 'purple' | 'red'
  trend?: { value: string; up: boolean } | null
}) {
  const colors = {
    gray:   'bg-gray-900 text-white',
    green:  'bg-emerald-500 text-white',
    blue:   'bg-blue-500 text-white',
    orange: 'bg-orange-500 text-white',
    purple: 'bg-purple-500 text-white',
    red:    'bg-red-500 text-white',
  }
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">{label}</p>
            <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
            {sub && <p className="text-xs text-gray-400">{sub}</p>}
            {trend && (
              <div className={`flex items-center gap-1 text-xs font-medium ${trend.up ? 'text-emerald-600' : 'text-red-500'}`}>
                {trend.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {trend.value}
              </div>
            )}
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
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
    <div className="flex flex-col items-center justify-center py-24 space-y-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        <BarChart3 className="h-8 w-8 text-gray-400" />
      </div>
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold text-gray-700">{name}</h3>
        <p className="text-sm text-gray-400 max-w-xs">
          Este canal todavía no tiene datos. Cuando empiece a generar métricas aparecerán aquí automáticamente.
        </p>
      </div>
      <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">
        Coming soon
      </Badge>
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'global',      label: 'Métricas Globales', icon: TrendingUp },
  { id: 'email',       label: 'Email Outreach',     icon: Mail },
  { id: 'coldcalling', label: 'Cold Calling',       icon: Phone },
  { id: 'meta',        label: 'Meta Ads',           icon: Megaphone },
  { id: 'google',      label: 'Google Ads',         icon: MousePointerClick },
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
      <div className="space-y-6 max-w-6xl">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Marketing · Engranaje 1</h1>
              <p className="text-sm text-gray-500">Captación y conversión de leads</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Period selector */}
            {data && data.periods.length > 0 && (
              <div className="relative">
                <select
                  value={period}
                  onChange={e => handlePeriod(e.target.value)}
                  className="appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm font-medium bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  {data.periods.map(p => (
                    <option key={p} value={p}>{periodLabel(p)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => load(period)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 -mb-2">
          <div className="flex gap-0">
            {TABS.map(t => {
              const Icon = t.icon
              const isActive = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id as typeof tab)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              )
            })}
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
                icon={Users}
                color="blue"
              />
              <KpiCard
                label="Reuniones"
                value={fmt(data.global.meetingsBooked)}
                sub={`${data.meetingTasks} pendientes`}
                icon={Calendar}
                color="purple"
              />
              <KpiCard
                label="Cierres"
                value={fmt(data.global.closedLeads)}
                sub="leads → cliente"
                icon={CheckCircle2}
                color="green"
              />
              <KpiCard
                label="Cash Collected"
                value={data.global.cashCollected > 0 ? `${fmt(data.global.cashCollected)} €` : '—'}
                sub="valor leads cerrados"
                icon={DollarSign}
                color="gray"
              />
              <KpiCard
                label="Inversión total"
                value={data.global.totalSpend > 0 ? `${fmt(data.global.totalSpend)} €` : '—'}
                sub="todos los canales"
                icon={TrendingUp}
                color="orange"
              />
              <KpiCard
                label="CAC"
                value={data.global.cac != null ? `${fmt(data.global.cac)} €` : '—'}
                sub="coste adquisición"
                icon={Zap}
                color="red"
              />
              <KpiCard
                label="Emails enviados"
                value={fmt(data.global.emailsSent)}
                sub={`${fmt(data.global.contactsSent)} contactos únicos`}
                icon={Mail}
                color="blue"
              />
              <KpiCard
                label="Tasa de respuesta"
                value={pct(data.global.replies, data.global.contactsSent)}
                sub={`${fmt(data.global.replies)} respuestas`}
                icon={BarChart3}
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
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                            <Mail className="h-4 w-4 text-gray-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800 capitalize">
                              {m.channel.replace('_', ' ')}
                            </p>
                            <p className="text-xs text-gray-400">
                              {m.spend > 0 ? `${fmt(Number(m.spend))} € invertidos` : 'Sin inversión registrada'}
                            </p>
                          </div>
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
              <KpiCard
                label="Emails enviados"
                value={fmt(emailMetric?.emails_sent)}
                sub="este período"
                icon={Mail}
                color="blue"
              />
              <KpiCard
                label="Contactos únicos"
                value={fmt(emailMetric?.contacts_sent)}
                sub="sin repetidos"
                icon={Users}
                color="blue"
              />
              <KpiCard
                label="Respuestas"
                value={fmt(emailMetric?.replies)}
                sub={pct(emailMetric?.replies ?? 0, emailMetric?.contacts_sent ?? 0) + ' tasa respuesta'}
                icon={BarChart3}
                color="purple"
              />
              <KpiCard
                label="Interesados"
                value={fmt(emailMetric?.interested)}
                sub={pct(emailMetric?.interested ?? 0, emailMetric?.replies ?? 0) + ' de respuestas'}
                icon={Zap}
                color="green"
              />
              <KpiCard
                label="Reuniones"
                value={fmt(emailMetric?.meetings_booked)}
                sub="booked via Instantly"
                icon={Calendar}
                color="purple"
              />
              <KpiCard
                label="No interesados"
                value={fmt(emailMetric?.not_interested)}
                sub=""
                icon={XCircle}
                color="red"
              />
              <KpiCard
                label="Bounces"
                value={fmt(emailMetric?.bounced)}
                sub={pct(emailMetric?.bounced ?? 0, emailMetric?.emails_sent ?? 0) + ' tasa bounce'}
                icon={AlertCircle}
                color="orange"
              />
              <KpiCard
                label="Bajas"
                value={fmt(emailMetric?.unsubscribed)}
                sub="unsubscribes"
                icon={XCircle}
              />
            </div>

            {/* Funnel */}
            {emailMetric && emailMetric.contacts_sent > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-700">Embudo de conversión · {periodLabel(period)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FunnelBar label="Contactos alcanzados" count={emailMetric.contacts_sent} total={emailMetric.contacts_sent} color="bg-blue-400" />
                  <FunnelBar label="Respuestas" count={emailMetric.replies} total={emailMetric.contacts_sent} color="bg-purple-400" />
                  <FunnelBar label="Interesados" count={emailMetric.interested} total={emailMetric.contacts_sent} color="bg-emerald-400" />
                  <FunnelBar label="Reuniones" count={emailMetric.meetings_booked} total={emailMetric.contacts_sent} color="bg-indigo-400" />
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
                          <Clock className="h-3.5 w-3.5 text-gray-300" />
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
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 flex gap-3">
              <Zap className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-blue-800">Webhook de Instantly activo</p>
                <p className="text-blue-600 mt-0.5">
                  Configura en Instantly → Integrations → Webhooks:
                </p>
                <code className="mt-1 block text-xs bg-blue-100 rounded px-2 py-1 text-blue-800 break-all">
                  POST https://n8n-crmv2-buffalo.zedf6b.easypanel.host/api/webhooks/instantly
                </code>
                <p className="text-blue-500 text-xs mt-1">
                  Header: <code>Authorization: Bearer buf-instantly-2026</code>
                </p>
              </div>
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
