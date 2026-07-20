import { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import {
  TrendingUp, TrendingDown, Minus,
  ArrowRight,
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
    invoicedThisMonth:    number
    invoicedLastMonth:    number
    invoicedYTD:          number
    pipelineValue:        number
    pipelineDeals:        number
    pendingInvoices:      number  // draft invoices count (= "sin cobrar")
    pendingAmount:        number  // draft invoices total
    mrrAmount:            number  // monthly recurring revenue (maintenance)
    dealsClosedThisMonth: number
    leadsThisMonth:       number
    leadsTotal:           number
    contactsTotal:        number
  }
  pipelineStages: StageRow[]
  recentInvoices:  InvRow[]
  hotLeads:        LeadRow[]
  monthlyRevenue:  MonthRow[]
}

// ── Config ─────────────────────────────────────────────────────────────
const ANNUAL_TARGET = 250_000

const fmt = (v: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

const pct = (curr: number, prev: number) => {
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}

const STAGE_COLORS: Record<string, string> = {
  'LEAD':              '#6B7280',
  'CONTACTO':          '#3B82F6',
  'REUNIÓN':           '#8B5CF6',
  'PROPUESTA ENVIADA': '#F59E0B',
  'NEGOCIANDO':        '#F97316',
  'CONTRATO FIRMADO':  '#10B981',
  'FACTURA EMITIDA':   '#06B6D4',
  'ONBOARDING':        '#6366F1',
  'EN DESARROLLO':     '#2563EB',
  'ACTIVO':            '#22C55E',
  'REMARKETING':       '#EC4899',
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Borrador',  cls: 'bg-muted text-muted-foreground' },
  sent:      { label: 'Enviada',   cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  paid:      { label: 'Cobrada',   cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-500/15 text-red-600 dark:text-red-300' },
}

// ── Server-side data ───────────────────────────────────────────────────
export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)

    const now = new Date()
    const y   = now.getFullYear()
    const m   = now.getMonth()

    const startThisMonth = new Date(y, m, 1)
    const startLastMonth = new Date(y, m - 1, 1)
    const endLastMonth   = new Date(y, m, 0, 23, 59, 59)
    const startYTD       = new Date(y, 0, 1)
    const sixMonthsAgo   = new Date(y, m - 5, 1)

    // ── Invoices ──────────────────────────────────────────────────────
    const [invThisMonth, invLastMonth, invYTD, draftInvoices, recentInvRaw] = await Promise.all([
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
      // "Sin cobrar" = solo borradores (status: draft)
      prisma.invoice.findMany({
        where: { deleted_at: null, status: 'draft' },
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
      select: { stage: true, amount: true, created_at: true, entity_id: true },
    })

    const stageMap: Record<string, { count: number; amount: number }> = {}
    const pipelineActiveStages = ['CONTACTO', 'REUNIÓN', 'PROPUESTA ENVIADA', 'NEGOCIANDO']
    let pipelineValue   = 0
    let pipelineDeals   = 0
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

    const stageOrder = ['LEAD','CONTACTO','REUNIÓN','PROPUESTA ENVIADA','NEGOCIANDO','CONTRATO FIRMADO','FACTURA EMITIDA','ONBOARDING','EN DESARROLLO','ACTIVO','REMARKETING']
    const pipelineStages: StageRow[] = stageOrder
      .filter(s => stageMap[s])
      .map(s => ({ stage: s, count: stageMap[s].count, amount: stageMap[s].amount }))

    // ── MRR: suma del amount de todas las tarjetas del pipeline de mantenimientos ──
    const mrrPipelines = await prisma.pipelineKanban.findMany({
      where: { name: { contains: 'mantenimiento', mode: 'insensitive' } },
      include: {
        cards: {
          where: { deleted_at: null },
          select: { amount: true },
        },
      },
    })
    const mrrAmount = mrrPipelines
      .flatMap(p => p.cards)
      .reduce((sum, c) => sum + (c.amount ? Number(c.amount) : 0), 0)

    // ── Leads ─────────────────────────────────────────────────────────
    // Leads "activos" = los que tienen tarjeta en el pipeline (cualquier stage)
    // Si no hay suficientes, completamos con los más recientes.
    const pipelineEntityIds = allCards
      .map(c => parseInt(c.entity_id))
      .filter(n => !isNaN(n))

    const [leadsTotal, leadsThisMonth, hotLeadsRaw] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { created_at: { gte: startThisMonth } } }),
      prisma.lead.findMany({
        where: pipelineEntityIds.length > 0
          ? { contact_id: { in: pipelineEntityIds } }
          : {},
        orderBy: [{ valor: 'desc' }, { updated_at: 'desc' }],
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
          invoicedThisMonth:    Number(invThisMonth._sum.total || 0),
          invoicedLastMonth:    Number(invLastMonth._sum.total || 0),
          invoicedYTD:          Number(invYTD._sum.total       || 0),
          pipelineValue,
          pipelineDeals,
          pendingInvoices:      draftInvoices.length,
          pendingAmount:        draftInvoices.reduce((s, i) => s + Number(i.total), 0),
          mrrAmount,
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
        kpis: { invoicedThisMonth:0, invoicedLastMonth:0, invoicedYTD:0, pipelineValue:0, pipelineDeals:0, pendingInvoices:0, pendingAmount:0, mrrAmount:0, dealsClosedThisMonth:0, leadsThisMonth:0, leadsTotal:0, contactsTotal:0 },
        pipelineStages: [], recentInvoices: [], hotLeads: [], monthlyRevenue: [],
      },
    }
  }
}

// ── KPI Card ───────────────────────────────────────────────────────────
function KpiCard({
  title, value, sub, trend, href,
}: {
  title: string; value: string; sub?: string; trend?: number
  href?: string
}) {
  const TrendIcon = trend == null ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus
  const trendCls  = trend == null ? '' : trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'

  const inner = (
    <div className={cn(
      'rounded-2xl border border-border bg-card p-4 sm:p-5 flex flex-col gap-2',
      'hover:shadow-sm hover:border-foreground/15 transition-all h-full',
      href && 'cursor-pointer'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-muted-foreground font-medium leading-snug">{title}</div>
        {TrendIcon && trend != null && (
          <div className={cn('flex items-center gap-1 text-xs font-medium shrink-0', trendCls)}>
            <TrendIcon className="h-3.5 w-3.5" />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="text-xl sm:text-2xl font-semibold text-foreground leading-none tracking-tight break-words">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
  return href ? <Link href={href} className="block">{inner}</Link> : inner
}

// ── Objetivo anual card ────────────────────────────────────────────────
function ObjetivoCard({ invoicedYTD, mrrAmount }: { invoicedYTD: number; mrrAmount: number }) {
  const now  = new Date()
  const year = now.getFullYear()

  // Solo meses ESTRICTAMENTE futuros (tras el mes en curso).
  // El mes actual se asume facturado (o en proceso de serlo) → cae en invoicedYTD.
  // Esto evita doble conteo: mant. ya emitida → invoicedYTD; mant. futura → proyección.
  // Ej: Junio (getMonth()=5) → 11-5 = 6 meses futuros (Jul–Dic)
  const futureMonths   = Math.max(0, 11 - now.getMonth())
  const currentMonthName = now.toLocaleDateString('es-ES', { month: 'long' })

  // Proyección MRR: importe mensual × meses futuros + IVA 21%
  const mrrProjected   = Math.round(mrrAmount * futureMonths * 1.21)
  const totalProjected = invoicedYTD + mrrProjected

  // Porcentajes para la barra segmentada
  const billedPct = Math.min(100, (invoicedYTD / ANNUAL_TARGET) * 100)
  const mrrPct    = Math.min(100 - billedPct, (mrrProjected / ANNUAL_TARGET) * 100)
  const totalPct  = Math.min(100, (totalProjected / ANNUAL_TARGET) * 100)

  const remaining = Math.max(0, ANNUAL_TARGET - totalProjected)
  const exceeded  = totalProjected > ANNUAL_TARGET

  return (
    <div className="rounded-2xl border border-border bg-card p-5">

      {/* ── Cabecera ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">Objetivo anual {year}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Meta: {fmt(ANNUAL_TARGET)}</div>
        </div>
        <div className="sm:text-right">
          <div className="text-2xl font-semibold text-foreground leading-none tracking-tight">{fmt(totalProjected)}</div>
          <div className="text-xs text-muted-foreground mt-1">{totalPct.toFixed(1)}% del objetivo</div>
        </div>
      </div>

      {/* ── Barra segmentada: facturado YTD + MRR futuro ── */}
      <div className="w-full bg-muted rounded-full h-2.5 mb-1.5 overflow-hidden flex">
        {billedPct > 0 && (
          <div
            className="h-full flex-shrink-0 transition-all duration-700 bg-foreground dark:bg-white"
            style={{
              width: `${billedPct}%`,
              background: exceeded ? '#22C55E' : undefined,
              borderRadius: billedPct >= 100 ? '9999px' : '9999px 0 0 9999px',
            }}
          />
        )}
        {mrrPct > 0 && (
          <div
            className="h-full flex-shrink-0 transition-all duration-700 bg-muted-foreground/40"
            style={{
              width: `${mrrPct}%`,
              borderRadius: billedPct + mrrPct >= 100 ? '0 9999px 9999px 0' : '0',
            }}
          />
        )}
      </div>

      {/* ── Leyenda ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-foreground inline-block flex-shrink-0" />
          Facturado hasta {currentMonthName}
        </span>
        {mrrAmount > 0 && futureMonths > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/50 inline-block flex-shrink-0" />
            MRR ×{futureMonths} meses futuros
          </span>
        )}
      </div>

      {/* ── Desglose ── */}
      <div className="grid grid-cols-1 gap-3 border-t border-border pt-3.5 sm:grid-cols-3 sm:gap-4">

        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">YTD facturado</div>
          <div className="text-sm font-bold text-foreground">{fmt(invoicedYTD)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">setup + mant. emitido</div>
        </div>

        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            MRR {futureMonths > 0 ? `×${futureMonths} meses` : '(dic cerrado)'}
          </div>
          <div className="text-sm font-bold text-foreground/80">
            {mrrAmount > 0 && futureMonths > 0 ? fmt(mrrProjected) : '—'}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {mrrAmount > 0
              ? futureMonths > 0
                ? `${fmt(mrrAmount)}/mes + IVA`
                : 'año completado'
              : 'sin contratos activos'}
          </div>
        </div>

        <div className="sm:text-right">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {exceeded ? 'Superado' : 'Falta'}
          </div>
          <div className={`text-sm font-bold ${exceeded ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
            {exceeded ? `+${fmt(totalProjected - ANNUAL_TARGET)}` : fmt(remaining)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {exceeded ? '¡objetivo alcanzado!' : 'para llegar al objetivo'}
          </div>
        </div>

      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
export default function Dashboard({ kpis, pipelineStages, recentInvoices, hotLeads, monthlyRevenue }: DashboardProps) {
  const trendMonth = pct(kpis.invoicedThisMonth, kpis.invoicedLastMonth)
  const maxCount   = Math.max(...pipelineStages.map(s => s.count), 1)

  const estadoLabel: Record<string, string> = {
    frio:'Frío', caliente:'Caliente', reunion:'Reunión',
    propuesta:'Propuesta', negociando:'Negociando', cerrado:'Cerrado', activo:'Activo',
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* ── Objetivo anual ── */}
        <ObjetivoCard invoicedYTD={kpis.invoicedYTD} mrrAmount={kpis.mrrAmount} />

        {/* ── KPIs fila 1: facturación ── */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiCard
            title="Facturado este mes"
            value={fmt(kpis.invoicedThisMonth)}
            sub={`mes anterior: ${fmt(kpis.invoicedLastMonth)}`}
            trend={kpis.invoicedLastMonth > 0 ? trendMonth : undefined}
            href="/invoices"
          />
          <KpiCard
            title="Facturado en el año"
            value={fmt(kpis.invoicedYTD)}
            sub="acumulado desde enero"
            href="/invoices"
          />
          <KpiCard
            title="Sin cobrar"
            value={kpis.pendingAmount > 0 ? fmt(kpis.pendingAmount) : '—'}
            sub={
              kpis.pendingInvoices > 0
                ? `${kpis.pendingInvoices} factura${kpis.pendingInvoices !== 1 ? 's' : ''} en borrador`
                : 'Sin borradores pendientes'
            }
            href="/invoices"
          />
          <KpiCard
            title="MRR · Mantenimientos"
            value={kpis.mrrAmount > 0 ? fmt(kpis.mrrAmount) : '—'}
            sub={kpis.mrrAmount > 0 ? 'ingresos recurrentes / mes' : 'Sin contratos activos'}
            href="/invoices"
          />
        </div>

        {/* ── KPIs fila 2: pipeline / leads ── */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiCard
            title="Pipeline activo"
            value={fmt(kpis.pipelineValue)}
            sub={`${kpis.pipelineDeals} deal${kpis.pipelineDeals !== 1 ? 's' : ''} en curso`}
            href="/pipelines"
          />
          <KpiCard title="Total leads"          value={String(kpis.leadsTotal)}            sub={`+${kpis.leadsThisMonth} este mes`} href="/leads" />
          <KpiCard title="Contratos firmados"   value={String(kpis.dealsClosedThisMonth)} sub="este mes"                          href="/pipelines" />
          <KpiCard title="Contactos"            value={String(kpis.contactsTotal)}                                                href="/contacts" />
        </div>

        {/* ── Gráfico + Embudo ── */}
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-foreground">Facturación mensual (6 meses)</h2>
              <Link href="/invoices" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                Ver facturas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <RevenueChart data={monthlyRevenue} />
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-foreground">Embudo de ventas</h2>
              <Link href="/pipelines" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                Abrir pipeline <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {pipelineStages.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-muted-foreground">Sin datos de pipeline todavía</p>
                <Link href="/pipelines" className="text-xs text-muted-foreground hover:text-foreground underline transition-colors">Ir al pipeline →</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {pipelineStages.map(s => {
                  const color    = STAGE_COLORS[s.stage] || '#6B7280'
                  const widthPct = Math.max(4, Math.round((s.count / maxCount) * 100))
                  return (
                    <div key={s.stage} className="flex items-center gap-3">
                      <div className="w-28 sm:w-36 flex-shrink-0 text-[11px] font-semibold text-muted-foreground truncate">{s.stage}</div>
                      <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                        <div
                          className="h-full rounded-full flex items-center justify-end pr-2 transition-all"
                          style={{ width: `${widthPct}%`, backgroundColor: color }}
                        >
                          {s.count >= 2 && (
                            <span className="text-[9px] font-bold text-white leading-none">{s.count}</span>
                          )}
                        </div>
                      </div>
                      <div className="w-6 flex-shrink-0 text-center">
                        <span className="text-xs font-bold text-foreground">{s.count}</span>
                      </div>
                      <div className="w-16 sm:w-20 flex-shrink-0 text-right text-[11px] font-medium text-muted-foreground tabular-nums">
                        {s.amount > 0 ? fmt(s.amount) : ''}
                      </div>
                    </div>
                  )
                })}
                <div className="flex items-center justify-end gap-1 pt-1 text-[10px] text-muted-foreground/70">
                  <span>nº tarjetas · importe estimado</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Facturas + Leads activos ── */}
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Últimas facturas</h2>
              <Link href="/invoices" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {recentInvoices.length === 0 ? (
              <div className="h-32 flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-muted-foreground">Sin facturas todavía</p>
                <Link href="/invoices/new" className="text-xs text-muted-foreground hover:text-foreground underline">Nueva factura →</Link>
              </div>
            ) : (
              <div className="space-y-0.5">
                {recentInvoices.map(inv => {
                  const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft
                  return (
                    <Link
                      key={inv.id}
                      href={`/invoices/${inv.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/70 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-semibold text-muted-foreground">{inv.invoice_number}</span>
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none', cfg.cls)}>
                            {cfg.label}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-foreground truncate mt-0.5">{inv.client_name}</div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-sm font-bold text-foreground">{fmt(inv.total)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(inv.issue_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Leads en pipeline</h2>
              <Link href="/leads" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                Ver todos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {hotLeads.length === 0 ? (
              <div className="h-32 flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-muted-foreground">Sin leads activos</p>
                <Link href="/leads/new" className="text-xs text-muted-foreground hover:text-foreground underline">Añadir lead →</Link>
              </div>
            ) : (
              <div className="space-y-0.5">
                {hotLeads.map(lead => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/70 transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                      {(lead.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{lead.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {lead.empresa || estadoLabel[lead.estado || ''] || 'Lead'}
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {lead.valor && <span className="text-sm font-bold text-foreground/80">{fmt(lead.valor)}</span>}
                      <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Acciones rápidas ── */}
        <div className="rounded-2xl border border-border bg-card/80 px-5 py-5 text-center">
          <p className="text-xs font-medium text-muted-foreground mb-4">Acciones rápidas</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { label: 'Nueva factura',       href: '/invoices/new' },
              { label: 'Nuevo lead',          href: '/leads' },
              { label: 'Ver pipeline',        href: '/pipelines' },
              { label: 'Configurar proyecto', href: '/onboarding' },
              { label: 'Finanzas',            href: '/finances' },
            ].map(a => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center gap-1.5 px-4 h-9 rounded-xl bg-card border border-border text-xs font-medium text-foreground/80 hover:border-foreground/20 hover:shadow-sm transition-all"
              >
                {a.label}
              </Link>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  )
}
