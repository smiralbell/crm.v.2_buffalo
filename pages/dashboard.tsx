import { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import {
  TrendingUp, TrendingDown, Minus,
  FileText, Users, Zap, CheckCircle2,
  ArrowRight, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Recharts — client-side only
const RevenueChart = dynamic(() => import('@/components/Dashboard/RevenueChart'), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────
interface StageRow  { stage: string; count: number; amount: number }
interface InvRow    { id: number; invoice_number: string; client_name: string; total: number; status: string; issue_date: string }
interface LeadRow   { id: number; name: string; empresa: string | null; valor: number | null; estado: string | null }
interface MonthRow  { month: string; revenue: number }

interface DashboardProps {
  kpis: {
    invoicedThisMonth:     number
    invoicedLastMonth:     number
    invoicedYTD:           number
    pipelineValue:         number
    pipelineDeals:         number
    pendingInvoices:       number
    pendingAmount:         number
    dealsClosedThisMonth:  number
    leadsThisMonth:        number
    leadsTotal:            number
    contactsTotal:         number
  }
  pipelineStages: StageRow[]
  recentInvoices:  InvRow[]
  hotLeads:        LeadRow[]
  monthlyRevenue:  MonthRow[]
}

// ── Helpers ────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

const pct = (curr: number, prev: number) => {
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}

const STAGE_COLORS: Record<string, string> = {
  'LEAD':               '#6B7280',
  'CONTACTO':           '#3B82F6',
  'REUNIÓN':            '#8B5CF6',
  'PROPUESTA ENVIADA':  '#F59E0B',
  'NEGOCIANDO':         '#F97316',
  'CONTRATO FIRMADO':   '#10B981',
  'FACTURA EMITIDA':    '#06B6D4',
  'ONBOARDING':         '#6366F1',
  'EN DESARROLLO':      '#2563EB',
  'ACTIVO':             '#22C55E',
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Borrador',  cls: 'bg-gray-100 text-gray-600' },
  sent:      { label: 'Enviada',   cls: 'bg-blue-100 text-blue-700' },
  paid:      { label: 'Cobrada',   cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-600' },
}

// ── Server-side data ───────────────────────────────────────────────────
export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)

    const now      = new Date()
    const y        = now.getFullYear()
    const m        = now.getMonth()

    const startThisMonth = new Date(y, m, 1)
    const startLastMonth = new Date(y, m - 1, 1)
    const endLastMonth   = new Date(y, m, 0, 23, 59, 59)
    const startYTD       = new Date(y, 0, 1)
    const sixMonthsAgo   = new Date(y, m - 5, 1)

    // ── Invoices ──────────────────────────────────────────────────────
    const [invThisMonth, invLastMonth, invYTD, invPending, recentInvRaw] = await Promise.all([
      prisma.invoice.aggregate({
        where: { deleted_at: null, issue_date: { gte: startThisMonth } },
        _sum: { total: true },
      }),
      prisma.invoice.aggregate({
        where: { deleted_at: null, issue_date: { gte: startLastMonth, lte: endLastMonth } },
        _sum: { total: true },
      }),
      prisma.invoice.aggregate({
        where: { deleted_at: null, issue_date: { gte: startYTD } },
        _sum: { total: true },
      }),
      prisma.invoice.findMany({
        where: { deleted_at: null, status: { in: ['draft', 'sent'] } },
        select: { id: true, total: true },
      }),
      prisma.invoice.findMany({
        where: { deleted_at: null },
        orderBy: { issue_date: 'desc' },
        take: 8,
        select: { id: true, invoice_number: true, client_name: true, total: true, status: true, issue_date: true },
      }),
    ])

    // ── Pipeline ──────────────────────────────────────────────────────
    const allCards = await prisma.pipelineCard.findMany({
      where: { deleted_at: null },
      select: { stage: true, amount: true, created_at: true },
    })

    const stageMap: Record<string, { count: number; amount: number }> = {}
    const pipelineActiveStages = ['CONTACTO', 'REUNIÓN', 'PROPUESTA ENVIADA', 'NEGOCIANDO']
    let pipelineValue  = 0
    let pipelineDeals  = 0
    let closedThisMonth = 0

    allCards.forEach(c => {
      const s = c.stage
      if (!stageMap[s]) stageMap[s] = { count: 0, amount: 0 }
      stageMap[s].count++
      stageMap[s].amount += c.amount ? Number(c.amount) : 0
      if (pipelineActiveStages.includes(s)) {
        pipelineValue += c.amount ? Number(c.amount) : 0
        pipelineDeals++
      }
      if (s === 'CONTRATO FIRMADO' && c.created_at >= startThisMonth) closedThisMonth++
    })

    const stageOrder = ['LEAD','CONTACTO','REUNIÓN','PROPUESTA ENVIADA','NEGOCIANDO','CONTRATO FIRMADO','FACTURA EMITIDA','ONBOARDING','EN DESARROLLO','ACTIVO']
    const pipelineStages: StageRow[] = stageOrder
      .filter(s => stageMap[s])
      .map(s => ({ stage: s, count: stageMap[s].count, amount: stageMap[s].amount }))

    // ── Leads ─────────────────────────────────────────────────────────
    const [leadsTotal, leadsThisMonth, hotLeadsRaw] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { created_at: { gte: startThisMonth } } }),
      prisma.lead.findMany({
        where: {
          OR: [
            { estado: { in: ['caliente', 'reunion', 'propuesta', 'negociando'] } },
            { valor: { gt: 0 } },
          ],
        },
        orderBy: [{ valor: 'desc' }, { created_at: 'desc' }],
        take: 8,
        include: { contact: { select: { nombre: true, empresa: true } } },
      }),
    ])

    const contactsTotal = await prisma.contact.count()

    // ── Monthly revenue (last 6 months) ───────────────────────────────
    const invoicesForChart = await prisma.invoice.findMany({
      where: { deleted_at: null, issue_date: { gte: sixMonthsAgo } },
      select: { issue_date: true, total: true },
    })

    const monthRevMap: Record<string, number> = {}
    for (let i = 5; i >= 0; i--) {
      const d   = new Date(y, m - i, 1)
      const key = d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
      monthRevMap[key] = 0
    }
    invoicesForChart.forEach(inv => {
      const key = inv.issue_date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
      if (key in monthRevMap) monthRevMap[key] += Number(inv.total)
    })
    const monthlyRevenue: MonthRow[] = Object.entries(monthRevMap).map(([month, revenue]) => ({ month, revenue }))

    return {
      props: {
        kpis: {
          invoicedThisMonth:   Number(invThisMonth._sum.total  || 0),
          invoicedLastMonth:   Number(invLastMonth._sum.total  || 0),
          invoicedYTD:         Number(invYTD._sum.total        || 0),
          pipelineValue,
          pipelineDeals,
          pendingInvoices:     invPending.length,
          pendingAmount:       invPending.reduce((s, i) => s + Number(i.total), 0),
          dealsClosedThisMonth: closedThisMonth,
          leadsThisMonth,
          leadsTotal,
          contactsTotal,
        },
        pipelineStages,
        recentInvoices: recentInvRaw.map(i => ({
          id: i.id,
          invoice_number: i.invoice_number,
          client_name: i.client_name,
          total: Number(i.total),
          status: i.status,
          issue_date: i.issue_date.toISOString(),
        })),
        hotLeads: hotLeadsRaw.map(l => ({
          id: l.id,
          name: l.contact?.nombre || `Lead #${l.id}`,
          empresa: l.contact?.empresa ?? null,
          valor: l.valor ? Number(l.valor) : null,
          estado: l.estado,
        })),
        monthlyRevenue,
      },
    }
  } catch (error) {
    if (error instanceof Error && ['No session','Invalid session','Expired session','Invalid token'].includes(error.message)) {
      return { redirect: { destination: '/login', permanent: false } }
    }
    console.error('Dashboard error:', error)
    return {
      props: {
        kpis: { invoicedThisMonth:0, invoicedLastMonth:0, invoicedYTD:0, pipelineValue:0, pipelineDeals:0, pendingInvoices:0, pendingAmount:0, dealsClosedThisMonth:0, leadsThisMonth:0, leadsTotal:0, contactsTotal:0 },
        pipelineStages: [], recentInvoices: [], hotLeads: [], monthlyRevenue: [],
      },
    }
  }
}

// ── KPI card component ─────────────────────────────────────────────────
function KpiCard({
  title, value, sub, trend, icon: Icon, href, accent,
}: {
  title: string; value: string; sub?: string; trend?: number
  icon: React.ComponentType<{ className?: string }>; href?: string; accent?: string
}) {
  const TrendIcon = trend == null ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus
  const trendCls  = trend == null ? '' : trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'

  const inner = (
    <div className={cn(
      'rounded-2xl border border-gray-200 bg-white p-5 flex flex-col gap-3',
      'hover:shadow-md hover:border-gray-300 transition-all h-full',
      href && 'cursor-pointer'
    )}>
      <div className="flex items-start justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', accent || 'bg-gray-100')}>
          <Icon className={cn('h-5 w-5', accent ? 'text-white' : 'text-gray-600')} />
        </div>
        {TrendIcon && trend != null && (
          <div className={cn('flex items-center gap-1 text-xs font-semibold', trendCls)}>
            <TrendIcon className="h-3.5 w-3.5" />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 leading-none tracking-tight">{value}</div>
        <div className="text-xs text-gray-500 mt-1.5 font-semibold">{title}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
  return href ? <Link href={href} className="block">{inner}</Link> : inner
}

// ══════════════════════════════════════════════════════════════════════
export default function Dashboard({ kpis, pipelineStages, recentInvoices, hotLeads, monthlyRevenue }: DashboardProps) {
  const now = new Date()
  const monthName = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const trendMonth = pct(kpis.invoicedThisMonth, kpis.invoicedLastMonth)
  const maxStageAmt = Math.max(...pipelineStages.map(s => s.amount), 1)

  const estadoLabel: Record<string, string> = {
    frio:'Frío', caliente:'Caliente', reunion:'Reunión',
    propuesta:'Propuesta', negociando:'Negociando', cerrado:'Cerrado', activo:'Activo',
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5 capitalize">{monthName}</p>
        </div>

        {/* ── KPIs row 1: billing ── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title="Facturado este mes"
            value={fmt(kpis.invoicedThisMonth)}
            sub={`mes anterior: ${fmt(kpis.invoicedLastMonth)}`}
            trend={kpis.invoicedLastMonth > 0 ? trendMonth : undefined}
            icon={TrendingUp}
            accent="bg-gray-900"
            href="/invoices"
          />
          <KpiCard
            title="Facturado en el año"
            value={fmt(kpis.invoicedYTD)}
            sub="acumulado desde enero"
            icon={FileText}
            href="/invoices"
          />
          <KpiCard
            title="Pipeline activo"
            value={fmt(kpis.pipelineValue)}
            sub={`${kpis.pipelineDeals} deal${kpis.pipelineDeals !== 1 ? 's' : ''} en curso`}
            icon={Zap}
            accent="bg-amber-500"
            href="/pipelines"
          />
          <KpiCard
            title="Sin cobrar"
            value={String(kpis.pendingInvoices)}
            sub={kpis.pendingAmount > 0 ? `${fmt(kpis.pendingAmount)} pendientes` : 'Todo al día'}
            icon={kpis.pendingInvoices > 0 ? AlertCircle : CheckCircle2}
            accent={kpis.pendingInvoices > 0 ? 'bg-red-500' : 'bg-green-500'}
            href="/invoices"
          />
        </div>

        {/* ── KPIs row 2: pipeline / leads ── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard title="Total leads"       value={String(kpis.leadsTotal)}            sub={`+${kpis.leadsThisMonth} este mes`} icon={Users}         href="/leads" />
          <KpiCard title="Contactos"         value={String(kpis.contactsTotal)}                                                 icon={Users}         href="/contacts" />
          <KpiCard title="Contratos firmados" value={String(kpis.dealsClosedThisMonth)} sub="este mes"                         icon={CheckCircle2}  href="/pipelines" />
          <KpiCard title="Leads nuevos"      value={String(kpis.leadsThisMonth)}        sub="este mes"                         icon={TrendingUp}    href="/leads" />
        </div>

        {/* ── Chart + Pipeline ── */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Revenue bar chart */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-gray-900">Facturación mensual (6 meses)</h2>
              <Link href="/invoices" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors">
                Ver facturas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <RevenueChart data={monthlyRevenue} />
          </div>

          {/* Pipeline funnel */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-gray-900">Embudo de ventas</h2>
              <Link href="/pipelines" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors">
                Abrir pipeline <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {pipelineStages.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-gray-300">Sin datos de pipeline todavía</p>
                <Link href="/pipelines" className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors">Ir al pipeline →</Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {pipelineStages.map(s => {
                  const color    = STAGE_COLORS[s.stage] || '#6B7280'
                  const widthPct = s.amount > 0
                    ? Math.max(6, Math.round((s.amount / maxStageAmt) * 100))
                    : 4
                  return (
                    <div key={s.stage} className="flex items-center gap-3">
                      <div className="w-[138px] flex-shrink-0 text-[11px] font-semibold text-gray-600 truncate">{s.stage}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${widthPct}%`, backgroundColor: color }}
                        />
                      </div>
                      <div className="w-14 flex-shrink-0 text-right text-[11px] font-bold text-gray-700">{s.count}</div>
                      <div className="w-20 flex-shrink-0 text-right text-[11px] font-semibold text-gray-400">
                        {s.amount > 0 ? fmt(s.amount) : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Invoices + Hot leads ── */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Recent invoices */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900">Últimas facturas</h2>
              <Link href="/invoices" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {recentInvoices.length === 0 ? (
              <div className="h-32 flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-gray-300">Sin facturas todavía</p>
                <Link href="/invoices/new" className="text-xs text-gray-400 hover:text-gray-600 underline">Nueva factura →</Link>
              </div>
            ) : (
              <div className="space-y-0.5">
                {recentInvoices.map(inv => {
                  const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft
                  return (
                    <Link
                      key={inv.id}
                      href={`/invoices/${inv.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-semibold text-gray-400">{inv.invoice_number}</span>
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none', cfg.cls)}>
                            {cfg.label}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-gray-900 truncate mt-0.5">{inv.client_name}</div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-sm font-bold text-gray-900">{fmt(inv.total)}</div>
                        <div className="text-[10px] text-gray-400">
                          {new Date(inv.issue_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Hot leads */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900">Leads activos</h2>
              <Link href="/leads" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors">
                Ver todos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {hotLeads.length === 0 ? (
              <div className="h-32 flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-gray-300">Sin leads activos</p>
                <Link href="/leads/new" className="text-xs text-gray-400 hover:text-gray-600 underline">Añadir lead →</Link>
              </div>
            ) : (
              <div className="space-y-0.5">
                {hotLeads.map(lead => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                      {(lead.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{lead.name}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {lead.empresa || estadoLabel[lead.estado || ''] || 'Lead'}
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {lead.valor && <span className="text-sm font-bold text-gray-700">{fmt(lead.valor)}</span>}
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Quick actions ── */}
        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-5 py-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Acciones rápidas</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Nueva factura',       href: '/invoices/new' },
              { label: 'Nuevo lead',          href: '/leads/new' },
              { label: 'Ver pipeline',        href: '/pipelines' },
              { label: 'Configurar proyecto', href: '/onboarding' },
              { label: 'Finanzas',            href: '/finances' },
            ].map(a => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center gap-1.5 px-4 h-8 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                {a.label} <ArrowRight className="h-3 w-3 text-gray-400" />
              </Link>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  )
}
