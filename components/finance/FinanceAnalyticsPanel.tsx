'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  currentFinancePeriod,
  type FinanceDashboardAnalytics,
  type PipelineOpenDeal,
  type ProjectMoneyBucket,
} from '@/lib/finance/dashboard-analytics.types'
import FinancePredictionChart, {
  buildEvolutionSeries,
} from '@/components/finance/FinancePredictionChart'
import {
  Banknote,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  Filter,
  Landmark,
  Receipt,
  Repeat,
  Rocket,
  Sparkles,
  Target,
  Wallet,
} from 'lucide-react'

const FinanceTimelineChart = dynamic(() => import('@/components/finance/FinanceTimelineChart'), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-xl bg-gray-100" />,
})

type ApiResponse = FinanceDashboardAnalytics & {
  periods: { value: string; label: string }[]
}

function fmtEur(n: number) {
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`
}

function MiniMoney({ setup, monthly }: { setup: number; monthly: number }) {
  return (
    <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">
      Setup {fmtEur(setup)} · Mens. {fmtEur(monthly)}/mes
    </p>
  )
}

function FinKpi({
  label,
  value,
  hint,
  icon: Icon,
  children,
}: {
  label: string
  value: string
  hint?: string
  icon: React.ElementType
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <p className="text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      {children}
    </div>
  )
}

function ProjectKpi({
  label,
  bucket,
  icon: Icon,
  hint,
}: {
  label: string
  bucket: ProjectMoneyBucket
  icon: React.ElementType
  hint?: string
}) {
  return (
    <FinKpi label={label} value={String(bucket.count)} hint={hint} icon={Icon}>
      <MiniMoney setup={bucket.setup_eur} monthly={bucket.monthly_eur} />
    </FinKpi>
  )
}

const STAGE_FILTERS = [
  { value: 'all', label: 'Todas (abiertas)' },
  { value: 'REUNIÓN', label: 'Reunión' },
  { value: 'PROPUESTA', label: 'Propuesta' },
  { value: 'PENDIENTES', label: 'Pendientes cobro' },
] as const

function dealMatchesFilter(deal: PipelineOpenDeal, filter: string) {
  if (filter === 'all') return true
  if (filter === 'REUNIÓN') return deal.stage === 'REUNIÓN'
  if (filter === 'PROPUESTA') {
    return deal.stage === 'PROPUESTA ENVIADA' || deal.stage === 'PROPUESTA CREADA'
  }
  if (filter === 'PENDIENTES') {
    return ['NEGOCIANDO', 'CONTRATO FIRMADO', 'FACTURA EMITIDA', 'ACEPTADO'].includes(deal.stage)
  }
  return true
}

function baselineFromTimeline(
  timeline: { invoiced_eur: number }[],
  portfolioMrr: number
): number {
  const last3 = timeline.slice(-3).map((t) => t.invoiced_eur)
  const avg = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0
  // Preferencia: media facturado reciente; si es 0, MRR cartera
  return avg > 0 ? avg : portfolioMrr
}

export default function FinanceAnalyticsPanel() {
  const [period, setPeriod] = useState(currentFinancePeriod())
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [panelOpen, setPanelOpen] = useState(true)

  const [predClients, setPredClients] = useState(3)
  const [predSetup, setPredSetup] = useState(4500)
  const [predMonthly, setPredMonthly] = useState(350)

  const [stageFilter, setStageFilter] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [overrideSetup, setOverrideSetup] = useState<Record<string, number>>({})
  const [overrideMonthly, setOverrideMonthly] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/finance/dashboard-analytics?period=${encodeURIComponent(period)}`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Error')
        if (!cancelled) {
          setData(json)
          if (json.averages?.avg_setup_eur > 0) setPredSetup(Math.round(json.averages.avg_setup_eur))
          if (json.averages?.avg_monthly_eur > 0) {
            setPredMonthly(Math.round(json.averages.avg_monthly_eur))
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period])

  const baselineMonthly = useMemo(() => {
    if (!data) return 0
    return baselineFromTimeline(data.timeline, data.kpis.clients_current_monthly_eur)
  }, [data])

  const hypoPrediction = useMemo(() => {
    const clients = Math.max(0, Number(predClients) || 0)
    const setup = Math.max(0, Number(predSetup) || 0)
    const monthly = Math.max(0, Number(predMonthly) || 0)
    const setupTotal = clients * setup
    const mrrAdded = clients * monthly
    const year1 = setupTotal + mrrAdded * 12
    const chart = data
      ? buildEvolutionSeries({
          timeline: data.timeline,
          baselineMonthly,
          setupTotal,
          mrrAdded,
        })
      : []
    return { clients, setup, monthly, setupTotal, mrrAdded, year1, chart }
  }, [predClients, predSetup, predMonthly, data, baselineMonthly])

  const filteredDeals = useMemo(() => {
    const deals = data?.pipeline_open || []
    return deals.filter((d) => dealMatchesFilter(d, stageFilter))
  }, [data, stageFilter])

  const pipelinePrediction = useMemo(() => {
    const deals = data?.pipeline_open || []
    const selected = deals.filter((d) => selectedIds.has(d.card_id))
    let setupTotal = 0
    let mrrAdded = 0
    for (const d of selected) {
      const setup = overrideSetup[d.card_id] ?? d.setup_eur
      const monthly = overrideMonthly[d.card_id] ?? d.monthly_eur
      setupTotal += Math.max(0, setup)
      mrrAdded += Math.max(0, monthly)
    }
    const year1 = setupTotal + mrrAdded * 12
    const chart = data
      ? buildEvolutionSeries({
          timeline: data.timeline,
          baselineMonthly,
          setupTotal,
          mrrAdded,
        })
      : []
    return { selected, setupTotal, mrrAdded, year1, chart }
  }, [data, selectedIds, overrideSetup, overrideMonthly, baselineMonthly])

  function toggleDeal(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const d of filteredDeals) next.add(d.card_id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  const periods = data?.periods || []

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50/80 transition-colors"
        aria-expanded={panelOpen}
      >
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Analítica financiera</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Caja, facturación, proyectos y predicción
            {!panelOpen && data
              ? ` · Banco ${fmtEur(data.kpis.bank_balance_eur)} · Facturado ${fmtEur(data.kpis.invoiced_eur)}`
              : ''}
          </p>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-gray-400 shrink-0 transition-transform ${
            panelOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {panelOpen && (
        <div className="space-y-6 px-5 pb-5 sm:px-6 sm:pb-6 border-t border-gray-100 pt-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <p className="text-xs text-gray-500">Filtro por mes · mismos datos en KPIs y gráficos</p>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[200px] rounded-xl">
                <SelectValue placeholder="Mes" />
              </SelectTrigger>
              <SelectContent>
                {(periods.length
                  ? periods
                  : [{ value: period, label: data?.period_label || period }]
                ).map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {loading && !data ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <FinKpi
                  label="Dinero en banco"
                  value={fmtEur(data.kpis.bank_balance_eur)}
                  hint="Saldo actual"
                  icon={Landmark}
                />
                <FinKpi
                  label="Facturado este mes"
                  value={fmtEur(data.kpis.invoiced_eur)}
                  hint={`Facturas enviadas · ${data.period_label}`}
                  icon={Receipt}
                />
                <FinKpi
                  label="Gastos este mes"
                  value={fmtEur(data.kpis.expenses_eur)}
                  hint="Salidas de banco"
                  icon={CreditCard}
                />
                <FinKpi
                  label="Clientes actuales"
                  value={String(data.kpis.clients_current)}
                  hint="Proyectos Buffalo abiertos"
                  icon={Building2}
                >
                  <MiniMoney
                    setup={data.kpis.clients_current_setup_eur}
                    monthly={data.kpis.clients_current_monthly_eur}
                  />
                </FinKpi>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ProjectKpi
                  label="Proyectos creados"
                  bucket={data.kpis.projects_created}
                  icon={Sparkles}
                  hint="Onboarding"
                />
                <ProjectKpi
                  label="Proyectos comenzados"
                  bucket={data.kpis.projects_started}
                  icon={Rocket}
                  hint="Pasaron a Proyectos / Gestión"
                />
                <ProjectKpi
                  label="Proyectos terminados"
                  bucket={data.kpis.projects_finished}
                  icon={Wallet}
                  hint="Con fecha de fin real"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FinKpi
                  label="Mensualidad cobrada"
                  value={fmtEur(data.kpis.mensualidad_cobrada_eur)}
                  hint="Ingresos recurrentes marcados en banco"
                  icon={Banknote}
                />
                <FinKpi
                  label="Gastos recurrentes"
                  value={fmtEur(data.kpis.recurring_expenses_eur)}
                  hint="SaaS + marketing + servicios profesionales / mes"
                  icon={Repeat}
                />
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  Facturación a lo largo de los meses
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Facturado · cobrado · gastos · mensualidades (últimos 12 meses)
                </p>
                <FinanceTimelineChart data={data.timeline} highlightPeriod={period} />
              </div>

              {/* ── Calculadora 1: hipótesis X clientes ── */}
              <div className="rounded-2xl border border-gray-900 bg-gray-950 text-white p-5 sm:p-6 overflow-hidden relative">
                <div
                  className="pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    background:
                      'radial-gradient(ellipse at 20% 0%, rgba(52,211,153,0.25), transparent 50%), radial-gradient(ellipse at 90% 80%, rgba(59,130,246,0.2), transparent 45%)',
                  }}
                />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-4 w-4 text-emerald-300" />
                    <h3 className="text-sm font-semibold">Predicción · clientes nuevos</h3>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">
                    12 meses reales + 12 proyectados. ¿Qué pasa si cierras X clientes?
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <label className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                        Clientes nuevos
                      </span>
                      <Input
                        type="number"
                        min={0}
                        className="h-10 rounded-xl bg-white/5 border-white/10 text-white"
                        value={predClients}
                        onChange={(e) => setPredClients(Number(e.target.value))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                        Setup € / cliente
                      </span>
                      <Input
                        type="number"
                        min={0}
                        className="h-10 rounded-xl bg-white/5 border-white/10 text-white"
                        value={predSetup}
                        onChange={(e) => setPredSetup(Number(e.target.value))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                        Mensualidad € / cliente
                      </span>
                      <Input
                        type="number"
                        min={0}
                        className="h-10 rounded-xl bg-white/5 border-white/10 text-white"
                        value={predMonthly}
                        onChange={(e) => setPredMonthly(Number(e.target.value))}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">Setup total</p>
                      <p className="text-lg font-bold mt-0.5">{fmtEur(hypoPrediction.setupTotal)}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">MRR nuevo</p>
                      <p className="text-lg font-bold mt-0.5">{fmtEur(hypoPrediction.mrrAdded)}/mes</p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">Año 1</p>
                      <p className="text-lg font-bold mt-0.5 text-emerald-300">
                        {fmtEur(hypoPrediction.year1)}
                      </p>
                    </div>
                  </div>

                  <FinancePredictionChart data={hypoPrediction.chart} />
                </div>
              </div>

              {/* ── Calculadora 2: cerrar leads del pipeline ── */}
              <div className="rounded-2xl border border-indigo-900/60 bg-gradient-to-b from-gray-950 to-indigo-950/40 text-white p-5 sm:p-6 overflow-hidden relative">
                <div
                  className="pointer-events-none absolute inset-0 opacity-30"
                  style={{
                    background:
                      'radial-gradient(ellipse at 80% 0%, rgba(129,140,248,0.35), transparent 55%), radial-gradient(ellipse at 10% 100%, rgba(52,211,153,0.2), transparent 45%)',
                  }}
                />
                <div className="relative space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-indigo-300" />
                      <h3 className="text-sm font-semibold">Predicción · cerrar pipeline</h3>
                    </div>
                    <p className="text-xs text-gray-400">
                      Selecciona leads en reunión / propuesta / pendientes como si se cerraran.
                      Compara con los 12 meses reales.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Filter className="h-3.5 w-3.5 text-gray-500" />
                      <Select value={stageFilter} onValueChange={setStageFilter}>
                        <SelectTrigger className="w-[200px] h-9 rounded-xl bg-white/5 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGE_FILTERS.map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-gray-500">
                        {filteredDeals.length} leads
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectVisible}
                        className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
                      >
                        Seleccionar visibles
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
                    {filteredDeals.length === 0 ? (
                      <p className="text-sm text-gray-500 px-4 py-6 text-center">
                        No hay leads abiertos en este filtro
                      </p>
                    ) : (
                      filteredDeals.map((deal) => {
                        const selected = selectedIds.has(deal.card_id)
                        const setupVal = overrideSetup[deal.card_id] ?? deal.setup_eur
                        const monthlyVal = overrideMonthly[deal.card_id] ?? deal.monthly_eur
                        return (
                          <div
                            key={deal.card_id}
                            className={`flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 ${
                              selected ? 'bg-emerald-500/10' : 'hover:bg-white/[0.03]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleDeal(deal.card_id)}
                              className="flex items-start gap-2.5 flex-1 min-w-0 text-left"
                            >
                              <span
                                className={`mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${
                                  selected
                                    ? 'bg-emerald-400 border-emerald-400 text-gray-950'
                                    : 'border-white/20'
                                }`}
                              >
                                {selected && <Check className="h-3.5 w-3.5" />}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-medium truncate">
                                  {deal.name}
                                  {deal.empresa ? (
                                    <span className="text-gray-500 font-normal">
                                      {' '}
                                      · {deal.empresa}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="text-[11px] text-gray-500">{deal.stage}</span>
                              </span>
                            </button>
                            <div className="flex items-center gap-2 sm:ml-auto pl-7 sm:pl-0">
                              <label className="flex flex-col gap-0.5">
                                <span className="text-[9px] uppercase tracking-wider text-gray-500">
                                  Setup
                                </span>
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-8 w-[100px] rounded-lg bg-white/5 border-white/10 text-white text-xs"
                                  value={setupVal}
                                  onChange={(e) =>
                                    setOverrideSetup((prev) => ({
                                      ...prev,
                                      [deal.card_id]: Number(e.target.value),
                                    }))
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </label>
                              <label className="flex flex-col gap-0.5">
                                <span className="text-[9px] uppercase tracking-wider text-gray-500">
                                  Mens.
                                </span>
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-8 w-[88px] rounded-lg bg-white/5 border-white/10 text-white text-xs"
                                  value={monthlyVal}
                                  onChange={(e) =>
                                    setOverrideMonthly((prev) => ({
                                      ...prev,
                                      [deal.card_id]: Number(e.target.value),
                                    }))
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </label>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">
                        Seleccionados
                      </p>
                      <p className="text-lg font-bold mt-0.5">
                        {pipelinePrediction.selected.length}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">Setup</p>
                      <p className="text-lg font-bold mt-0.5">
                        {fmtEur(pipelinePrediction.setupTotal)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">MRR nuevo</p>
                      <p className="text-lg font-bold mt-0.5">
                        {fmtEur(pipelinePrediction.mrrAdded)}/mes
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">Año 1</p>
                      <p className="text-lg font-bold mt-0.5 text-emerald-300">
                        {fmtEur(pipelinePrediction.year1)}
                      </p>
                    </div>
                  </div>

                  <FinancePredictionChart data={pipelinePrediction.chart} height={300} />
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
