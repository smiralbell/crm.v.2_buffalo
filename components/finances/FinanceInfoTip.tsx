import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function FinanceInfoTip({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <span className={cn('relative inline-flex group/tip align-middle', className)}>
      <Info
        className="h-3.5 w-3.5 text-gray-400 hover:text-violet-600 cursor-help shrink-0"
        aria-label="Más información"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-gray-700 shadow-lg opacity-0 transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}
