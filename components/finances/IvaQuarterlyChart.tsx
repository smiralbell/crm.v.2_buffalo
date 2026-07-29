'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { IvaQuarterPoint } from '@/lib/finance/iva-quarters'
import { fmtEur } from '@/lib/finance/chart-theme'

const TooltipContent = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string; payload?: IvaQuarterPoint }>
  label?: string
}) => {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  return (
    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg max-w-[260px]">
      <p className="text-gray-400 mb-1.5 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span className="text-gray-400">{p.name}</span>
          <span className="font-semibold">{fmtEur(p.value)}</span>
        </div>
      ))}
      {point ? (
        <>
          <div className="flex justify-between gap-4 mt-1.5 pt-1.5 border-t border-gray-700">
            <span className="text-gray-400">Diferencia</span>
            <span
              className={`font-semibold ${
                Math.abs(point.diferencia) < 0.01
                  ? 'text-emerald-400'
                  : point.diferencia > 0
                    ? 'text-amber-300'
                    : 'text-sky-300'
              }`}
            >
              {point.diferencia > 0 ? '+' : ''}
              {fmtEur(point.diferencia)}
            </span>
          </div>
          <p className="text-gray-500 mt-1.5 text-[10px]">
            CRM: cobrado {fmtEur(point.iva_cobrado)} − gastos {fmtEur(point.iva_gastos)}
          </p>
          {point.pago_303_date ? (
            <p className="text-gray-500 mt-1 text-[10px]">
              303 cobrado {point.pago_303_date.slice(8, 10)}/{point.pago_303_date.slice(5, 7)}/
              {point.pago_303_date.slice(0, 4)}
            </p>
          ) : (
            <p className="text-gray-500 mt-1 text-[10px]">Sin pago MODELO 303 aún</p>
          )}
        </>
      ) : null}
    </div>
  )
}

export default function IvaQuarterlyChart({ data }: { data: IvaQuarterPoint[] }) {
  // Solo trimestres con cobro 303: comparar gestoría vs cálculo CRM
  const chartData = data.filter((q) => q.pago_303 > 0)

  if (chartData.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-400">
        Sin cobros I.V.A. MODELO 303 todavía — cuando haya uno, verás gestoría vs cálculo CRM
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          width={42}
        />
        <ReferenceLine y={0} stroke="#E5E7EB" />
        <Tooltip content={<TooltipContent />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar
          dataKey="pago_303"
          name="Cobrado gestoría (303)"
          fill="#0F172A"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Bar
          dataKey="liquidacion"
          name="Cálculo CRM (ingresos − gastos)"
          fill="#E11D48"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
