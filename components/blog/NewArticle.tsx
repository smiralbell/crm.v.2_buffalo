import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { ListOrdered, Loader2, PenLine, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Slot, Topic } from '@/lib/blog/types'
import { cn } from '@/lib/utils'
import { CategorySelect } from './Categories'
import { api, Field, fmt, inputCls, Modal, Notice, THEME_COLOR, THEME_NAMES } from './shared'
import type { NewArticleOpts } from './types'

type Mode = 'auto' | 'cola' | 'idea' | 'manual'

const MODES: { id: Mode; icon: typeof Sparkles; title: string; text: string }[] = [
  { id: 'auto', icon: Wand2, title: 'Que la IA elija', text: 'Busca lo que más se está buscando ahora sobre lo vuestro, elige el tema con más potencial y lo escribe.' },
  { id: 'cola', icon: ListOrdered, title: 'Un tema de la cola', text: 'Eliges uno de los temas preparados y la IA lo escribe.' },
  { id: 'idea', icon: Sparkles, title: 'Un tema mío', text: 'Le dices de qué hablar y la IA busca la palabra clave y lo escribe.' },
  { id: 'manual', icon: PenLine, title: 'Lo escribo yo', text: 'Redactas tú en un editor sencillo. El sistema revisa el SEO y hace las imágenes.' },
]

function nextFreeSlot(slots: Slot[]) {
  const now = new Date().toISOString()
  return [...slots].filter((s) => !s.postId && s.at > now).sort((a, b) => a.at.localeCompare(b.at))[0]
}

export default function NewArticle({
  open,
  onClose,
  topics,
  slots = [],
  preset,
  reload,
}: {
  open: boolean
  onClose: () => void
  topics: Topic[]
  slots?: Slot[]
  preset?: NewArticleOpts
  reload?: () => Promise<void>
}) {
  const router = useRouter()
  const queue = topics.filter((t) => t.status === 'pendiente').sort((a, b) => (a.source === 'calendario' ? 1 : 0) - (b.source === 'calendario' ? 1 : 0) || a.order - b.order)
  const presetSlot = preset?.slotId ? slots.find((s) => s.id === preset.slotId) : undefined
  const next = nextFreeSlot(slots)

  const [mode, setMode] = useState<Mode>('auto')
  const [topicId, setTopicId] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [keyword, setKeyword] = useState('')
  const [theme, setTheme] = useState('')
  const [schedule, setSchedule] = useState(true)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('10:00')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    setBusy(false)
    const slot = preset?.slotId ? slots.find((s) => s.id === preset.slotId) : undefined
    if (slot) {
      setSchedule(true)
      setDate(new Date(slot.at).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }))
      setTime(new Date(slot.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid', hour12: false }))
    } else if (preset?.date) {
      setSchedule(true)
      setDate(preset.date)
      setTime('10:00')
      } else {
        const free = nextFreeSlot(slots)
        setSchedule(true)
        if (free) {
          setDate(new Date(free.at).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }))
          setTime(new Date(free.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid', hour12: false }))
        } else {
          const d = new Date()
          d.setDate(d.getDate() + (d.getDay() === 5 ? 3 : d.getDay() === 6 ? 2 : 1))
          setDate(d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }))
          setTime('10:00')
        }
      }
  }, [open, preset?.slotId, preset?.date, slots])

  const chosen = queue.find((t) => t.id === (topicId || queue[0]?.id))
  const lockedSlot = Boolean(presetSlot)

  const create = async () => {
    setBusy(true)
    setErr('')
    try {
      const when = schedule
        ? {
            slotId: preset?.slotId,
            date: preset?.slotId ? undefined : date || undefined,
            time: preset?.slotId ? undefined : time || undefined,
            schedule: true,
          }
        : { schedule: false }
      const body =
        mode === 'auto'
          ? { auto: true, focus: notes, theme, ...when }
          : mode === 'cola'
            ? { topicId: chosen?.id, ...when }
            : mode === 'idea'
              ? { title, notes, keyword, theme: theme || 'A', ...when }
              : { title, theme: theme || 'A', keyword, manual: true, ...when }
      const { post } = await api('post/new', { body })
      router.push(`/blog/${post.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
      setBusy(false)
    }
  }

  const ready = mode === 'auto' ? true : mode === 'cola' ? !!chosen : !!title.trim()
  const button = { auto: 'Buscar tema y escribirlo', cola: 'Escribir este tema', idea: 'Que la IA lo escriba', manual: 'Abrir el editor' }[mode]
  const whenLabel = schedule && date ? `${new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })} a las ${time || '10:00'}` : null

  return (
    <Modal open={open} onClose={onClose} title="Nuevo artículo" wide>
      <p className="mb-4 text-sm text-gray-500">
        {presetSlot || preset?.date
          ? 'Este artículo queda en la fecha que has elegido. Puedes escribirlo tú o dejar que lo haga la IA.'
          : 'Crea un artículo ahora, sin esperar al piloto automático. Elige cómo se escribe y cuándo sale.'}
      </p>
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
              <Field label="Enfoque (opcional)" info="Si lo dejas vacío, la IA mira todo lo que hacéis y busca dónde hay más demanda ahora. Si quieres acotar, escribe algo como «clínicas» o «WhatsApp».">
                <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej.: despachos de abogados" />
              </Field>
              <Field label="Categoría (opcional)">
                <CategorySelect value={theme} onChange={setTheme} allowAll="Cualquiera" withNews={false} onCreated={reload} />
              </Field>
            </div>
          </>
        )}

        {mode === 'cola' &&
          (queue.length ? (
            <>
              <Field label="Tema" info="Los temas de la cola salen del calendario anual y de las ideas que hayáis aceptado en Temas.">
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
            <Notice>No hay temas pendientes en la cola. Elige «Que la IA elija» o «Un tema mío»: el artículo se crea igual.</Notice>
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

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-gray-900" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium text-gray-900">Ponerlo en el calendario</span>
              <span className="block text-xs text-gray-500">
                {lockedSlot
                  ? `Sale el ${fmt(presetSlot!.at)}.`
                  : next && !date
                    ? `Si no eliges día, ocupa el siguiente hueco libre (${fmt(next.at)}).`
                    : 'Elige cualquier día. Si ese día no tenía hueco, se crea uno.'}
              </span>
            </span>
          </label>
          {schedule && !lockedSlot && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Día">
                <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Hora">
                <input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
            </div>
          )}
          {schedule && whenLabel && <p className="mt-2 text-xs text-gray-500">Se publicará el {whenLabel}.</p>}
        </div>

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
