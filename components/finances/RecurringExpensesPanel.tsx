import { fmtEur } from '@/lib/finance/chart-theme'
import type { RecurringExpensesSummary } from '@/lib/finance/types'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

function ExpenseRow({ item }: { item: RecurringExpensesSummary['items'][0] }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{item.label}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {item.frequency} · {item.count} pagos
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-red-700 tabular-nums">
            {fmtEur(item.monthly_equivalent)}
          </p>
          <p className="text-[10px] text-gray-400">/mes</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge variant="outline" className="text-[10px] font-normal">
          Ahorro si cortas: −{fmtEur(item.monthly_equivalent)}/mes
        </Badge>
        <span className="text-[10px] text-gray-400 tabular-nums">
          último {item.last_date.slice(8, 10)}/{item.last_date.slice(5, 7)}
        </span>
      </div>
    </div>
  )
}

export default function RecurringExpensesPanel({
  data,
  compact = false,
}: {
  data: RecurringExpensesSummary
  compact?: boolean
}) {
  const groups = data.groups?.length ? data.groups : []

  if (data.count === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-500">
        No hay gastos recurrentes detectados en este período. Usa conceptos normalizados (NOMINA, DEV,
        MKT, PLT) para clasificarlos mejor.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <p className="text-xs text-gray-500">Gasto recurrente estimado</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">{fmtEur(data.monthly_total)}/mes</p>
          <p className="text-[11px] text-gray-400">
            {fmtEur(data.annual_total)}/año · {data.count} líneas · {groups.length} categorías
          </p>
        </div>
        {!compact && (
          <Link href="/finances/expenses" className="text-xs text-violet-700 hover:underline">
            Ver en Gastos →
          </Link>
        )}
      </div>

      <div className={`space-y-4 overflow-y-auto pr-1 ${compact ? 'max-h-80' : 'max-h-[32rem]'}`}>
        {groups.map((group) => (
          <div key={group.bucket}>
            <div className="flex items-center justify-between mb-2 sticky top-0 bg-white/95 py-1 z-10">
              <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">{group.label}</p>
              <p className="text-xs font-medium text-red-700 tabular-nums">
                {fmtEur(group.monthly_total)}/mes
              </p>
            </div>
            <div className="space-y-2">
              {group.items.map((item) => (
                <ExpenseRow key={item.vendor_key} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
