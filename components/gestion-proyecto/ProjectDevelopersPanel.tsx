'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DevOption {
  id: number
  name: string
  email: string
}

interface ProjectDevelopersPanelProps {
  projectId: string
  readOnly?: boolean
  onSaved?: (developers: DevOption[]) => void
}

export default function ProjectDevelopersPanel({
  projectId,
  readOnly = false,
  onSaved,
}: ProjectDevelopersPanelProps) {
  const [allDevs, setAllDevs] = useState<DevOption[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [devRes, assignedRes] = await Promise.all([
        fetch('/api/users/developers'),
        fetch(`/api/gestion-proyecto/proyectos/${projectId}/developers`),
      ])
      const devData = await devRes.json()
      const assignedData = await assignedRes.json()
      if (!assignedRes.ok) throw new Error(assignedData.error || assignedData.hint || 'Error al cargar')
      if (devRes.ok) setAllDevs(devData.users || [])
      const assigned: DevOption[] = assignedData.developers || []
      setSelected(assigned.map((d) => d.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const toggle = (id: number) => {
    if (readOnly) return
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/gestion-proyecto/proyectos/${projectId}/developers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.hint || 'No se pudo guardar')
      const saved: DevOption[] = data.developers || []
      setSelected(saved.map((d) => d.id))
      onSaved?.(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="py-12 flex justify-center text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="border-0 shadow-none p-0 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Developers asignados
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Solo los developers seleccionados verán este proyecto en su panel y los tickets de este
          proyecto asignados a ellos.
        </p>
      </div>

      {allDevs.length === 0 ? (
        <p className="text-sm text-gray-400">
          No hay developers. Créalos en Usuarios del CRM.
        </p>
      ) : (
        <ul className="space-y-2">
          {allDevs.map((d) => {
            const on = selected.includes(d.id)
            return (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggle(d.id)}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                    on
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white',
                    readOnly && 'cursor-default opacity-80'
                  )}
                >
                  <span>
                    <span className="text-sm font-medium text-gray-900">{d.name}</span>
                    <span className="block text-xs text-gray-500">{d.email}</span>
                  </span>
                  <span
                    className={cn(
                      'h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center',
                      on ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                    )}
                  >
                    {on && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!readOnly && (
        <Button onClick={save} disabled={saving || allDevs.length === 0} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Guardar asignación
        </Button>
      )}
    </div>
  )
}

export function DeveloperTags({
  developers,
  className,
}: {
  developers: { id: number; name: string }[]
  className?: string
}) {
  if (!developers?.length) return null
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {developers.map((d) => (
        <span
          key={d.id}
          className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-800"
        >
          {d.name}
        </span>
      ))}
    </div>
  )
}
