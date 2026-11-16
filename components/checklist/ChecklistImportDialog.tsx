import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, ListTodo, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ChecklistImportPreview, ChecklistImportResult } from '@/lib/checklist/import-to-tareas'
import type { ImportMap } from '@/lib/checklist/to-tareas'
import type { ChecklistColumnId } from '@/lib/checklist/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Tras importar, para recargar el Checklist */
  onImported: () => void
}

const EMPTY_MAP: ImportMap = { inbox: null, santi: null, sergi: null }

/** Pasar lo del Checklist a las Tareas de cada socio. */
export default function ChecklistImportDialog({ open, onOpenChange, onImported }: Props) {
  const [preview, setPreview] = useState<ChecklistImportPreview | null>(null)
  const [map, setMap] = useState<ImportMap>(EMPTY_MAP)
  const [includeDone, setIncludeDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ChecklistImportResult | null>(null)

  useEffect(() => {
    if (!open) return
    setResult(null)
    setError('')
    setLoading(true)
    fetch('/api/checklist/import-to-tareas')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'No se pudo cargar')
        setPreview(data)
        setMap(data.suggested)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar'))
      .finally(() => setLoading(false))
  }, [open])

  const countFor = (id: ChecklistColumnId) => {
    const c = preview?.columns.find((col) => col.id === id)
    if (!c) return 0
    return c.pending + (includeDone ? c.done : 0)
  }
  const total = (['inbox', 'santi', 'sergi'] as ChecklistColumnId[]).reduce(
    (sum, id) => sum + (map[id] ? countFor(id) : 0),
    0
  )
  const noSocios = preview != null && !preview.users.some((u) => u.role === 'admin')

  const run = async () => {
    setRunning(true)
    setError('')
    try {
      const res = await fetch('/api/checklist/import-to-tareas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map, include_done: includeDone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo pasar')
      setResult(data)
      onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo pasar')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5" />
            Pasar el Checklist a Tareas
          </DialogTitle>
          <DialogDescription>
            Cada cosa se convierte en una tarea suelta de la persona que elijas, con sus subtareas. Sale del Checklist
            (no se borra) y deja de recordarse aquí.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : result ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div className="text-sm text-emerald-900">
                <p className="font-semibold">
                  {result.created === 1 ? '1 tarea pasada' : `${result.created} tareas pasadas`}
                </p>
                {result.byUser.map((u) => (
                  <p key={u.id}>
                    {u.name}: {u.count}
                  </p>
                ))}
              </div>
            </div>
            {result.failed.length > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                No se pudieron pasar {result.failed.length}: {result.failed.map((f) => `«${f.title}»`).join(', ')}. Siguen en el
                Checklist; vuelve a intentarlo.
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Link href="/tareas">
                <Button className="rounded-xl">
                  Ir a Tareas
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            {noSocios && (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Todavía no hay socios dados de alta. Créalos en Usuarios con rol «Admin (socio)» y su Google personal, y vuelve
                aquí.
              </p>
            )}
            <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
              {preview.columns.map((col) => (
                <div key={col.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{col.label}</p>
                    <p className="text-xs text-gray-500">
                      {col.pending} pendientes · {col.done} hechas
                      {col.imported ? ` · ${col.imported} ya pasadas` : ''}
                    </p>
                  </div>
                  <select
                    className="h-9 w-44 shrink-0 rounded-xl border border-gray-200 bg-white px-2 text-sm"
                    value={map[col.id] ?? ''}
                    onChange={(e) =>
                      setMap((m) => ({ ...m, [col.id]: e.target.value ? Number(e.target.value) : null }))
                    }
                    disabled={running}
                  >
                    <option value="">No pasar</option>
                    {preview.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.role === 'admin' ? ' (socio)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-gray-900"
                checked={includeDone}
                onChange={(e) => setIncludeDone(e.target.checked)}
                disabled={running}
              />
              Pasar también las que ya están hechas (llegan como terminadas)
            </label>

            {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={running}>
                Cancelar
              </Button>
              <Button className="rounded-xl" onClick={() => void run()} disabled={running || total === 0}>
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Pasando…
                  </>
                ) : total === 0 ? (
                  'Nada que pasar'
                ) : (
                  `Pasar ${total} a Tareas`
                )}
              </Button>
            </div>
          </div>
        ) : (
          error && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
