import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FolderKanban, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ProjectOption {
  id: string
  name: string
  status: string
  empresa?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  development: 'En desarrollo',
  active: 'Activo',
  paused: 'Pausado',
  done: 'Terminado',
  churned: 'Baja',
}

/**
 * Asignación de proyectos a un usuario (developer o project manager).
 * Determina qué ve en Onboarding, Proyectos y Retención.
 */
export default function UserProjectsEditor({
  userId,
  description,
  onSaved,
}: {
  userId: number
  description?: string
  onSaved?: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [available, setAvailable] = useState<ProjectOption[]>([])
  const [initial, setInitial] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/users/${userId}/projects`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Error al cargar proyectos')
        if (cancelled) return
        const ids = (d.assigned || []).map((p: ProjectOption) => p.id)
        setAvailable(d.available || [])
        setInitial(ids)
        setSelected(new Set(ids))
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [userId])

  const dirty = useMemo(() => {
    if (initial.length !== selected.size) return true
    return initial.some((id) => !selected.has(id))
  }, [initial, selected])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? available.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || (p.empresa || '').toLowerCase().includes(q)
        )
      : available
    // Asignados primero
    return [...list].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)))
  }, [available, query, selected])

  const toggle = (id: string) => {
    setSavedMsg('')
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setSavedMsg('')
    try {
      const res = await fetch(`/api/users/${userId}/projects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_ids: Array.from(selected) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar')
      const ids = (d.assigned || []).map((p: ProjectOption) => p.id)
      setInitial(ids)
      setSelected(new Set(ids))
      setSavedMsg('Guardado')
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">
            Proyectos asignados{' '}
            <span className="font-normal text-gray-400">({selected.size})</span>
          </h2>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {savedMsg && !dirty && <span className="text-xs text-emerald-600">{savedMsg}</span>}
          <Button
            size="sm"
            className="rounded-xl"
            disabled={!dirty || saving || loading}
            onClick={save}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar asignación'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {error && (
            <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
          <div className="px-5 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar proyecto o empresa"
                className="pl-9 rounded-xl"
              />
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              {available.length === 0 ? 'No hay proyectos todavía' : 'Sin resultados'}
            </div>
          ) : (
            <ul className="mt-3 max-h-[420px] overflow-y-auto divide-y divide-gray-100 border-t border-gray-100">
              {filtered.map((p) => {
                const checked = selected.has(p.id)
                return (
                  <li key={p.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                    <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(p.id)}
                        className="h-4 w-4 rounded border-gray-300 shrink-0"
                      />
                      <FolderKanban className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 truncate">
                          {p.name}
                        </span>
                        <span className="block text-xs text-gray-400 truncate">
                          {[p.empresa, STATUS_LABEL[p.status] || p.status].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </label>
                    {checked && initial.includes(p.id) && (
                      <Link
                        href={`/gestion-proyecto/proyectos/${p.id}`}
                        className="text-xs font-medium text-gray-500 hover:text-gray-900 shrink-0"
                      >
                        Ver →
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
