import type { AuditBlockProgress } from '@/lib/onboarding/audit/blocks'
import { overallBlockProgress } from '@/lib/onboarding/audit/blocks'

function statusDot(status: AuditBlockProgress['status']) {
  if (status === 'completed') return 'bg-emerald-500'
  if (status === 'incomplete') return 'bg-amber-400'
  return 'bg-zinc-300'
}

export function AuditBlockNav({
  blocks,
  activeBlock,
  disabled,
  onSelect,
}: {
  blocks: AuditBlockProgress[]
  activeBlock?: string | null
  disabled?: boolean
  onSelect: (blockId: string) => void
}) {
  const overall = overallBlockProgress(blocks)

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3.5 pt-4 pb-3 shrink-0">
        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-400 mb-1">Bloques</p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-900 tabular-nums">
            {overall.completed}/{overall.total}
          </p>
          <span className="text-[11px] text-zinc-500">{overall.percent}%</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-zinc-900 transition-all"
            style={{ width: `${overall.percent}%` }}
          />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {blocks.map((b) => {
          const active = activeBlock === b.id
          return (
            <button
              key={b.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(b.id)}
              className={`w-full text-left flex items-start gap-2.5 rounded-[1.1rem] px-3 py-2.5 transition-colors disabled:opacity-40 ${
                active
                  ? 'bg-zinc-900 text-white'
                  : 'hover:bg-zinc-50 text-zinc-700'
              }`}
            >
              <span
                className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                  active ? 'bg-white/80' : statusDot(b.status)
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className={`block text-[12.5px] font-medium leading-snug ${active ? 'text-white' : 'text-zinc-800'}`}>
                  {b.label}
                </span>
                <span className={`block text-[10px] mt-0.5 ${active ? 'text-white/60' : 'text-zinc-400'}`}>
                  {b.status === 'completed'
                    ? 'Completado'
                    : b.status === 'incomplete'
                      ? `${b.sufficiency}% · ${b.critical_missing.length} críticos`
                      : 'Pendiente'}
                </span>
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
