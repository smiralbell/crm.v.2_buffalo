import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normName, type PersonKey, type PersonOption } from '@/lib/tareas/people'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  developer: 'Developer',
  project_manager: 'PM',
  comercial: 'Comercial',
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

interface FilterProps {
  options: PersonOption[]
  selected: PersonKey[]
  onChange: (next: PersonKey[]) => void
  /** Clave del usuario que mira, para "Solo yo" */
  meKey?: PersonKey | null
}

/** Desplegable de personas: buscar, marcar varias, "Todos" y "Solo yo". */
export function PeopleFilter({ options, selected, onChange, meKey }: FilterProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selectedSet = useMemo(() => new Set(selected), [selected])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const shown = useMemo(() => {
    const q = normName(query)
    return q ? options.filter((o) => normName(o.label).includes(q)) : options
  }, [options, query])

  const toggle = (key: PersonKey) =>
    onChange(selectedSet.has(key) ? selected.filter((k) => k !== key) : [...selected, key])

  const label =
    selected.length === 0
      ? 'Todas las personas'
      : selected.length === 1
        ? options.find((o) => o.key === selected[0])?.label ?? '1 persona'
        : `${selected.length} personas`

  return (
    <div ref={ref} className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-10 w-full items-center gap-2 rounded-lg border bg-white px-3 text-sm transition-colors sm:w-52',
          selected.length > 0 ? 'border-gray-900 font-medium text-gray-900' : 'border-gray-200 text-gray-600'
        )}
        title="Filtrar por personas"
      >
        <Users className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar persona…"
              className="h-9 w-full rounded-lg border border-gray-200 pl-8 pr-2 text-sm outline-none focus:border-gray-400"
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onChange([])}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-medium',
                selected.length === 0 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              Todos
            </button>
            {meKey && options.some((o) => o.key === meKey) && (
              <button
                type="button"
                onClick={() => onChange([meKey])}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium',
                  selected.length === 1 && selected[0] === meKey
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                Solo yo
              </button>
            )}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              >
                <X className="h-3 w-3" />
                Quitar
              </button>
            )}
          </div>

          <ul className="mt-2 max-h-72 overflow-y-auto">
            {shown.length === 0 && <li className="px-2 py-3 text-center text-sm text-gray-400">Nadie con ese nombre</li>}
            {shown.map((o) => {
              const checked = selectedSet.has(o.key)
              return (
                <li key={o.key}>
                  <button
                    type="button"
                    onClick={() => toggle(o.key)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        checked ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-900">{o.label}</span>
                      <span className="block text-[11px] text-gray-400">
                        {o.role ? ROLE_LABEL[o.role] ?? o.role : o.userId == null && o.key !== 'none' ? 'Fuera del CRM' : ''}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                        o.open > 0 ? 'bg-gray-100 text-gray-700' : 'text-gray-300'
                      )}
                      title={`${o.open} abiertas de ${o.total}`}
                    >
                      {o.open}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

interface SummaryProps {
  options: PersonOption[]
  selected: PersonKey[]
  onChange: (next: PersonKey[]) => void
}

/** Tira con cada persona y sus tareas abiertas; tocar una la marca o desmarca. */
export function PeopleSummary({ options, selected, onChange }: SummaryProps) {
  const selectedSet = new Set(selected)
  const withWork = options.filter((o) => o.total > 0 || o.userId != null)
  if (withWork.length === 0) return null
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {withWork.map((o) => {
        const active = selectedSet.has(o.key)
        return (
          <button
            key={o.key}
            type="button"
            onClick={() =>
              onChange(active ? selected.filter((k) => k !== o.key) : [...selected, o.key])
            }
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors',
              active
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            )}
            title={`${o.label}: ${o.open} abiertas de ${o.total}`}
          >
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold',
                active ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-600'
              )}
            >
              {o.key === 'none' ? '—' : initials(o.label)}
            </span>
            <span className="max-w-[10rem] truncate font-medium">{o.label}</span>
            <span className={cn('tabular-nums text-xs', active ? 'text-white/70' : 'text-gray-400')}>{o.open}</span>
          </button>
        )
      })}
    </div>
  )
}
