import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  assigneeIds,
  nameMatchesUser,
  splitAssigneeNames,
  type AssignableTask,
} from '@/lib/gestion-proyecto/task-assignees'

export interface ProjectDev {
  id: number
  name: string
}

/** A quién va una tarea: usuarios del CRM y, en tareas antiguas, nombres sueltos. */
export interface AssigneeSelection {
  ids: number[]
  extra: string[]
  /** Nombre de ids que ya no están en el proyecto */
  labels?: Record<number, string>
}

export const EMPTY_SELECTION: AssigneeSelection = { ids: [], extra: [] }

interface DevsData {
  devs: ProjectDev[]
  meId: number | null
}

const cache = new Map<string, Promise<DevsData>>()

function loadDevs(projectId: string): Promise<DevsData> {
  let p = cache.get(projectId)
  if (!p) {
    p = fetch(`/api/gestion-proyecto/proyectos/${projectId}/developers`)
      .then((r) => (r.ok ? r.json() : { developers: [] }))
      .then((d: { developers?: ProjectDev[]; me_id?: number }) => ({
        devs: (d.developers ?? []).map((u) => ({ id: Number(u.id), name: u.name })),
        meId: d.me_id ?? null,
      }))
      .catch(() => {
        cache.delete(projectId)
        return { devs: [], meId: null }
      })
    cache.set(projectId, p)
  }
  return p
}

/** Developers del proyecto (los de la pestaña Developers). */
export function useProjectDevelopers(projectId: string | null) {
  const [state, setState] = useState<DevsData & { loading: boolean; projectId: string | null }>({
    devs: [],
    meId: null,
    loading: false,
    projectId: null,
  })
  useEffect(() => {
    if (!projectId) {
      setState({ devs: [], meId: null, loading: false, projectId: null })
      return
    }
    let alive = true
    setState((s) => ({ ...s, loading: true, projectId }))
    void loadDevs(projectId).then((d) => {
      if (alive) setState({ ...d, loading: false, projectId })
    })
    return () => {
      alive = false
    }
  }, [projectId])
  return state
}

/** Lo que tiene ahora la tarea, en términos de los developers del proyecto. */
export function selectionFromTask(task: AssignableTask, devs: ProjectDev[]): AssigneeSelection {
  const ids = assigneeIds(task)
  const names = splitAssigneeNames(task.assignee)
  if (ids.length > 0) {
    // El texto son los nombres de esos usuarios: los que no están en el proyecto
    // se etiquetan con los nombres que no casan con ningún developer.
    const unmatched = names.filter((n) => !devs.some((d) => ids.includes(d.id) && nameMatchesUser(n, d.name)))
    const outside = ids.filter((id) => !devs.some((d) => d.id === id))
    const labels: Record<number, string> = {}
    outside.forEach((id, i) => {
      if (unmatched[i]) labels[id] = unmatched[i]
    })
    return { ids, extra: unmatched.slice(outside.length), labels }
  }
  // Tareas antiguas (solo texto): se casan por nombre con los developers
  const out: AssigneeSelection = { ids: [], extra: [] }
  for (const n of names) {
    const dev = devs.find((d) => nameMatchesUser(n, d.name))
    if (!dev) out.extra.push(n)
    else if (!out.ids.includes(dev.id)) out.ids.push(dev.id)
  }
  return out
}

/** Campos para la API (crear o editar). */
export function selectionBody(sel: AssigneeSelection) {
  return { assignee_user_ids: sel.ids, extra_assignees: sel.extra }
}

interface AssigneePickerProps {
  devs: ProjectDev[]
  loading?: boolean
  value: AssigneeSelection
  onChange: (next: AssigneeSelection) => void
  disabled?: boolean
}

/** Uno, varios o todos los developers del proyecto. */
export default function AssigneePicker({ devs, loading, value, onChange, disabled }: AssigneePickerProps) {
  const toggle = (id: number) =>
    onChange({
      ...value,
      ids: value.ids.includes(id) ? value.ids.filter((x) => x !== id) : [...value.ids, id],
    })
  const removeExtra = (name: string) => onChange({ ...value, extra: value.extra.filter((n) => n !== name) })
  const allSelected = devs.length > 0 && devs.every((d) => value.ids.includes(d.id))
  const outside = value.ids.filter((id) => !devs.some((d) => d.id === id))

  if (loading && devs.length === 0) {
    return (
      <div className="flex h-10 items-center gap-2 text-xs text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Cargando developers…
      </div>
    )
  }

  const chip = (selected: boolean) =>
    cn(
      'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-60',
      selected
        ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
    )

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {devs.length === 0 && value.extra.length === 0 && outside.length === 0 && (
        <span className="text-xs text-gray-400">
          Este proyecto no tiene developers. Añádelos en la pestaña Developers.
        </span>
      )}
      {devs.map((d) => {
        const selected = value.ids.includes(d.id)
        return (
          <button
            key={d.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(d.id)}
            className={chip(selected)}
            aria-pressed={selected}
          >
            {selected && <Check className="h-3 w-3" />}
            {d.name}
          </button>
        )
      })}
      {outside.map((id) => (
        <button
          key={`out-${id}`}
          type="button"
          disabled={disabled}
          onClick={() => toggle(id)}
          className={chip(true)}
          title="Ya no está en el proyecto: pulsa para quitarla"
        >
          <Check className="h-3 w-3" />
          {value.labels?.[id] ?? `Usuario ${id}`}
        </button>
      ))}
      {value.extra.map((name) => (
        <button
          key={`extra-${name}`}
          type="button"
          disabled={disabled}
          onClick={() => removeExtra(name)}
          className={chip(true)}
          title="No es usuario del CRM: pulsa para quitarlo"
        >
          <Check className="h-3 w-3" />
          {name}
        </button>
      ))}
      {devs.length > 1 && (
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...value,
              ids: allSelected
                ? value.ids.filter((id) => !devs.some((d) => d.id === id))
                : Array.from(new Set([...value.ids, ...devs.map((d) => d.id)])),
            })
          }
          className="h-8 rounded-full px-2 text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline disabled:opacity-60"
        >
          {allSelected ? 'Quitar todos' : 'Todos'}
        </button>
      )}
    </div>
  )
}
