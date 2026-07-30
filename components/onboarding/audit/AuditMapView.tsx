'use client'

import { useMemo, useState, type MouseEvent } from 'react'
import {
  buildAuditChecklist,
  groupChecklistByTopic,
  importanceLabel,
  TOPIC_LABELS,
  type ChecklistItem,
} from '@/lib/onboarding/audit/checklist'
import type { ProjectAudit } from '@/lib/onboarding/audit/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Check, StickyNote } from 'lucide-react'

export function AuditMapView({
  audit,
  saving,
  onMapUpdate,
}: {
  audit: ProjectAudit | null
  saving?: boolean
  onMapUpdate: (payload: {
    field_key: string
    map_checked?: boolean
    note?: string | null
  }) => Promise<void> | void
}) {
  const items = useMemo(() => buildAuditChecklist(audit), [audit])
  const groups = useMemo(() => groupChecklistByTopic(items), [items])
  const [active, setActive] = useState<ChecklistItem | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [checkedDraft, setCheckedDraft] = useState(false)

  const openItem = (item: ChecklistItem) => {
    setActive(item)
    setNoteDraft(item.note || '')
    setCheckedDraft(item.map_checked || item.covered)
  }

  const checkedCount = items.filter((i) => i.map_checked || i.covered).length

  const saveNote = async () => {
    if (!active) return
    await onMapUpdate({
      field_key: active.field_key,
      map_checked: checkedDraft,
      note: noteDraft.trim() || null,
    })
    setActive(null)
  }

  const quickToggle = async (item: ChecklistItem, e: MouseEvent) => {
    e.stopPropagation()
    const next = !(item.map_checked || item.covered)
    await onMapUpdate({ field_key: item.field_key, map_checked: next })
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-6 sm:px-7">
      <div className="max-w-5xl mx-auto">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2">Vista espacial</p>
            <h2 className="text-[1.65rem] font-semibold tracking-tight text-zinc-900">
              Mapa de la auditoría
            </h2>
            <p className="mt-2 text-[15px] text-zinc-500 max-w-lg leading-relaxed">
              Tacha lo que ya habéis tocado. Clic en una tarjeta para dejar una nota rápida.
            </p>
          </div>
          <div className="rounded-[1.35rem] bg-zinc-50 ring-1 ring-zinc-200/70 px-4 py-3 text-sm text-zinc-600">
            <span className="font-semibold text-zinc-900 tabular-nums">
              {checkedCount}/{items.length}
            </span>{' '}
            marcadas
          </div>
        </header>

        <div className="space-y-8">
          {groups.map(({ topic, items: topicItems }) => {
            const done = topicItems.filter((i) => i.map_checked || i.covered).length
            const allDone = done === topicItems.length && topicItems.length > 0
            return (
              <section key={topic}>
                <div className="flex items-center gap-3 mb-3 px-1">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      allDone ? 'bg-emerald-500' : done > 0 ? 'bg-amber-400' : 'bg-zinc-300'
                    }`}
                  />
                  <h3 className="text-sm font-semibold text-zinc-900">{TOPIC_LABELS[topic]}</h3>
                  <span className="text-[11px] text-zinc-400 tabular-nums">
                    {done}/{topicItems.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {topicItems.map((item) => {
                    const checked = item.map_checked || item.covered
                    const critical = item.importance === 'critical'
                    return (
                      <button
                        key={item.field_key}
                        type="button"
                        onClick={() => openItem(item)}
                        className={`group text-left rounded-[1.45rem] p-4 ring-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-24px_rgba(0,0,0,0.35)] ${
                          checked
                            ? 'bg-zinc-100/80 ring-zinc-200/60'
                            : critical
                              ? 'bg-white ring-zinc-300/90 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                              : 'bg-white ring-zinc-200/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2.5">
                          <button
                            type="button"
                            aria-label={checked ? 'Desmarcar' : 'Marcar'}
                            onClick={(e) => void quickToggle(item, e)}
                            className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              checked
                                ? 'bg-zinc-900 text-white'
                                : 'bg-zinc-100 text-transparent group-hover:text-zinc-300 ring-1 ring-zinc-200'
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <div className="flex items-center gap-1.5">
                            {item.note && (
                              <StickyNote className="h-3.5 w-3.5 text-amber-600/80" />
                            )}
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full ${
                                critical
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-zinc-100 text-zinc-500'
                              }`}
                            >
                              {importanceLabel(item.importance)}
                            </span>
                          </div>
                        </div>
                        <p
                          className={`text-[13.5px] leading-snug ${
                            checked
                              ? 'text-zinc-400 line-through decoration-zinc-300'
                              : 'text-zinc-800'
                          }`}
                        >
                          {item.question}
                        </p>
                        {item.note && (
                          <p className="mt-2 text-[11px] text-zinc-500 line-clamp-2">{item.note}</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      <Dialog open={Boolean(active)} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-md rounded-[1.75rem] border-zinc-200/80 p-0 overflow-hidden gap-0">
          <div className="px-6 pt-6 pb-4">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-900 pr-6">
                {active ? TOPIC_LABELS[active.topic] : 'Nota'}
              </DialogTitle>
            </DialogHeader>
            {active && (
              <p className="mt-2 text-sm text-zinc-600 leading-relaxed">{active.question}</p>
            )}
          </div>
          <div className="px-6 pb-6 space-y-4">
            <label className="flex items-center gap-3 rounded-[1.15rem] bg-zinc-50 ring-1 ring-zinc-200/70 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={checkedDraft}
                onChange={(e) => setCheckedDraft(e.target.checked)}
                className="h-4 w-4 rounded-md border-zinc-300"
              />
              <span className="text-sm text-zinc-800">Marcar como tratada en la reunión</span>
            </label>
            <div>
              <label className="text-[12px] font-medium text-zinc-500 mb-1.5 block">Nota</label>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={4}
                placeholder="Algo que no quieres olvidar…"
                className="w-full resize-none rounded-[1.25rem] border-0 bg-zinc-50 ring-1 ring-zinc-200/80 px-4 py-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900/15"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => setActive(null)}
              >
                Cancelar
              </Button>
              <Button
                className="rounded-2xl"
                disabled={saving}
                onClick={() => void saveNote()}
              >
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
