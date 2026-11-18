import { useEffect, useMemo } from 'react'
import { FileText, X } from 'lucide-react'

/**
 * Archivos de un mensaje o una tarea que aún no se han subido (como en Gmail):
 * fichas con miniatura o extensión y una ✕ para quitarlas.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Las capturas pegadas llegan como «image.png»: les damos un nombre con fecha y hora. */
export function namePastedFile(file: File, index = 0): File {
  const generic = !file.name || /^image\.(png|jpe?g|gif|webp)$/i.test(file.name)
  if (!generic) return file
  const d = new Date()
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return new File([file], `captura-${stamp}${index ? `-${index + 1}` : ''}.${ext}`, { type: file.type })
}

/** Archivos de un evento de pegar (Ctrl+V). Vacío si solo se ha pegado texto. */
export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return []
  return Array.from(data.files || []).map((f, i) => namePastedFile(f, i))
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name)
  return m ? m[1].toUpperCase() : 'ARCHIVO'
}

export default function FileChips({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  const previews = useMemo(
    () => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)),
    [files]
  )
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews])

  if (!files.length) return null
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <li
          key={`${f.name}-${f.size}-${i}`}
          className="flex max-w-[15rem] items-center gap-2 rounded-xl border border-gray-200 bg-white py-1 pl-1 pr-1.5 text-xs shadow-sm"
        >
          {previews[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previews[i]!} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg bg-gray-100 text-gray-500">
              <FileText className="h-3.5 w-3.5" />
              <span className="text-[7px] font-bold leading-none">{extOf(f.name)}</span>
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium text-gray-800" title={f.name}>
              {f.name}
            </span>
            <span className="text-[10px] text-gray-400">{fmtSize(f.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="ml-auto shrink-0 rounded-md p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label={`Quitar ${f.name}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}
