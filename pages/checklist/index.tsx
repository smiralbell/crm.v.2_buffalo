import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useRef, useState } from 'react'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import ChecklistBoard from '@/components/checklist/ChecklistBoard'
import type { ChecklistColumnId, ChecklistItem } from '@/lib/checklist/types'
import type { Subtask } from '@/lib/subtasks'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw } from 'lucide-react'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin') {
      return { redirect: { destination: '/dashboard', permanent: false } }
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function ChecklistPage() {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  /** Guardados de subtareas en cola por tarea, para que no lleguen desordenados. */
  const subtaskSaves = useRef(new Map<number, Promise<void>>())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/checklist')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar')
      setItems(data.items || [])
      setWarning(typeof data.warning === 'string' ? data.warning : '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onCreate = async (title: string, column: ChecklistColumnId) => {
    setError('')
    const res = await fetch('/api/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, column_key: column }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'No se pudo crear')
      return
    }
    if (data.item) setItems((prev) => [...prev, data.item])
  }

  const onToggle = async (id: number, done: boolean) => {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/checklist/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar')
      if (data.item) {
        setItems((prev) => prev.map((i) => (i.id === id ? data.item : i)))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  const onMove = async (id: number, column: ChecklistColumnId, position: number) => {
    setBusyId(id)
    setError('')
    // Optimistic
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, column_key: column, position } : i))
    )
    try {
      const res = await fetch(`/api/checklist/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column_key: column, position }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo mover')
      if (data.item) {
        setItems((prev) => prev.map((i) => (i.id === id ? data.item : i)))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const onUpdate = async (
    id: number,
    patch: {
      title: string
      remind_every_days: number
      remind_weekday: number | null
      remind_time: string | null
    }
  ) => {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/checklist/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      if (data.item) setItems((prev) => prev.map((i) => (i.id === id ? data.item : i)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      throw e
    } finally {
      setBusyId(null)
    }
  }

  const onSubtasks = async (id: number, subtasks: Subtask[]) => {
    setError('')
    // Optimista: la lista se actualiza al momento y se guarda de fondo
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, subtasks } : i)))
    const save = async () => {
      try {
        const res = await fetch(`/api/checklist/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subtasks }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'No se pudieron guardar las subtareas')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error')
        await load()
      }
    }
    const next = (subtaskSaves.current.get(id) ?? Promise.resolve()).then(save)
    subtaskSaves.current.set(id, next)
    await next
  }

  const onDelete = async (id: number) => {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/checklist/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar')
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>

        {warning && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {warning}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="flex justify-center py-20 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <ChecklistBoard
            items={items}
            onCreate={onCreate}
            onToggle={onToggle}
            onMove={onMove}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onSubtasks={onSubtasks}
            busyId={busyId}
          />
        )}
      </div>
    </Layout>
  )
}
