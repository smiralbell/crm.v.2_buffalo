import { useEffect, useState } from 'react'
import { Clock, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export type HoursConfirmTarget = { id: string; title: string; source: 'personal' | 'project' }

type TaskHours = { took_part: boolean; computed: number; confirmed: number | null; mine: boolean }

function fmt(h: number): string {
  return h.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

/**
 * Al pasar una tarea a «Hecha»: «Calculado X h, ¿es correcto?».
 * Se confirma con un toque o se corrige. Si se cierra, vale lo calculado.
 * Solo sale si la tarea es de quien la mueve.
 */
export default function HoursConfirmDialog({ target, onClose }: { target: HoursConfirmTarget | null; onClose: () => void }) {
  const [data, setData] = useState<TaskHours | null>(null)
  const [value, setValue] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    setEditing(false)
    setError('')
    if (!target) return
    let cancelled = false
    fetch(`/api/tareas/horas/tarea?source=${target.source}&task_id=${target.id}`)
      .then(async (r) => (r.ok ? ((await r.json()) as TaskHours) : null))
      .then((d) => {
        if (cancelled) return
        if (!d || !d.mine) return onClose()
        setData(d)
        setValue(String(d.confirmed ?? d.computed))
        // Sin nada calculado (no pasó por «En curso»), se pide directamente
        if (!d.computed && d.confirmed == null) setEditing(true)
      })
      .catch(() => !cancelled && onClose())
    return () => {
      cancelled = true
    }
  }, [target, onClose])

  const save = async (hours: number) => {
    if (!target) return
    if (!Number.isFinite(hours) || hours < 0 || hours > 500) return setError('Pon un número de horas válido')
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/tareas/horas/tarea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: target.source, task_id: target.id, hours }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((d as { error?: string }).error || 'No se pudo guardar')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const parsed = Number(value.replace(',', '.'))

  return (
    <Dialog open={Boolean(target && data)} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Horas de esta tarea
          </DialogTitle>
          <DialogDescription className="line-clamp-2">{target?.title}</DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-3">
            {data.computed > 0 && !editing ? (
              <div className="rounded-xl bg-gray-50 px-4 py-4 text-center">
                <p className="text-3xl font-semibold tabular-nums text-gray-900">{fmt(data.confirmed ?? data.computed)} h</p>
                <p className="mt-1 text-xs text-gray-500">
                  {data.confirmed != null ? 'Ya las confirmaste' : 'Calculadas con el tiempo que ha estado en curso'}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="horas_tarea" className="text-sm font-medium text-gray-700">
                  ¿Cuántas horas le has dedicado?
                </label>
                <input
                  id="horas_tarea"
                  autoFocus
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void save(parsed)}
                  className="h-10 w-full rounded-lg border border-gray-200 px-3 text-lg tabular-nums outline-none focus:border-gray-400"
                  placeholder="Ej.: 2,5"
                />
                {data.computed > 0 && <p className="text-xs text-gray-500">Calculadas: {fmt(data.computed)} h</p>}
              </div>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {data && data.computed > 0 && !editing ? (
            <>
              <Button type="button" variant="outline" onClick={() => setEditing(true)} disabled={saving}>
                Corregir
              </Button>
              <Button type="button" onClick={() => void save(data.confirmed ?? data.computed)} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Es correcto'}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Ahora no
              </Button>
              <Button type="button" onClick={() => void save(parsed)} disabled={saving || !value.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
