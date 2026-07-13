import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LeadFieldRow } from '@/lib/coldcall/lead-display'

interface LeadFieldCardsProps {
  leadName: string
  primary: LeadFieldRow[]
  extra: LeadFieldRow[]
  compact?: boolean
}

export function LeadFieldCards({ leadName, primary, extra, compact = false }: LeadFieldCardsProps) {
  const [open, setOpen] = useState(false)
  const allFields = [...primary, ...extra]

  if (compact) {
    return (
      <>
        <div className="flex items-center gap-2 min-w-0">
          <HorizontalFieldScroll>
            {primary.map((c) => (
              <div
                key={`${c.label}-${c.value}`}
                className="shrink-0 rounded-md border border-gray-100 bg-gray-50 px-2 py-1 max-w-[140px]"
                title={`${c.label}: ${c.value}`}
              >
                <p className="text-[9px] text-gray-400 uppercase tracking-wide truncate leading-none">
                  {c.label}
                </p>
                <p className="text-[11px] font-medium text-gray-900 truncate leading-tight mt-0.5">
                  {c.value}
                </p>
              </div>
            ))}
          </HorizontalFieldScroll>
          {extra.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 h-7 px-2.5 text-[11px] rounded-lg gap-1"
              title={`Ver ${extra.length} campos más`}
              onClick={() => setOpen(true)}
            >
              Ver más
              <span className="text-gray-400">+{extra.length}</span>
            </Button>
          )}
        </div>

        <LeadFullInfoDialog
          open={open}
          onOpenChange={setOpen}
          leadName={leadName}
          fields={allFields}
        />
      </>
    )
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 justify-center">
        {primary.map((c) => (
          <div
            key={`${c.label}-${c.value}`}
            className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5 min-w-[100px] max-w-[160px]"
          >
            <p className="text-[10px] text-gray-400 uppercase tracking-wide truncate">{c.label}</p>
            <p className="text-xs font-medium text-gray-900 truncate" title={c.value}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {extra.length > 0 && (
        <div className="flex justify-center pt-1">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto py-0 text-xs text-gray-600"
            onClick={() => setOpen(true)}
          >
            Ver más ({extra.length} campo{extra.length === 1 ? '' : 's'} más)
          </Button>
        </div>
      )}

      <LeadFullInfoDialog
        open={open}
        onOpenChange={setOpen}
        leadName={leadName}
        fields={allFields}
      />
    </>
  )
}

function HorizontalFieldScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState({ left: false, right: false })

  const updateFade = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setFade({
      left: scrollLeft > 2,
      right: scrollLeft + clientWidth < scrollWidth - 2,
    })
  }, [])

  useEffect(() => {
    updateFade()
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(updateFade)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateFade, children])

  return (
    <div className="relative min-w-0 flex-1">
      {fade.left && (
        <div
          className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white via-white/80 to-transparent pointer-events-none z-10"
          aria-hidden
        />
      )}
      {fade.right && (
        <div
          className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white via-white/80 to-transparent pointer-events-none z-10"
          aria-hidden
        />
      )}
      <div
        ref={ref}
        className="flex items-center gap-1.5 min-w-0 overflow-x-auto hide-scrollbar"
        onScroll={updateFade}
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.currentTarget.scrollLeft += e.deltaY
            e.preventDefault()
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}

function LeadFullInfoDialog({
  open,
  onOpenChange,
  leadName,
  fields,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadName: string
  fields: LeadFieldRow[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <DialogTitle className="text-base">Información completa — {leadName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <div
                key={`${field.label}-${field.value}`}
                className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 min-w-0"
              >
                <dt className="text-[10px] uppercase tracking-wide text-gray-500">{field.label}</dt>
                <dd className="text-sm text-gray-900 mt-1 break-words whitespace-pre-wrap">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  )
}
