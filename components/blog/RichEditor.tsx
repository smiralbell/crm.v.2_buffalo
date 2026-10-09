import { useEffect, useRef } from 'react'
import { Bold, Heading2, Heading3, ImagePlus, Link2, List, ListOrdered, Pilcrow } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Editor de texto sencillo (sin HTML a la vista). Guarda HTML limpio con las
 * mismas etiquetas que usa el blog: h2, h3, p, ul/ol, strong y enlaces.
 * Las imágenes se marcan con (imagen1) e (imagen2): el sistema las genera.
 */
export default function RichEditor({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  // Solo se vuelca el valor cuando cambia desde fuera (no mientras se escribe)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value && document.activeElement !== ref.current) ref.current.innerHTML = value || ''
  }, [value])

  const emit = () => onChange(clean(ref.current?.innerHTML || ''))
  const cmd = (name: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(name, false, arg)
    emit()
  }
  const insertImage = () => {
    const html = ref.current?.innerHTML || ''
    const marker = html.includes('(imagen1)') ? (html.includes('(imagen2)') ? null : '(imagen2)') : '(imagen1)'
    if (!marker) return alert('Ya hay dos imágenes en el texto (la destacada va siempre arriba).')
    cmd('insertHTML', `<p>${marker}</p><p><br></p>`)
  }
  const link = () => {
    const url = prompt('Dirección del enlace (por ejemplo /auditoria/ o https://www.boe.es/…)')
    if (url) cmd('createLink', url)
  }

  const tools: [typeof Bold, string, () => void][] = [
    [Pilcrow, 'Texto normal', () => cmd('formatBlock', 'P')],
    [Heading2, 'Título de sección (H2)', () => cmd('formatBlock', 'H2')],
    [Heading3, 'Subtítulo (H3)', () => cmd('formatBlock', 'H3')],
    [Bold, 'Negrita', () => cmd('bold')],
    [List, 'Lista', () => cmd('insertUnorderedList')],
    [ListOrdered, 'Lista numerada', () => cmd('insertOrderedList')],
    [Link2, 'Enlace', link],
    [ImagePlus, 'Insertar imagen aquí', insertImage],
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-gray-200">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 bg-gray-50/80 px-2 py-1.5">
        {tools.map(([Icon, label, fn]) => (
          <button key={label} type="button" title={label} onMouseDown={(e) => e.preventDefault()} onClick={fn} className="rounded-lg p-1.5 text-gray-600 hover:bg-white hover:text-gray-900">
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Pegar siempre como texto: evita estilos raros de Word o de la web
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
        }}
        className={cn(
          'prose-editor min-h-[420px] px-5 py-4 text-[15px] leading-relaxed text-gray-800 outline-none',
          '[&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold',
          '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-sky-700 [&_a]:underline',
          'empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]'
        )}
      />
    </div>
  )
}

/** Deja solo las etiquetas del blog y quita estilos que mete el navegador. */
function clean(html: string): string {
  return html
    .replace(/<(\/?)(div)([^>]*)>/gi, '<$1p>')
    .replace(/<(\/?)b(\s|>)/gi, '<$1strong$2')
    .replace(/\s(style|class|dir)="[^"]*"/gi, '')
    .replace(/<span>([\s\S]*?)<\/span>/gi, '$1')
    .replace(/<p><br><\/p>/gi, '')
    .trim()
}
