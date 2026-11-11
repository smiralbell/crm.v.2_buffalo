import { useEffect, useState } from 'react'
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { WorkEntry } from '@/lib/trabajo/types'

type Draft = { key: string; fecha: string; titulo: string; detalle: string; proyecto_id: string; horas: string }

const newKey = () => Math.random().toString(36).slice(2)
const emptyDraft = (fecha: string): Draft => ({ key: newKey(), fecha, titulo: '', detalle: '', proyecto_id: '', horas: '' })

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si viene, se edita esa entrada; si no, se registra trabajo nuevo */
  entry?: WorkEntry | null
  today: string
  projects: { id: string; name: string }[]
  /** Admin apuntando para otra persona */
  userId?: number
  onSaved: () => void
}

const field =
  'w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400'

/** Registrar trabajo (texto libre que la IA separa, o a mano) o editar una entrada. */
export default function WorkLogDialog({ open, onOpenChange, entry, today, projects, userId, onSaved }: Props) {
  const editing = Boolean(entry)
  const [text, setText] = useState('')
  const [splitFrom, setSplitFrom] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [busy, setBusy] = useState<'split' | 'save' | null>(null)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setError('')
    setWarnings([])
    setText('')
    setSplitFrom(null)
    setDrafts(
      entry
        ? [
            {
              key: entry.id,
              fecha: entry.work_date,
              titulo: entry.title,
              detalle: entry.detail ?? '',
              proyecto_id: entry.project_id ?? '',
              horas: entry.hours == null ? '' : String(entry.hours),
            },
          ]
        : []
    )
  }, [open, entry, today])

  const patchDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)))

  const split = async () => {
    setBusy('split')
    setError('')
    setWarnings([])
    try {
      const res = await fetch('/api/trabajo/separar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: text, user_id: userId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo separar')
      type Item = { work_date: string; title: string; detail: string | null; project_id: string | null; hours: number | null }
      setDrafts(
        ((data.items || []) as Item[]).map((it) => ({
          key: newKey(),
          fecha: it.work_date,
          titulo: it.title,
          detalle: it.detail ?? '',
          proyecto_id: it.project_id ?? '',
          horas: it.hours == null ? '' : String(it.hours),
        }))
      )
      setWarnings(data.warnings || [])
      setSplitFrom(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setBusy('save')
    setError('')
    try {
      const items = drafts.map((d) => ({
        fecha: d.fecha,
        titulo: d.titulo,
        detalle: d.detalle,
        proyecto_id: d.proyecto_id || null,
        horas: d.horas === '' ? null : d.horas,
      }))
      const res = entry
        ? await fetch(`/api/trabajo/${entry.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items[0]),
          })
        : await fetch('/api/trabajo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, texto_original: splitFrom, user_id: userId }),
          })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  const canSave = drafts.length > 0 && drafts.every((d) => d.titulo.trim() && d.fecha) && !busy

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,52rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-gray-100 px-6 pb-4 pt-6">
          <DialogTitle>{editing ? 'Editar trabajo' : 'Registrar trabajo'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Cambia lo que haga falta de este trabajo.'
              : 'Cuenta lo que has hecho como quieras (el día, la semana…) y la IA lo separa en trabajos. También puedes añadirlos a mano.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {!editing && (
            <div className="space-y-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                maxLength={20000}
                placeholder="Ej.: Hoy por la mañana he arreglado el webhook de pagos de PREICO (2h) y por la tarde reunión con el cliente de Automotive para revisar el alcance. Ayer dejé montado el panel de métricas."
                className={cn(field, 'resize-y py-2.5 leading-6')}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={split} disabled={!text.trim() || busy !== null} className="rounded-xl">
                  {busy === 'split' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                  Separar con IA
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  disabled={busy !== null}
                  onClick={() => setDrafts((list) => [...list, emptyDraft(today)])}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Añadir a mano
                </Button>
                {splitFrom && <span className="text-xs text-gray-500">Revisa lo que ha separado antes de guardar.</span>}
              </div>
            </div>
          )}

          {warnings.length > 0 && (
            <ul className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {drafts.length > 0 && (
            <ol className="space-y-3">
              {drafts.map((d, i) => (
                <li key={d.key} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <div className="flex items-start gap-2">
                    {!editing && (
                      <span className="mt-2.5 w-5 shrink-0 text-xs font-semibold tabular-nums text-gray-400">{i + 1}.</span>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        value={d.titulo}
                        onChange={(e) => patchDraft(d.key, { titulo: e.target.value })}
                        maxLength={300}
                        placeholder="Qué has hecho"
                        className={cn(field, 'h-10 font-medium')}
                      />
                      <textarea
                        value={d.detalle}
                        onChange={(e) => patchDraft(d.key, { detalle: e.target.value })}
                        rows={2}
                        maxLength={4000}
                        placeholder="Detalle (opcional): cómo, resultado, bloqueos…"
                        className={cn(field, 'resize-y py-2')}
                      />
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_6rem]">
                        <input
                          type="date"
                          value={d.fecha}
                          max={today}
                          onChange={(e) => patchDraft(d.key, { fecha: e.target.value })}
                          className={cn(field, 'h-9')}
                        />
                        <select
                          value={d.proyecto_id}
                          onChange={(e) => patchDraft(d.key, { proyecto_id: e.target.value })}
                          className={cn(field, 'h-9 px-2')}
                        >
                          <option value="">Sin proyecto</option>
                          {d.proyecto_id && !projects.some((p) => p.id === d.proyecto_id) && (
                            <option value={d.proyecto_id}>{entry?.project_name || 'Proyecto actual'}</option>
                          )}
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0.25"
                          max="24"
                          step="0.25"
                          value={d.horas}
                          onChange={(e) => patchDraft(d.key, { horas: e.target.value })}
                          placeholder="Horas"
                          className={cn(field, 'h-9')}
                        />
                      </div>
                    </div>
                    {!editing && (
                      <button
                        type="button"
                        onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}
                        className="mt-2.5 shrink-0 text-gray-300 hover:text-red-600"
                        title="Quitar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter className="shrink-0 border-t border-gray-100 px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy !== null}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!canSave}>
            {busy === 'save' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : editing ? (
              'Guardar'
            ) : (
              `Guardar${drafts.length > 1 ? ` ${drafts.length} trabajos` : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
