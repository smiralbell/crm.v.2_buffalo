import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EMPTY_FILTERS, countActiveFilters, type TaskFilterState } from '@/lib/tareas/filters'
import type { WorkProject } from '@/lib/tareas/types'

interface Props {
  filters: TaskFilterState
  onChange: (next: TaskFilterState) => void
  projects: WorkProject[]
  total: number
  shown: number
  /** Al final de la fila (selector Tablero / Calendario / Gantt) */
  trailing?: ReactNode
}

const selectClass = (active: boolean) =>
  cn(
    'h-10 min-w-0 rounded-lg border bg-white px-2.5 text-sm outline-none transition-colors focus:border-gray-400',
    active ? 'border-gray-900 font-medium text-gray-900' : 'border-gray-200 text-gray-600'
  )

/** Una sola fila: buscar, origen, prioridad, fecha y (a la derecha) la vista. */
export default function TaskFiltersBar({ filters, onChange, projects, total, shown, trailing }: Props) {
  const set = <K extends keyof TaskFilterState>(key: K, value: TaskFilterState[K]) =>
    onChange({ ...filters, [key]: value })
  const active = countActiveFilters(filters)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm lg:flex-nowrap">
      <div className="relative min-w-[12rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="Buscar por título, proyecto o subtarea…"
          className={cn(
            'h-10 w-full rounded-lg border bg-white pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400',
            filters.q.trim() ? 'border-gray-900' : 'border-gray-200'
          )}
        />
        {filters.q && (
          <button
            type="button"
            onClick={() => set('q', '')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            title="Borrar búsqueda"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <select
        value={filters.origin}
        onChange={(e) => set('origin', e.target.value)}
        className={cn(selectClass(filters.origin !== 'all'), 'w-full sm:w-44')}
        title="Origen"
      >
        <option value="all">Todo el trabajo</option>
        <option value="personal">Tareas sueltas</option>
        {projects.length > 0 && (
          <optgroup label="Proyecto">
            {projects.map((p) => (
              <option key={p.id} value={`project:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <select
        value={filters.priority}
        onChange={(e) => set('priority', e.target.value as TaskFilterState['priority'])}
        className={cn(selectClass(filters.priority !== 'all'), 'w-[calc(50%-0.25rem)] sm:w-40')}
        title="Prioridad"
      >
        <option value="all">Toda prioridad</option>
        <option value="high">Prioridad alta</option>
        <option value="medium">Prioridad media</option>
        <option value="low">Prioridad baja</option>
      </select>

      <select
        value={filters.due}
        onChange={(e) => set('due', e.target.value as TaskFilterState['due'])}
        className={cn(selectClass(filters.due !== 'all'), 'w-[calc(50%-0.25rem)] sm:w-40')}
        title="Fecha de finalización"
      >
        <option value="all">Cualquier fecha</option>
        <option value="overdue">Vencidas</option>
        <option value="week">Próximos 7 días</option>
        <option value="none">Sin fecha</option>
      </select>

      {active > 0 && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          title="Quitar filtros"
        >
          <X className="h-3.5 w-3.5" />
          <span className="tabular-nums">
            {shown}/{total}
          </span>
        </button>
      )}

      {trailing && <div className="ml-auto shrink-0">{trailing}</div>}
    </div>
  )
}
