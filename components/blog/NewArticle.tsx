import { useRouter } from 'next/router'
import { useState } from 'react'
import { ListOrdered, Loader2, PenLine, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Topic } from '@/lib/blog/types'
import { cn } from '@/lib/utils'
import { CategorySelect } from './Categories'
import { api, Field, inputCls, Modal, Notice, THEME_COLOR, THEME_NAMES } from './shared'

type Mode = 'auto' | 'cola' | 'idea' | 'manual'

const MODES: { id: Mode; icon: typeof Sparkles; title: string; text: string }[] = [
  { id: 'auto', icon: Wand2, title: 'Que la IA elija', text: 'Busca lo que más se está buscando ahora sobre lo vuestro, elige el tema con más potencial y lo escribe.' },
  { id: 'cola', icon: ListOrdered, title: 'Un tema de la cola', text: 'Eliges uno de los temas preparados y la IA lo escribe.' },
  { id: 'idea', icon: Sparkles, title: 'Un tema mío', text: 'Le dices de qué hablar y la IA busca la palabra clave y lo escribe.' },
  { id: 'manual', icon: PenLine, title: 'Lo escribo yo', text: 'Redactas tú en un editor sencillo. El sistema revisa el SEO y hace las imágenes.' },
]

export default function NewArticle({ open, onClose, topics, reload }: { open: boolean; onClose: () => void; topics: Topic[]; reload?: () => Promise<void> }) {
  const router = useRouter()
  const queue = topics.filter((t) => t.status === 'pendiente').sort((a, b) => (a.source === 'calendario' ? 1 : 0) - (b.source === 'calendario' ? 1 : 0) || a.order - b.order)
  const [mode, setMode] = useState<Mode>('auto')
  const [topicId, setTopicId] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [keyword, setKeyword] = useState('')
  const [theme, setTheme] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const chosen = queue.find((t) => t.id === (topicId || queue[0]?.id))

  const create = async () => {
    setBusy(true)
    setErr('')
    try {
      const body =
        mode === 'auto'
          ? { auto: true, focus: notes, theme }
          : mode === 'cola'
            ? { topicId: chosen?.id }
            : mode === 'idea'
              ? { title, notes, keyword, theme: theme || 'A' }
              : { title, theme: theme || 'A', keyword, manual: true }
      const { post } = await api('post/new', { body })
      router.push(`/blog/${post.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
      setBusy(false)
    }
  }

  const ready = mode === 'auto' ? true : mode === 'cola' ? !!chosen : !!title.trim()
  const button = { auto: 'Buscar tema y escribirlo', cola: 'Escribir este tema', idea: 'Que la IA lo escriba', manual: 'Abrir el editor' }[mode]

  return (
    <Modal open={open} onClose={onClose} title="Nuevo artículo" wide>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn('flex gap-3 rounded-2xl border p-3.5 text-left transition', mode === m.id ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300')}
          >
            <m.icon className="mt-0.5 h-5 w-5 shrink-0 text-gray-700" />
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                {m.title}
                {m.id === 'auto' && <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-white">Recomendado</span>}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{m.text}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {mode === 'auto' && (
          <>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <Field label="Enfoque (opcional)" info="Si lo dejas vacío, la IA mira todo lo que hacéis (asistentes virtuales, WhatsApp y llamadas, automatizaciones…) y busca dónde hay más demanda ahora. Si quieres acotar, escribe algo como «clínicas» o «WhatsApp».">
                <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej.: despachos de abogados" />
              </Field>
              <Field label="Categoría (opcional)">
                <CategorySelect value={theme} onChange={setTheme} allowAll="Cualquiera" withNews={false} onCreated={reload} />
              </Field>
            </div>
            <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
              Mira las búsquedas reales de Google, Bing y DuckDuckGo y lo que está cambiando en el mercado, elige el tema con más interés que no hayáis tratado y lo escribe. Las otras ideas que encuentre se guardan en Temas → Buscar ideas.
            </p>
          </>
        )}

        {mode === 'cola' &&
          (queue.length ? (
            <>
              <Field label="Tema" info="Los temas de la cola salen del calendario anual de Sergi y de las ideas que hayáis aceptado en Temas.">
                <select className={inputCls} value={chosen?.id || ''} onChange={(e) => setTopicId(e.target.value)}>
                  {queue.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </Field>
              {chosen && (
                <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
                  <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full', THEME_COLOR[chosen.theme])} />
                  {THEME_NAMES[chosen.theme]} · palabra clave de partida «{chosen.keyword}» · empuja a {chosen.destination}
                </p>
              )}
            </>
          ) : (
            <Notice>No hay temas en la cola. Usa «Que la IA elija» o «Un tema mío».</Notice>
          ))}

        {(mode === 'idea' || mode === 'manual') && (
          <>
            <Field
              label={mode === 'manual' ? 'Título del artículo' : '¿De qué quieres que trate?'}
              info={mode === 'manual' ? 'Máximo 55 caracteres y con la palabra clave. Podrás cambiarlo después.' : 'Escríbelo como lo dirías: «cómo reducir las citas perdidas en una clínica dental». La IA buscará cómo lo busca la gente.'}
            >
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === 'manual' ? 'Título' : 'Tema o idea'} autoFocus />
            </Field>
            {mode === 'idea' && (
              <Field label="Notas para la IA (opcional)" info="Un caso vuestro, un enfoque, algo que no debe decir…">
                <textarea className={inputCls + ' h-20'} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Categoría" info="Agrupa el artículo en el blog y decide a qué página de venta empuja.">
                <CategorySelect value={theme || 'A'} onChange={setTheme} onCreated={reload} />
              </Field>
              <Field label="Palabra clave (opcional)" info="Si la dejas vacía, el sistema investiga qué busca la gente y elige la mejor.">
                <input className={inputCls} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        {mode !== 'manual' && <p className="text-center text-xs text-gray-400">Tarda entre 3 y 7 minutos. Verás el avance en la ficha del artículo y puedes salir mientras trabaja.</p>}
        {err && <Notice tone="error">{err}</Notice>}
        <div className="flex justify-center pt-1">
          <Button onClick={create} disabled={!ready || busy} className="gap-1.5 rounded-xl px-6">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {button}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
