import { useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import type { ProjectTask, ProjectTaskAttachment } from '@/lib/gestion-proyecto/types'
import type { TaskBoardClient } from '@/components/gestion-proyecto/task-board-client'
import { cn } from '@/lib/utils'
import { filesFromClipboard } from '@/components/gestion-proyecto/FileChips'

function fmtSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name)
  return m ? m[1].toUpperCase() : 'ARCHIVO'
}

function withDownload(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}download=1`
}

/** Adjuntos de una tarea abierta: ver, descargar, quitar y añadir (se guardan en Google Drive). */
export default function TaskAttachments({
  task,
  client,
  onChange,
  readOnly = false,
}: {
  task: ProjectTask
  client: TaskBoardClient
  /** Lista nueva tras subir o quitar */
  onChange: (attachments: ProjectTaskAttachment[]) => void
  readOnly?: boolean
}) {
  const attachments = task.attachments ?? []
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const upload = async (files: File[]) => {
    if (!files.length || readOnly) return
    setUploading(true)
    setError('')
    try {
      const added = await client.uploadAttachments(task, files)
      onChange([...attachments, ...added])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron subir los archivos')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  // Ctrl+V con la tarea abierta: la captura se sube como adjunto
  const uploadRef = useRef(upload)
  uploadRef.current = upload
  useEffect(() => {
    if (readOnly) return
    const onPaste = (e: ClipboardEvent) => {
      const pasted = filesFromClipboard(e.clipboardData)
      if (!pasted.length) return
      if (!e.clipboardData?.getData('text/plain')) e.preventDefault()
      void uploadRef.current(pasted)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [readOnly])

  const remove = async (att: ProjectTaskAttachment) => {
    if (!window.confirm(`¿Quitar «${att.file_name}» de la tarea? Irá a la papelera de Drive.`)) return
    setRemoving(att.id)
    setError('')
    try {
      await client.deleteAttachment(task, att.id)
      onChange(attachments.filter((a) => a.id !== att.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar el archivo')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div
      className={cn('mt-5 rounded-2xl transition-colors', dragging && 'bg-indigo-50/60 ring-2 ring-indigo-200')}
      onDragOver={(e) => {
        if (readOnly) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (readOnly) return
        e.preventDefault()
        setDragging(false)
        void upload(Array.from(e.dataTransfer.files || []))
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <Paperclip className="h-4 w-4" />
          Adjuntos{attachments.length ? ` · ${attachments.length}` : ''}
        </p>
        {!readOnly && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => void upload(Array.from(e.target.files || []))}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? 'Subiendo…' : 'Añadir archivos'}
            </button>
          </>
        )}
      </div>

      {attachments.length === 0 ? (
        !readOnly && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-xl border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-400 hover:border-gray-300 hover:text-gray-500"
          >
            Arrastra aquí imágenes o documentos, pega una captura con Ctrl+V o pulsa para elegirlos (hasta 200 MB cada uno)
          </button>
        )
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {attachments.map((att) => {
            const url = client.attachmentUrl(task, att.id)
            const isImage = (att.mime_type || '').startsWith('image/')
            return (
              <li key={att.id} className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-2">
                <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={att.file_name} className="h-12 w-12 rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                      <FileText className="h-4 w-4" />
                      <span className="mt-0.5 text-[9px] font-semibold">{extOf(att.file_name)}</span>
                    </span>
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm font-medium text-gray-800 hover:underline"
                    title={att.file_name}
                  >
                    {att.file_name}
                  </a>
                  <p className="text-[11px] text-gray-400">{fmtSize(att.file_size)}</p>
                </div>
                <div className="flex shrink-0 items-center">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Abrir"
                    title="Abrir"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <a
                    href={withDownload(url)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Descargar"
                    title="Descargar"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => void remove(att)}
                      disabled={removing === att.id}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      aria-label="Quitar"
                      title="Quitar"
                    >
                      {removing === att.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
