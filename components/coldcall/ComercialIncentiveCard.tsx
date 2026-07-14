'use client'

import { Sparkles } from 'lucide-react'
import {
  COMMISSION,
  formatEur,
  projectCommission,
  type CloseRateSource,
} from '@/lib/coldcall/commission'

interface ComercialIncentiveCardProps {
  meetingsThisWeek: number
  pipelineMeetings?: number
  closeRate?: number
  closeRateSource?: CloseRateSource
  compact?: boolean
  periodLabel?: string
}

export default function ComercialIncentiveCard({
  meetingsThisWeek,
  pipelineMeetings,
  closeRate,
  closeRateSource,
  compact = false,
  periodLabel = 'Esta semana',
}: ComercialIncentiveCardProps) {
  const week = projectCommission({
    meetings: meetingsThisWeek,
    closeRate,
    closeRateSource,
  })
  const pipeline =
    pipelineMeetings != null
      ? projectCommission({ meetings: pipelineMeetings, closeRate, closeRateSource })
      : null

  if (compact) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-emerald-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-900">
            {formatEur(week.perSaleCommission)} por venta cerrada
          </p>
          <p className="text-xs text-emerald-700/80">
            10% de {formatEur(COMMISSION.saleTicketEur)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-amber-50/40 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="rounded-xl bg-emerald-600 p-2.5 shrink-0">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Tu comisión · {periodLabel.toLowerCase()}
            </p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums mt-0.5">
              {formatEur(week.commissionEur)}
            </p>
            <p className="text-xs text-gray-500 mt-1.5">
              Ticket {formatEur(COMMISSION.saleTicketEur)} · cierre {week.closeRatePct}% ·{' '}
              {Math.round(COMMISSION.commissionRate * 100)}% comisión por venta
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <IncentiveStat
            label="Por venta cerrada"
            value={formatEur(week.perSaleCommission)}
            hint={`10% de ${formatEur(COMMISSION.saleTicketEur)}`}
          />
          {pipeline && pipeline.meetings > 0 && (
            <IncentiveStat
              label="En cartera"
              value={formatEur(pipeline.commissionEur)}
              hint={`${pipeline.meetings} próxima${pipeline.meetings === 1 ? '' : 's'}`}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function IncentiveStat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-xl border border-white/80 bg-white/70 px-4 py-2.5 min-w-[140px] shadow-sm">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-[11px] text-gray-400 leading-snug">{hint}</p>
    </div>
  )
}
