import { useRouter } from 'next/router'
import { useState } from 'react'
import { ArrowUpToLine, Check, Loader2, Newspaper, Plus, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ThemeCode, Topic } from '@/lib/blog/types'
import { cn } from '@/lib/utils'
import { api, Field, Info, inputCls, Notice, Panel, Pill, Segmented, THEME_COLOR, THEME_NAMES } from './shared'
import type { TabProps } from './types'

const SOURCE: Record<Topic['source'], { label: string; cls: string }> = {
  calendario: { label: 'Calendario anual', cls: 'bg-gray-100 text-gray-600' },
  propuesta: { label: 'Idea nueva', cls: 'bg-sky-50 text-sky-700' },
  noticia: { label: 'Actualidad', cls: 'bg-orange-50 text-orange-600' },
  manual: { label: 'Añadido a mano', cls: 'bg-indigo-50 text-indigo-600' },
}
const DEMAND = { alta: 'bg-emerald-50 text-emerald-700', media: 'bg-amber-50 text-amber-700', baja: 'bg-gray-100 text-gray-500' }

/** Tarjeta de una idea propuesta por el sistema (tema o noticia). */
function IdeaCard({ t, busy, onAction }: { t: Topic; busy: string; onAction: (id: string, act: string, body?: unknown) => void }) {
  const ev = t.evidence
  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill className={SOURCE[t.source].cls}>{SOURCE[t.source].label}</Pill>
        <Pill className="bg-gray-100 text-gray-700"><span className={cn('h-1.5 w-1.5 rounded-full', THEME_COLOR[t.theme])} />{THEME_NAMES[t.theme]}</Pill>
        {ev?.demand && <Pill className={DEMAND[ev.demand]}>Interés {ev.demand}</Pill>}
      </div>
      <p className="mt-2.5 font-medium leading-snug text-gray-900">{t.title}</p>
      <p className="mt-1 text-xs text-gray-500">Palabra clave «{t.keyword}» · empuja a {t.destination}</p>
      {t.notes && <p className="mt-2 text-sm leading-relaxed text-gray-600">{t.notes}</p>}
      {ev?.searches?.length ? (
        <div className="mt-2.5">
          <p className="mb-1 text-[11px] font-medium text-gray-500">Así lo busca la gente en Google:</p>
          <div className="flex flex-wrap gap-1">{ev.searches.map((q) => <Pill key={q} className="bg-gray-50 text-gray-700 ring-1 ring-gray-200">{q}</Pill>)}</div>
        </div>
      ) : null}
      {ev?.sources?.length ? (
        <p className="mt-2 text-[11px] text-gray-500">Fuente: {ev.sources.slice(0, 2).map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="mr-2 underline">{s.title || s.url}</a>)}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap justify-center gap-2 pt-4">
        <Button size="sm" className="gap-1 rounded-xl" disabled={!!busy} onClick={() => onAction(t.id, 'accept', { first: true })}><Check className="h-3.5 w-3.5" /> Añadir a la cola</Button>
        <Button size="sm" variant="outline" className="gap-1 rounded-xl" disabled={!!busy} onClick={() => onAction(t.id, 'write')}><Sparkles className="h-3.5 w-3.5" /> Escribirlo ya</Button>
        <Button size="sm" variant="ghost" className="gap-1 rounded-xl text-gray-500" disabled={!!busy} onClick={() => onAction(t.id, 'discard')}><X className="h-3.5 w-3.5" /> Descartar</Button>
      </div>
      {busy === t.id && <Loader2 className="mx-auto mt-2 h-4 w-4 animate-spin text-gray-400" />}
    </div>
  )
}

export default function Temas({ state, reload }: TabProps) {
  const router = useRouter()
  const [view, setView] = useState<'cola' | 'ideas'>('cola')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [focus, setFocus] = useState('')
  const [theme, setTheme] = useState<ThemeCode | ''>('')
  const [adding, setAdding] = useState(false)
  const [manual, setManual] = useState({ title: '', keyword: '', theme: 'A' as ThemeCode, notes: '' })

  const { topics, settings } = state
  const queue = topics.filter((t) => t.status === 'pendiente')
  const ordered = [...queue.filter((t) => t.source !== 'calendario').sort((a, b) => a.order - b.order), ...queue.filter((t) => t.source === 'calendario').sort((a, b) => a.order - b.order)]
  const usedCal = topics.filter((t) => t.source === 'calendario' && t.status === 'usado').length
  const ideas = topics.filter((t) => t.status === 'sugerido').sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const action = async (id: string, act: string, body?: unknown) => {
    setBusy(id)
    setErr('')
    try {
      const r = await api(`topics/${id}/${act}`, { body: body || {} })
      if (act === 'write' && r.post) return router.push(`/blog/${r.post.id}`)
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  const search = async (kind: 'propose' | 'news') => {
    setBusy(kind)
    setErr('')
    try {
      await api(`topics/${kind}`, { body: kind === 'propose' ? { focus, theme } : { count: 4 } })
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  const addManual = async () => {
    setBusy('manual')
    try {
      await api('topics/new', { body: manual })
      setManual({ title: '', keyword: '', theme: 'A', notes: '' })
      setAdding(false)
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center gap-2">
        <Segmented value={view} onChange={setView} options={[{ id: 'cola', label: `Cola (${queue.length})` }, { id: 'ideas', label: `Buscar ideas${ideas.length ? ` (${ideas.length})` : ''}` }]} />
        <Info>
          <b>Cola</b>: los temas que se van a escribir, en orden. Empieza por los 90 del calendario anual de Sergi; lo que aceptéis o añadáis a mano pasa delante.
          <br />
          <b>Buscar ideas</b>: el sistema mira qué está buscando la gente ahora y qué noticias os afectan, y os propone temas nuevos. Vosotros decidís cuáles entran en la cola.
        </Info>
      </div>
      {err && <Notice tone="error">{err}</Notice>}

      {view === 'cola' && (
        <Panel
          title="Próximos temas"
          info={`Cada vez que se acerca una fecha del calendario, el sistema coge el primer tema de esta lista. Usados del calendario anual: ${usedCal} de 90.`}
          action={<Button size="sm" variant="outline" className="gap-1 rounded-xl" onClick={() => setAdding((v) => !v)}><Plus className="h-3.5 w-3.5" /> Añadir tema</Button>}
        >
          {adding && (
            <div className="mb-4 rounded-2xl bg-gray-50 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Tema"><input className={inputCls} value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} placeholder="De qué tiene que tratar" /></Field>
                <Field label="Palabra clave (opcional)" info="Si no la sabes, déjala vacía: el sistema investigará la mejor."><input className={inputCls} value={manual.keyword} onChange={(e) => setManual({ ...manual, keyword: e.target.value })} /></Field>
                <Field label="Categoría">
                  <select className={inputCls} value={manual.theme} onChange={(e) => setManual({ ...manual, theme: e.target.value as ThemeCode })}>
                    {Object.entries(THEME_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-3"><Field label="Notas (opcional)" info="Un caso propio, un enfoque o algo que no debe decir."><input className={inputCls} value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} /></Field></div>
              <div className="mt-3 flex justify-center"><Button size="sm" className="rounded-xl" disabled={!manual.title || !!busy} onClick={addManual}>{busy === 'manual' && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Añadir al principio</Button></div>
            </div>
          )}
          {ordered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">La cola está vacía. Busca ideas nuevas o añade un tema.</p>
          ) : (
            <ol className="divide-y divide-gray-100">
              {ordered.map((t, i) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-6 text-right text-xs text-gray-400">{i + 1}</span>
                  <span className={cn('h-8 w-1 shrink-0 rounded-full', THEME_COLOR[t.theme])} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-900">{t.title}</p>
                    <p className="flex items-center gap-1.5 text-[11px] text-gray-400"><Pill className={SOURCE[t.source].cls}>{SOURCE[t.source].label}</Pill>{t.keyword}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" className="h-8 rounded-xl text-xs" disabled={!!busy} onClick={() => action(t.id, 'write')} title="La IA lo escribe ahora, sin esperar a su fecha">{busy === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Escribir ya'}</Button>
                    <Button size="sm" variant="ghost" className="h-8 rounded-xl" disabled={!!busy || i === 0} onClick={() => action(t.id, 'accept', { first: true })} title="Pasar al principio"><ArrowUpToLine className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 rounded-xl text-gray-400" disabled={!!busy} onClick={() => action(t.id, 'discard')} title="Quitar de la cola"><X className="h-3.5 w-3.5" /></Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      )}

      {view === 'ideas' && (
        <div className="space-y-5">
          <Panel title="¿Qué buscamos?" info="Para los temas, el sistema recoge búsquedas reales del autocompletado de Google, Bing y DuckDuckGo y mira qué está cambiando en el mercado. Para la actualidad, revisa las noticias de las dos últimas semanas y solo propone las que afectan a vuestros clientes. Cada búsqueda cuesta unos céntimos." center>
            <div className="mx-auto grid max-w-3xl gap-3 md:grid-cols-[2fr_1fr]">
              <Field label="Enfoque (opcional)" info="Ej.: «WhatsApp para clínicas», «AI Act», «recepcionista virtual». Vacío = temas generales del blog.">
                <input className={inputCls} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Sobre qué quieres ideas" />
              </Field>
              <Field label="Categoría">
                <select className={inputCls} value={theme} onChange={(e) => setTheme(e.target.value as ThemeCode | '')}>
                  <option value="">Cualquiera</option>
                  {Object.entries(THEME_NAMES).filter(([k]) => k !== 'N').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => search('propose')} disabled={!!busy} className="gap-1.5 rounded-xl">{busy === 'propose' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Buscar temas</Button>
              <Button variant="outline" onClick={() => search('news')} disabled={!!busy} className="gap-1.5 rounded-xl">{busy === 'news' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Newspaper className="h-4 w-4" />} Buscar noticias</Button>
            </div>
            {(busy === 'propose' || busy === 'news') && <p className="mt-3 text-center text-xs text-gray-400">Investigando… tarda alrededor de un minuto.</p>}
            <p className="mt-3 text-center text-[11px] text-gray-400">1 de cada {settings.schedule.newsEvery} artículos es de actualidad. Si no elegís noticia a tiempo, el sistema elige la más relevante.</p>
          </Panel>

          {ideas.length === 0 ? (
            <p className="text-center text-sm text-gray-400">No hay ideas pendientes de decidir.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{ideas.map((t) => <IdeaCard key={t.id} t={t} busy={busy} onAction={action} />)}</div>
          )}
        </div>
      )}
    </div>
  )
}
