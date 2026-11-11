import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { MAX_SUBTASK_DESCRIPTION, MAX_SUBTASK_TITLE, type Subtask } from '@/lib/subtasks'

/** Estilos de lectura para explicaciones largas (sin plugin de tipografía). */
const READ_CLASSES = cn(
  'text-[15px] leading-7 text-gray-800 [overflow-wrap:anywhere]',
  '[&_p]:my-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-gray-900',
  '[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900',
  '[&_h3]:mt-5 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
  '[&_a]:text-indigo-600 [&_a]:underline [&_a]:underline-offset-2',
  '[&_strong]:font-semibold [&_strong]:text-gray-900',
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px]',
  '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-gray-900 [&_pre]:p-3 [&_pre]:text-gray-100',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-100',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-200 [&_blockquote]:pl-4 [&_blockquote]:text-gray-600',
  '[&_hr]:my-6 [&_hr]:border-gray-200',
  '[&_table]:my-3 [&_table]:w-full [&_table]:text-sm [&_th]:border [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:px-2 [&_td]:py-1'
)

/** Texto de la explicación tal cual se lee, con formato. */
export function SubtaskDescription({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn(READ_CLASSES, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

interface ViewerProps {
  subtasks: Subtask[]
  openId: string | null
  onOpenIdChange: (id: string | null) => void
  onChange: (next: Subtask[]) => void
  /** Nombre de la tarea padre, para dar contexto */
  parentTitle?: string
  disabled?: boolean
}

/** Ventana grande para leer (y editar) una subtarea con su explicación. */
export default function SubtaskViewer({
  subtasks,
  openId,
  onOpenIdChange,
  onChange,
  parentTitle,
  disabled,
}: ViewerProps) {
  const index = openId ? subtasks.findIndex((s) => s.id === openId) : -1
  const current = index >= 0 ? subtasks[index] : null

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  // Al cambiar de subtarea, se sale del modo edición.
  useEffect(() => {
    setEditing(false)
  }, [openId])

  const dirty =
    editing && !!current && (title.trim() !== current.title || description.trim() !== (current.description ?? ''))

  const confirmLeave = () => !dirty || window.confirm('Tienes cambios sin guardar. ¿Descartarlos?')

  const go = (id: string | null) => {
    if (!confirmLeave()) return
    onOpenIdChange(id)
  }

  const startEdit = () => {
    if (!current) return
    setTitle(current.title)
    setDescription(current.description ?? '')
    setEditing(true)
  }

  const save = () => {
    if (!current) return
    const nextTitle = title.trim() || current.title
    const nextDescription = description.trim()
    onChange(
      subtasks.map((s) => {
        if (s.id !== current.id) return s
        const next: Subtask = { ...s, title: nextTitle, description: nextDescription }
        if (!next.description) delete next.description
        return next
      })
    )
    setEditing(false)
  }

  const toggleDone = () => {
    if (!current) return
    onChange(subtasks.map((s) => (s.id === current.id ? { ...s, done: !s.done } : s)))
  }

  const remove = () => {
    if (!current) return
    if (!window.confirm(`¿Quitar la subtarea "${current.title}"?`)) return
    onChange(subtasks.filter((s) => s.id !== current.id))
    onOpenIdChange(null)
  }

  const prev = index > 0 ? subtasks[index - 1] : null
  const next = index >= 0 && index < subtasks.length - 1 ? subtasks[index + 1] : null

  return (
    <Dialog open={!!current} onOpenChange={(open) => !open && go(null)}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,52rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {current && (
          <>
            <div className="shrink-0 border-b border-gray-100 px-6 pb-4 pt-6 pr-12">
              <p className="text-xs font-medium text-gray-400">
                Subtarea {index + 1} de {subtasks.length}
                {parentTitle ? <> · <span className="text-gray-500">{parentTitle}</span></> : null}
              </p>
              {editing ? (
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={MAX_SUBTASK_TITLE}
                  placeholder="Título de la subtarea"
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-lg font-semibold text-gray-900 outline-none focus:border-gray-400"
                />
              ) : (
                <div className="mt-2 flex items-start gap-3">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={toggleDone}
                    className={cn(
                      'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                      current.done
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    )}
                    title={current.done ? 'Marcar pendiente' : 'Marcar hecha'}
                  >
                    {current.done && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <DialogTitle
                    className={cn(
                      'text-left text-lg leading-snug [overflow-wrap:anywhere]',
                      current.done ? 'text-gray-400 line-through' : 'text-gray-900'
                    )}
                  >
                    {current.title}
                  </DialogTitle>
                </div>
              )}
              <DialogDescription className="sr-only">Detalle de la subtarea</DialogDescription>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {editing ? (
                <div className="flex h-full flex-col gap-2">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={MAX_SUBTASK_DESCRIPTION}
                    autoFocus
                    placeholder={'Explica qué hay que hacer.\n\nPuedes usar formato:\n## Título\n- punto de una lista\n**negrita**, enlaces https://…'}
                    className="min-h-[45vh] w-full flex-1 resize-y rounded-xl border border-gray-200 px-4 py-3 text-[15px] leading-7 text-gray-800 outline-none placeholder:text-gray-400 focus:border-gray-400"
                  />
                  <p className="text-xs text-gray-400">
                    Formato: <code>## Título</code>, <code>- lista</code>, <code>1. pasos</code>, <code>**negrita**</code>,
                    enlaces. {description.length}/{MAX_SUBTASK_DESCRIPTION}
                  </p>
                </div>
              ) : current.description ? (
                <SubtaskDescription text={current.description} />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-200 py-12 text-center">
                  <p className="text-sm text-gray-500">Esta subtarea todavía no tiene explicación.</p>
                  <Button type="button" variant="outline" size="sm" onClick={startEdit} disabled={disabled}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Escribir explicación
                  </Button>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-white px-6 py-3">
              {editing ? (
                <>
                  <span />
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => confirmLeave() && setEditing(false)}>
                      Cancelar
                    </Button>
                    <Button type="button" onClick={save} disabled={disabled || !title.trim()}>
                      Guardar
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!prev}
                      onClick={() => prev && go(prev.id)}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!next}
                      onClick={() => next && go(next.id)}
                    >
                      Siguiente
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-red-600"
                      onClick={remove}
                      disabled={disabled}
                      title="Quitar subtarea"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={startEdit} disabled={disabled}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button type="button" size="sm" onClick={toggleDone} disabled={disabled}>
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      {current.done ? 'Marcar pendiente' : 'Marcar hecha'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
