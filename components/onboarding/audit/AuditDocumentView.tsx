import {
  buildAuditChecklist,
  groupChecklistByTopic,
  importanceLabel,
  TOPIC_LABELS,
  type ChecklistItem,
} from '@/lib/onboarding/audit/checklist'
import type { ProjectAudit } from '@/lib/onboarding/audit/types'
import { Check, CircleDashed, MinusCircle } from 'lucide-react'

function StatusPill({ item }: { item: ChecklistItem }) {
  if (item.covered) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
        <Check className="h-3 w-3" /> Cubierta
      </span>
    )
  }
  if (item.skipped) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full">
        <MinusCircle className="h-3 w-3" /> Omitida
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-full">
      <CircleDashed className="h-3 w-3" /> Pendiente
    </span>
  )
}

export function AuditDocumentView({ audit }: { audit: ProjectAudit | null }) {
  const items = buildAuditChecklist(audit)
  const groups = groupChecklistByTopic(items)
  const covered = items.filter((i) => i.covered).length

  return (
    <div className="h-full overflow-y-auto px-5 py-6 sm:px-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2">Guía de reunión</p>
          <h2 className="text-[1.65rem] font-semibold tracking-tight text-zinc-900 leading-snug">
            Documento de preguntas
          </h2>
          <p className="mt-2 text-[15px] text-zinc-500 leading-relaxed max-w-xl">
            Todo lo que deberíamos cubrir, con el porqué. Úsalo como guion o checklist mientras
            habláis.
          </p>
          <div className="mt-5 inline-flex items-center gap-3 rounded-[1.25rem] bg-zinc-50 ring-1 ring-zinc-200/70 px-4 py-2.5 text-sm text-zinc-600">
            <span className="font-medium text-zinc-900 tabular-nums">
              {covered}/{items.length}
            </span>
            cubiertas
            <span className="h-1 w-24 rounded-full bg-zinc-200 overflow-hidden">
              <span
                className="block h-full rounded-full bg-zinc-900 transition-all"
                style={{ width: `${items.length ? (covered / items.length) * 100 : 0}%` }}
              />
            </span>
          </div>
        </header>

        <div className="space-y-10">
          {groups.map(({ topic, items: topicItems }) => (
            <section key={topic}>
              <div className="flex items-baseline gap-3 mb-4">
                <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
                  {TOPIC_LABELS[topic]}
                </h3>
                <span className="text-[11px] text-zinc-400">
                  {topicItems.filter((i) => i.covered).length}/{topicItems.length}
                </span>
              </div>
              <div className="space-y-3">
                {topicItems.map((item) => (
                  <article
                    key={item.field_key}
                    className={`rounded-[1.5rem] px-5 py-4 ring-1 transition-colors ${
                      item.covered
                        ? 'bg-emerald-50/40 ring-emerald-100/80'
                        : item.skipped
                          ? 'bg-amber-50/30 ring-amber-100/70'
                          : 'bg-white ring-zinc-200/80'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <StatusPill item={item} />
                      <span className="text-[11px] text-zinc-400">
                        {importanceLabel(item.importance)}
                        {item.blocks_budget ? ' · bloquea presupuesto' : ''}
                      </span>
                    </div>
                    <p
                      className={`text-[15px] leading-snug text-zinc-900 ${
                        item.covered ? 'line-through decoration-zinc-300' : ''
                      }`}
                    >
                      {item.question}
                    </p>
                    <p className="mt-2 text-[13px] text-zinc-500 leading-relaxed">
                      <span className="font-medium text-zinc-600">Por qué: </span>
                      {item.why}
                    </p>
                    {item.answered_value && (
                      <p className="mt-3 text-[13px] text-zinc-700 bg-white/70 rounded-2xl px-3.5 py-2.5 ring-1 ring-zinc-100">
                        <span className="text-zinc-400 text-[11px] uppercase tracking-wide">
                          Respuesta ·{' '}
                        </span>
                        {item.answered_value}
                      </p>
                    )}
                    {item.note && (
                      <p className="mt-2 text-[12px] text-zinc-500 italic">Nota: {item.note}</p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
