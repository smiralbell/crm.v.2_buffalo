'use client'

import { useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Star, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CATEGORY_LABELS,
  groupKpisByCategory,
  type KpiItem,
} from '@/lib/engranaje5/kpi-layout'

export interface KpiPeriod {
  year: number
  month: number
  label: string
}

interface Props {
  kpis: KpiItem[]
  periods: KpiPeriod[]
  selectedPeriod: KpiPeriod | null
  onPeriodChange: (p: KpiPeriod) => void
  hasData: boolean
}

const CHART_COLORS = ['#111827', '#374151', '#6B7280', '#9CA3AF', '#D1D5DB']

function displayValue(k: KpiItem): string {
  if (k.kpi_value_label) return k.kpi_value_label
  if (k.kpi_value == null) return '—'
  const v = k.kpi_value
  if (k.kpi_unit === '%') return `${(v * 100).toFixed(1)}%`
  if (k.kpi_unit === 'USD') return `$${v.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
  if (Number.isInteger(v)) return v.toLocaleString('es-ES')
  return v.toLocaleString('es-ES', { maximumFractionDigits: 2 })
}

function TrendBadge({ kpi }: { kpi: KpiItem }) {
  if (kpi.trend_direction == null && kpi.trend_vs_prev_month == null) return null
  const dir = kpi.trend_direction
  const pct = kpi.trend_vs_prev_month != null
    ? `${kpi.trend_vs_prev_month > 0 ? '+' : ''}${(kpi.trend_vs_prev_month * 100).toFixed(1)}%`
    : null
  const Icon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus
  const color = dir === 'up' ? 'text-emerald-600' : dir === 'down' ? 'text-red-500' : 'text-gray-400'
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {pct || '—'}
    </span>
  )
}

function GaugeChart({ value, max = 1 }: { value: number | null; max?: number }) {
  const pct = value != null ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const r = 36
  const circ = Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div className="flex flex-col items-center justify-center py-2">
      <svg width="100" height="58" viewBox="0 0 100 58">
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="#111827"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={value != null ? offset : circ}
        />
      </svg>
      <span className="text-lg font-semibold text-gray-900 -mt-4">
        {value != null ? `${pct.toFixed(0)}%` : '—'}
      </span>
    </div>
  )
}

function DonutPlaceholder({ label }: { label: string }) {
  const data = [
    { name: 'A', value: 35 },
    { name: 'B', value: 25 },
    { name: 'C', value: 20 },
    { name: 'D', value: 12 },
    { name: 'E', value: 8 },
  ]
  return (
    <ResponsiveContainer width="100%" height={140}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          cx="50%"
          cy="50%"
          innerRadius={38}
          outerRadius={58}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={0.35} />
          ))}
        </Pie>
        <Tooltip formatter={() => [label, '']} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function BarPlaceholder({ value }: { value: number | null }) {
  const data = value != null
    ? [{ v: value * 0.6 }, { v: value * 0.85 }, { v: value }, { v: value * 0.7 }, { v: value * 0.95 }]
    : [{ v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }]
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <Bar dataKey="v" fill="#111827" radius={[4, 4, 0, 0]} opacity={value != null ? 1 : 0.15} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function LinePlaceholder({ value }: { value: number | null }) {
  const base = value ?? 0
  const data = [
    { v: base * 0.7 }, { v: base * 0.85 }, { v: base * 0.9 },
    { v: base }, { v: base * 0.95 }, { v: base * 1.05 },
  ]
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke="#111827"
          strokeWidth={2}
          dot={false}
          opacity={value != null ? 1 : 0.15}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function KpiChart({ kpi }: { kpi: KpiItem }) {
  const ct = kpi.chart_type
  if (ct === 'gauge') {
    const max = kpi.kpi_unit === '%' ? 1 : kpi.kpi_key === 'nps_score_avg' ? 10 : 100
    return <GaugeChart value={kpi.kpi_value} max={max} />
  }
  if (ct === 'donut') return <DonutPlaceholder label={kpi.kpi_label} />
  if (ct === 'linea' || ct === 'area') return <LinePlaceholder value={kpi.kpi_value} />
  if (ct === 'barras') return <BarPlaceholder value={kpi.kpi_value} />
  return (
    <div className="py-4 text-center">
      <span className="text-3xl font-bold text-gray-900 tabular-nums">{displayValue(kpi)}</span>
      {kpi.kpi_unit && kpi.kpi_value != null && (
        <span className="text-sm text-gray-400 ml-1">{kpi.kpi_unit}</span>
      )}
    </div>
  )
}

function StarKpiCard({ kpi }: { kpi: KpiItem }) {
  return (
    <Card className="border-gray-200 bg-gradient-to-br from-white to-gray-50/80">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
            {kpi.kpi_label}
          </span>
          <TrendBadge kpi={kpi} />
        </div>
        <p className="text-3xl font-bold text-gray-900 tabular-nums">{displayValue(kpi)}</p>
        {kpi.kpi_unit && kpi.kpi_value != null && !kpi.kpi_value_label && (
          <p className="text-xs text-gray-400 mt-0.5">{kpi.kpi_unit}</p>
        )}
      </CardContent>
    </Card>
  )
}

function CategoryKpiCard({ kpi }: { kpi: KpiItem }) {
  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-gray-700">{kpi.kpi_label}</CardTitle>
          <TrendBadge kpi={kpi} />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {kpi.chart_type === 'numero' ? (
          <p className="text-2xl font-semibold text-gray-900 tabular-nums">{displayValue(kpi)}</p>
        ) : (
          <KpiChart kpi={kpi} />
        )}
        {kpi.chart_type !== 'numero' && kpi.kpi_value != null && (
          <p className="text-center text-sm font-medium text-gray-600 mt-1">{displayValue(kpi)}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function KpiDashboard({
  kpis,
  periods,
  selectedPeriod,
  onPeriodChange,
  hasData,
}: Props) {
  const starKpis = useMemo(() => kpis.filter((k) => k.is_star_kpi), [kpis])
  const byCategory = useMemo(() => groupKpisByCategory(kpis), [kpis])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Dashboard de KPIs</h2>
        {periods.length > 0 && selectedPeriod && (
          <select
            value={`${selectedPeriod.year}-${selectedPeriod.month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number)
              const p = periods.find((x) => x.year === y && x.month === m)
              if (p) onPeriodChange(p)
            }}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          >
            {periods.map((p) => (
              <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {!hasData && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-900">
          <Info className="h-5 w-5 shrink-0 mt-0.5 text-blue-500" />
          <p>
            Aún no hay datos de uso para este proyecto. Cuando el desarrollador rellene{' '}
            <code className="text-xs bg-blue-100/80 px-1 py-0.5 rounded">engranaje5_data</code>, los KPIs
            aparecerán aquí automáticamente.
          </p>
        </div>
      )}

      {starKpis.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {starKpis.map((k) => (
            <StarKpiCard key={k.kpi_key} kpi={k} />
          ))}
        </div>
      )}

      {Array.from(byCategory.entries()).map(([cat, items]) => (
        <div key={cat} className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {CATEGORY_LABELS[cat] || cat}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((k) => (
              <CategoryKpiCard key={k.kpi_key} kpi={k} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
