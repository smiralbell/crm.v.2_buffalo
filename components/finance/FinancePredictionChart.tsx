'use client'

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts'

export type EvolutionPoint = {
  month: string
  /** Facturado real (solo pasado) */
  historico?: number | null
  /** Ingreso mes sin nuevos cierres (baseline MRR / media) */
  sin_cierre?: number | null
  /** Ingreso mes si se cierran los seleccionados / hipótesis */
  proyeccion?: number | null
  is_future?: boolean
}

function fmtEur(n: number) {
  return `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`
}

export default function FinancePredictionChart({
  data,
  height = 280,
}: {
  data: EvolutionPoint[]
  height?: number
}) {
  const splitIndex = data.findIndex((d) => d.is_future)
  const splitLabel = splitIndex > 0 ? data[splitIndex - 1]?.month : null

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="predHist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9CA3AF" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#9CA3AF" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="predProj" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34D399" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff18" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={18}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
        />
        <Tooltip
          formatter={(value: number, name: string) => [fmtEur(value), name]}
          contentStyle={{
            borderRadius: 12,
            border: '1px solid #374151',
            background: '#030712',
            color: '#fff',
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#9CA3AF' }} />
        {splitLabel && (
          <ReferenceLine
            x={splitLabel}
            stroke="#6B7280"
            strokeDasharray="4 4"
            label={{ value: 'hoy', fill: '#9CA3AF', fontSize: 10, position: 'insideTopRight' }}
          />
        )}
        <Area
          type="monotone"
          dataKey="historico"
          name="Facturado (pasado)"
          stroke="#9CA3AF"
          fill="url(#predHist)"
          strokeWidth={2}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="sin_cierre"
          name="Sin cierres nuevos"
          stroke="#F59E0B"
          strokeWidth={1.75}
          strokeDasharray="5 4"
          dot={false}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="proyeccion"
          name="Con cierres"
          stroke="#34D399"
          fill="url(#predProj)"
          strokeWidth={2.5}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** Construye serie: 12 meses reales + 12 futuros (baseline vs escenario). */
export function buildEvolutionSeries(opts: {
  timeline: Array<{ label: string; invoiced_eur: number }>
  /** MRR / ingreso mensual base actual (sin nuevos cierres) */
  baselineMonthly: number
  /** Setup que entra el primer mes futuro */
  setupTotal: number
  /** MRR añadido por los cierres */
  mrrAdded: number
  futureMonths?: number
}): EvolutionPoint[] {
  const futureN = opts.futureMonths ?? 12
  const past = opts.timeline.map((t) => ({
    month: t.label,
    historico: t.invoiced_eur,
    sin_cierre: null as number | null,
    proyeccion: null as number | null,
    is_future: false,
  }))

  // Puente: último mes pasado también marca baseline para continuidad visual
  if (past.length > 0) {
    const last = past[past.length - 1]
    last.sin_cierre = last.historico
    last.proyeccion = last.historico
  }

  const future: EvolutionPoint[] = []
  for (let i = 1; i <= futureN; i++) {
    const setup = i === 1 ? opts.setupTotal : 0
    const baseline = opts.baselineMonthly
    const withCloses = baseline + opts.mrrAdded + setup
    future.push({
      month: `+${i}m`,
      historico: null,
      sin_cierre: Math.round(baseline),
      proyeccion: Math.round(withCloses),
      is_future: true,
    })
  }

  return [...past, ...future]
}
