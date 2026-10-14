import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MetaAdsKpi({
  label,
  value,
  tip,
  className,
}: {
  label: string
  value: string | null
  tip: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-gray-200/80 bg-white shadow-sm px-4 py-5 min-h-[108px] flex flex-col items-center justify-center text-center',
        className
      )}
    >
      <span className="group absolute top-2.5 right-2.5">
        <Info className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-600 cursor-help" />
        <span className="pointer-events-none absolute right-0 top-6 z-30 hidden group-hover:block w-56 rounded-xl bg-gray-900 px-3 py-2 text-left text-[11px] leading-snug text-white shadow-lg">
          {tip}
        </span>
      </span>
      <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium px-4">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1.5 leading-none tabular-nums">
        {value ?? <span className="text-gray-400 text-lg font-medium">No disponible</span>}
      </p>
    </div>
  )
}

export function formatMoney(n: number | null, currency?: string | null) {
  if (n == null) return null
  return n.toLocaleString('es-ES', {
    style: 'currency',
    currency: currency === 'USD' ? 'USD' : 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatInt(n: number | null) {
  if (n == null) return null
  return n.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}
