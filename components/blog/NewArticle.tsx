import { useRouter } from 'next/router'
import { useState } from 'react'
import { ListOrdered, Loader2, PenLine, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ThemeCode, Topic } from '@/lib/blog/types'
import { cn } from '@/lib/utils'
import { api, Field, inputCls, Modal, Notice, THEME_COLOR, THEME_NAMES } from './shared'

type Mode = 'cola' | 'idea' | 'manual'

const MODES: { id: Mode; icon: typeof Sparkles; title: string; text: string }[] = [
  { id: 'cola', icon: ListOrdered, title: 'Un tema de la cola', text: 'Eliges uno de los temas preparados y la IA lo investiga y lo escribe entero.' },
  { id: 'idea', icon: Sparkles, title: 'Un tema nuevo', text: 'Le cuentas a la IA de qué quieres hablar y ella busca la palabra clave y lo escribe.' },
  { id: 'manual', icon: PenLine, title: 'Lo escribo yo', text: 'Redactas tú. El sistema revisa el SEO, genera las imágenes y lo publica.' },
]

export default function NewArticle({ open, onClose, topics }: { open: boolean; onClose: () => void; topics: Topic[] }) {
  const router = useRouter()
  const queue = topics.filter((t) => t.status === 'pendiente').sort((a, b) => (a.source === 'calendario' ? 1 : 0) - (b.source === 'calendario' ? 1 : 0) || a.order - b.order)
  const [mode, setMode] = useState<Mode>('cola')
  const [topicId, setTopicId] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [keyword, setKeyword] = useState('')
  const [theme, setTheme] = useState<ThemeCode>('A')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const chosen = queue.find((t) => t.id === (topicId || queue[0]?.id))

  const create = async () => {
    setBusy(true)
    setErr('')
    try {
      const body =
        mode === 'cola'
          ? { topicId: chosen?.id }
          : mode === 'idea'
            ? { title, notes, keyword, theme }
            : { title, theme, keyword, manual: true }
      const { post } = await api('post/new', { body })
      router.push(`/blog/${post.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
      setBusy(false)
    }
  }

  const ready = mode === 'cola' ? !!chosen : !!title.trim()

  return (
    <Modal open={open} onClose={onClose} title="Nuevo artículo" wide>
      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn('rounded-2xl border p-4 text-left transition', mode === m.id ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300')}
          >
            <m.icon className="h-5 w-5 text-gray-700" />
            <p className="mt-2 text-sm font-semibold text-gray-900">{m.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{m.text}</p>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {mode === 'cola' && (
          queue.length ? (
            <>
              <Field label="Tema" info="Los temas de la cola salen del calendario anual de Sergi y de las ideas que hayáis aceptado en la pestaña Temas.">
                <select className={inputCls} value={chosen?.id || ''} onChange={(e) => setTopicId(e.target.value)}>
                  {queue.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </Field>
              {chosen && (
                <div className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
                  <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full', THEME_COLOR[chosen.theme])} />
                  {THEME_NAMES[chosen.theme]} · palabra clave de partida «{chosen.keyword}» · empuja a {chosen.destination}
                </div>
              )}
            </>
          ) : (
            <Notice>No hay temas en la cola. Busca ideas en la pestaña Temas o usa «Un tema nuevo».</Notice>
          )
        )}

        {mode !== 'cola' && (
          <>
            <Field label={mode === 'manual' ? 'Título del artículo (H1)' : '¿De qué quieres que trate?'} info={mode === 'manual' ? 'Máximo 55 caracteres y con la palabra clave dentro: el control SEO te avisará si no.' : 'Escríbelo como lo dirías: «cómo reducir las citas perdidas en una clínica dental». La IA buscará cómo lo busca la gente.'}>
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === 'manual' ? 'Título' : 'Tema o idea'} />
            </Field>
            {mode === 'idea' && (
              <Field label="Notas para la IA (opcional)" info="Lo que quieras que tenga en cuenta: un caso vuestro, un enfoque, algo que no debe decir…">
                <textarea className={inputCls + ' h-24'} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Categoría" info="Agrupa el artículo en el blog y decide a qué página de venta empuja.">
                <select className={inputCls} value={theme} onChange={(e) => setTheme(e.target.value as ThemeCode)}>
                  {Object.entries(THEME_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Palabra clave (opcional)" info="Si la dejas vacía, el sistema investiga qué busca la gente y elige la mejor.">
                <input className={inputCls} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        {mode !== 'manual' && <p className="text-center text-xs text-gray-400">La IA tarda entre 3 y 6 minutos (investigación, texto, revisión SEO e imágenes). Verás el progreso en la ficha.</p>}
        {err && <Notice tone="error">{err}</Notice>}
        <div className="flex justify-center pt-1">
          <Button onClick={create} disabled={!ready || busy} className="gap-1.5 rounded-xl px-6">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'manual' ? 'Crear y empezar a escribir' : 'Que la IA lo escriba'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
