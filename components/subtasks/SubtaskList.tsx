import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, FileText, ListChecks, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MAX_SUBTASKS, newSubtask, subtaskProgress, type Subtask } from '@/lib/subtasks'
import SubtaskViewer from '@/components/subtasks/SubtaskViewer'

/** Cuántas subtareas se ven en una tarjeta antes de "Ver todas". */
const COMPACT_VISIBLE = 5

/** Para que escribir o hacer clic dentro no abra ni arrastre la tarjeta. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation()

/** Quita símbolos de formato para el avance de una línea. */
function plainPreview(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface ChipProps {
  subtasks: Subtask[] | undefined
  open: boolean
  onToggle: () => void
  className?: string
}

/** Contador "2/5" de la tarjeta. Al pulsarlo despliega o pliega las subtareas. */
export function SubtaskChip({ subtasks, open, onToggle, className }: ChipProps) {
  const { done, total } = subtaskProgress(subtasks)
  const complete = total > 0 && done === total
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onKeyDown={stop}
      onMouseDown={stop}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
        complete
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100',
        className
      )}
      title={open ? 'Ocultar subtareas' : 'Ver subtareas'}
      aria-expanded={open}
    >
      <ListChecks className="h-3 w-3 shrink-0" />
      <span className="tabular-nums">{total > 0 ? `${done}/${total}` : 'Subtareas'}</span>
      <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')} />
    </button>
  )
}

interface ListProps {
  subtasks: Subtask[] | undefined
  onChange: (next: Subtask[]) => void
  disabled?: boolean
  /** Dentro de una tarjeta: más pequeño y recortado a unas pocas filas. */
  compact?: boolean
  autoFocus?: boolean
  /** Nombre de la tarea padre, se muestra al abrir una subtarea */
  parentTitle?: string
  className?: string
}

/**
 * Lista de subtareas con casilla, borrar y campo para añadir.
 * Al pulsar una subtarea se abre en grande para leer o escribir su explicación.
 */
export default function SubtaskList({
  subtasks,
  onChange,
  disabled,
  compact = false,
  autoFocus = false,
  parentTitle,
  className,
}: ListProps) {
  const list = subtasks || []
  const [draft, setDraft] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const { done, total } = subtaskProgress(list)
  const full = list.length >= MAX_SUBTASKS

  const visible = compact && !showAll ? list.slice(0, COMPACT_VISIBLE) : list
  const hidden = list.length - visible.length

  const add = () => {
    const title = draft.trim()
    if (!title || full) return
    onChange([...list, newSubtask(title)])
    setDraft('')
  }

  const toggle = (id: string) =>
    onChange(list.map((s) => (s.id === id ? { ...s, done: !s.done } : s)))
  const remove = (id: string) => onChange(list.filter((s) => s.id !== id))

  return (
    <div
      className={cn('space-y-1.5', className)}
      onClick={stop}
      onKeyDown={stop}
      onMouseDown={stop}
      onDragStart={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {total > 0 && !compact && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.round((done / total) * 100)}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-gray-500">
            {done}/{total}
          </span>
        </div>
      )}

      {visible.length > 0 && (
        <ul
          className={cn(
            compact ? 'space-y-0.5' : 'max-h-[26rem] space-y-1.5 overflow-y-auto pr-1'
          )}
        >
          {visible.map((s) => (
            <li
              key={s.id}
              className={cn(
                'group/sub flex items-start gap-2 transition',
                compact
                  ? 'rounded-md px-1 py-0.5 hover:bg-gray-50'
                  : 'rounded-xl border border-gray-200 bg-white px-3 py-2.5 hover:border-gray-300 hover:shadow-sm'
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(s.id)}
                className={cn(
                  'flex shrink-0 items-center justify-center rounded border transition',
                  compact ? 'mt-0.5 h-3.5 w-3.5' : 'mt-0.5 h-[18px] w-[18px]',
                  s.done
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                )}
                title={s.done ? 'Marcar pendiente' : 'Marcar hecha'}
              >
                {s.done && <Check className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />}
              </button>
              <button
                type="button"
                onClick={() => setOpenId(s.id)}
                className="min-w-0 flex-1 text-left"
                title={s.description ? 'Leer la explicación' : 'Abrir para escribir una explicación'}
              >
                <span
                  className={cn(
                    'flex items-start gap-1 leading-snug [overflow-wrap:anywhere]',
                    compact ? 'text-xs' : 'text-sm font-medium',
                    s.done ? 'text-gray-400 line-through' : 'text-gray-900'
                  )}
                >
                  <span className="min-w-0">{s.title}</span>
                  {s.description && compact && (
                    <FileText className="mt-px h-3 w-3 shrink-0 text-indigo-400" />
                  )}
                </span>
                {!compact &&
                  (s.description ? (
                    <>
                      <span className="mt-1 block line-clamp-2 text-[13px] leading-snug text-gray-500 [overflow-wrap:anywhere]">
                        {plainPreview(s.description)}
                      </span>
                      <span className="mt-1 inline-flex items-center text-xs font-medium text-indigo-600 group-hover/sub:underline">
                        Leer explicación
                        <ChevronRight className="h-3 w-3" />
                      </span>
                    </>
                  ) : (
                    <span className="mt-0.5 block text-xs text-gray-400 sm:opacity-0 sm:group-hover/sub:opacity-100">
                      + Añadir explicación
                    </span>
                  ))}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(s.id)}
                className="shrink-0 p-0.5 text-gray-300 transition hover:text-red-600 sm:opacity-0 sm:group-hover/sub:opacity-100"
                title="Quitar subtarea"
              >
                <X className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {compact && list.length > COMPACT_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="px-1 text-[11px] font-medium text-gray-500 hover:text-gray-800"
        >
          {showAll ? 'Ver menos' : `Ver ${hidden} más`}
        </button>
      )}

      {!full && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled}
            autoFocus={autoFocus}
            maxLength={300}
            placeholder="Añadir subtarea…"
            className={cn(
              'min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 outline-none placeholder:text-gray-400 focus:border-gray-400',
              compact ? 'h-7 text-xs' : 'h-9 text-sm'
            )}
          />
          <button
            type="submit"
            disabled={disabled || !draft.trim()}
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white transition hover:bg-gray-800 disabled:opacity-40',
              compact ? 'h-7 w-7' : 'h-9 w-9'
            )}
            title="Añadir subtarea"
          >
            <Plus className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </button>
        </form>
      )}
      {full && <p className="px-1 text-[11px] text-gray-400">Máximo {MAX_SUBTASKS} subtareas.</p>}

      <SubtaskViewer
        subtasks={list}
        openId={openId}
        onOpenIdChange={setOpenId}
        onChange={onChange}
        parentTitle={parentTitle}
        disabled={disabled}
      />
    </div>
  )
}
