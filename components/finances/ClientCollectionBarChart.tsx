'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'
import type { ClientCollectionRow } from '@/lib/finance/income-analytics'
import { fmtEur, fmtPct } from '@/lib/finance/chart-theme'

const BAR_FILL = '#475569'
const BAR_FILL_MUTED = '#CBD5E1'

export default function ClientCollectionBarChart({
  data,
  limit = 16,
}: {
  data: ClientCollectionRow[]
  limit?: number
}) {
  const chartData = useMemo(() => {
    return data.slice(0, limit).map((row) => ({
      ...row,
      display_pct: row.collection_pct !== null ? Math.min(100, row.collection_pct) : 0,
      has_invoice: row.invoiced > 0,
      fill: row.invoiced > 0 ? BAR_FILL : BAR_FILL_MUTED,
    }))
  }, [data, limit])

  if (data.length === 0) {
    return (
      <div className="h-48 flex flex-col items-center justify-center text-sm text-slate-400 px-4 text-center gap-1">
        <p>Sin facturas enviadas en este período</p>
        <p className="text-xs">Marca facturas como «Enviada» y vincúlalas al cobro del banco</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-slate-500">
        % del facturado enviado que está vinculado a un cobro del banco
      </p>

      <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 38)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 24, left: 4, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tick={{ fontSize: 11, fill: '#334155' }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine x={100} stroke="#CBD5E1" strokeDasharray="4 4" />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as ClientCollectionRow
              return (
                <div className="bg-slate-900 text-white text-xs px-3 py-2.5 rounded-lg shadow-xl max-w-[260px]">
                  <p className="font-semibold mb-1.5 leading-snug">{row.label}</p>
                  {row.invoiced > 0 ? (
                    <>
                      <p>
                        Cobrado: {fmtEur(row.collected)} de {fmtEur(row.invoiced)}
                      </p>
                      <p className="text-slate-400 mt-1">
                        {row.collection_pct !== null ? fmtPct(row.collection_pct) : '—'} cobrado
                      </p>
                      <p className="text-slate-400">
                        {row.collected_invoice_count}/{row.invoice_count} facturas vinculadas
                      </p>
                      {row.pending > 0 && (
                        <p className="text-slate-300 mt-1">Pendiente: {fmtEur(row.pending)}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-slate-400">
                      {fmtEur(row.collected)} cobrado sin factura emitida en el período
                    </p>
                  )}
                </div>
              )
            }}
            cursor={{ fill: '#F8FAFC' }}
          />
          <Bar dataKey="display_pct" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {chartData.map((entry) => (
              <Cell key={entry.client_key} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {data.length > limit && (
        <p className="text-[10px] text-slate-400 text-right">
          Mostrando {limit} de {data.length} clientes
        </p>
      )}
    </div>
  )
}
