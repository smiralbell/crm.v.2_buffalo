import { useRouter } from 'next/router'
import { useState } from 'react'
import { ArrowUpToLine, Check, Loader2, Plus, Search, Sparkles, Newspaper, X, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ThemeCode, Topic } from '@/lib/blog/types'
import { api, Field, inputCls, Notice, Panel, Pill, THEME_NAMES } from './shared'
import type { TabProps } from './types'
import { cn } from '@/lib/utils'

const SUB = [
  ['cola', 'Cola'],
  ['proponer', 'Proponer temas nuevos'],
  ['actualidad', 'Actualidad'],
  ['calendario', 'Calendario anual (90)'],
  ['nuevo', 'Añadir tema'],
] as const

const SOURCE_LABEL: Record<Topic['source'], string> = { calendario: 'Calendario', propuesta: 'Propuesta IA', noticia: 'Noticia', manual: 'Manual' }
const DEMAND_CLS = { alta: 'bg-emerald-50 text-emerald-700', media: 'bg-amber-50 text-amber-800', baja: 'bg-gray-100 text-gray-600' }

function TopicCard({ t, onAction, busy }: { t: Topic; onAction: (id: string, action: string, body?: unknown) => void; busy: string }) {
  const ev = t.evidence
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill className="bg-gray-100 text-gray-600">{t.theme} · {THEME_NAMES[t.theme]}</Pill>
        <Pill className="bg-sky-50 text-sky-700">{SOURCE_LABEL[t.source]}</Pill>
        {ev?.demand && <Pill className={DEMAND_CLS[ev.demand]}>Demanda {ev.demand}</Pill>}
        {t.kind === 'pilar' && <Pill className="bg-indigo-50 text-indigo-700">Guía pilar</Pill>}
      </div>
      <p className="mt-2 font-medium text-gray-900">{t.title}</p>
      <p className="mt-1 text-sm text-gray-600">
        Palabra clave: <b className="font-medium text-gray-800">{t.keyword}</b> · Enlaza a <span className="text-emerald-700">{t.destination}</span>
      </p>
      {t.notes && <p className="mt-2 text-sm text-gray-600">{t.notes}</p>}
      {ev?.whyNow && <p className="mt-1 text-xs text-gray-500">Por qué ahora: {ev.whyNow}</p>}
      {ev?.searches?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="text-[11px] text-gray-500">La gente busca:</span>
          {ev.searches.map((q) => <Pill key={q} className="bg-gray-50 text-gray-700 ring-1 ring-gray-200">{q}</Pill>)}
        </div>
      ) : null}
      {ev?.links?.length ? <p className="mt-1 text-[11px] text-gray-500">Enlazaría con: {ev.links.join(' · ')}</p> : null}
      {ev?.sources?.length ? (
        <p className="mt-1 text-[11px] text-gray-500">
          Fuentes: {ev.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="mr-2 underline">{s.title || s.url}</a>)}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {t.status === 'sugerido' && (
          <>
            <Button size="sm" className="gap-1 rounded-lg" disabled={!!busy} onClick={() => onAction(t.id, 'accept', { first: true })}><Check className="h-3.5 w-3.5" /> Aceptar (al principio de la cola)</Button>
            <Button size="sm" variant="outline" className="gap-1 rounded-lg" disabled={!!busy} onClick={() => onAction(t.id, 'accept')}>Aceptar al final</Button>
          </>
        )}
        {t.status === 'pendiente' && (
          <>
            <Button size="sm" variant="outline" className="gap-1 rounded-lg" disabled={!!busy} onClick={() => onAction(t.id, 'write')}><PenLine className="h-3.5 w-3.5" /> Escribirlo ya</Button>
            <Button size="sm" variant="outline" className="gap-1 rounded-lg" disabled={!!busy} onClick={() => onAction(t.id, 'accept', { first: true })}><ArrowUpToLine className="h-3.5 w-3.5" /> Pasar al principio</Button>
          </>
        )}
        {t.status !== 'descartado' && t.status !== 'usado' && (
          <Button size="sm" variant="ghost" className="gap-1 rounded-lg text-gray-500" disabled={!!busy} onClick={() => onAction(t.id, 'discard')}><X className="h-3.5 w-3.5" /> Descartar</Button>
        )}
        {t.status === 'descartado' && <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => onAction(t.id, 'restore')}>Recuperar</Button>}
        {busy === t.id && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      </div>
    </div>
  )
}

export default function Temas({ state, reload }: TabProps) {
  const router = useRouter()
  const [sub, setSub] = useState<(typeof SUB)[number][0]>('cola')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [focus, setFocus] = useState('')
  const [theme, setTheme] = useState<ThemeCode | ''>('')
  const [count, setCount] = useState(state.settings.topics.proposalsPerSearch)
  const [manual, setManual] = useState({ title: '', keyword: '', theme: 'A' as ThemeCode, destination: '/auditoria/', notes: '' })

  const topics = state.topics
  const queue = topics.filter((t) => t.status === 'pendiente' && t.source !== 'noticia')
  const queueOrdered = [
    ...queue.filter((t) => t.source !== 'calendario'),
    ...queue.filter((t) => t.source === 'calendario'),
  ]
  const suggested = topics.filter((t) => t.status === 'sugerido' && t.source === 'propuesta').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const news = topics.filter((t) => t.source === 'noticia' && t.status !== 'descartado' && t.status !== 'usado').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const calendar = topics.filter((t) => t.source === 'calendario').sort((a, b) => a.order - b.order)

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
      await api(`topics/${kind}`, { body: kind === 'propose' ? { focus, theme, count } : { count: 4 } })
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
      setManual({ title: '', keyword: '', theme: 'A', destination: '/auditoria/', notes: '' })
      await reload()
      setSub('cola')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  const sourceNote = { calendario: 'Ahora mismo el motor usa el calendario anual.', propuestas: 'Ahora mismo el motor sólo usa los temas que aceptáis.', mixto: 'Ahora mismo el motor usa primero los temas que aceptáis y, si no hay, el calendario anual.' }[state.settings.topics.source]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {SUB.map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} className={cn('rounded-full px-3 py-1.5 text-sm', sub === id ? 'bg-emerald-50 font-medium text-emerald-700' : 'text-gray-600 hover:bg-gray-100')}>
            {label}
            {id === 'proponer' && suggested.length ? ` (${suggested.length})` : ''}
            {id === 'actualidad' && news.filter((n) => n.status === 'sugerido').length ? ` (${news.filter((n) => n.status === 'sugerido').length})` : ''}
          </button>
        ))}
      </div>
      {err && <Notice tone="error">{err}</Notice>}

      {sub === 'cola' && (
        <Panel title={`Próximos temas (${queueOrdered.length})`} action={<span className="text-xs text-gray-500">{sourceNote} Se cambia en Configuración.</span>}>
          <ol className="divide-y divide-gray-100">
            {queueOrdered.slice(0, 40).map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <span className="w-6 text-right text-xs text-gray-400">{i + 1}</span>
                <Pill className="bg-gray-100 text-gray-600">{t.theme}</Pill>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-900">{t.title}</p>
                  <p className="text-[11px] text-gray-500">{SOURCE_LABEL[t.source]} · {t.keyword} → {t.destination}</p>
                </div>
                <Button size="sm" variant="ghost" className="h-8 rounded-lg text-xs" disabled={!!busy} onClick={() => action(t.id, 'write')}>Escribirlo ya</Button>
                <Button size="sm" variant="ghost" className="h-8 rounded-lg text-xs" disabled={!!busy} onClick={() => action(t.id, 'accept', { first: true })} title="Pasar al principio"><ArrowUpToLine className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-8 rounded-lg text-xs text-gray-400" disabled={!!busy} onClick={() => action(t.id, 'discard')} title="Descartar"><X className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {sub === 'proponer' && (
        <div className="space-y-4">
          <Panel title="Buscar temas que la gente está buscando ahora">
            <p className="mb-4 text-sm text-gray-500">
              El motor recoge búsquedas reales del autocompletado de Google, Bing y DuckDuckGo, mira qué está cambiando en el mercado y propone temas con su palabra clave, la página de la web que empujarían y con qué enlazarían. Vosotros elegís.
            </p>
            <div className="grid gap-3 md:grid-cols-[2fr_1fr_120px_auto] md:items-end">
              <Field label="¿Sobre qué? (opcional)" hint="Ej.: «WhatsApp para clínicas», «AI Act», «recepcionista virtual». Vacío = temas generales del blog.">
                <input className={inputCls} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Tema libre" />
              </Field>
              <Field label="Tema del blog">
                <select className={inputCls} value={theme} onChange={(e) => setTheme(e.target.value as ThemeCode | '')}>
                  <option value="">Cualquiera</option>
                  {Object.entries(THEME_NAMES).filter(([k]) => k !== 'N').map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
                </select>
              </Field>
              <Field label="Cuántos"><input type="number" min={2} max={12} className={inputCls} value={count} onChange={(e) => setCount(Number(e.target.value))} /></Field>
              <Button onClick={() => search('propose')} disabled={!!busy} className="gap-1.5 rounded-xl">
                {busy === 'propose' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Proponer
              </Button>
            </div>
            {busy === 'propose' && <p className="mt-3 text-xs text-gray-500">Investigando búsquedas reales y el mercado… tarda alrededor de un minuto.</p>}
          </Panel>
          {suggested.length === 0 ? (
            <p className="text-sm text-gray-500">No hay propuestas pendientes.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">{suggested.map((t) => <TopicCard key={t.id} t={t} onAction={action} busy={busy} />)}</div>
          )}
        </div>
      )}

      {sub === 'actualidad' && (
        <div className="space-y-4">
          <Panel title="Actualidad que afecta a vuestros clientes">
            <p className="mb-4 text-sm text-gray-500">
              1 de cada {state.settings.schedule.newsEvery} artículos es de actualidad, en un hueco aleatorio. Si al llegar su fecha no habéis elegido ninguna noticia, el motor elige la más relevante de las dos últimas semanas. Aquí podéis buscarlas y elegir antes.
            </p>
            <Button onClick={() => search('news')} disabled={!!busy} className="gap-1.5 rounded-xl">
              {busy === 'news' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Newspaper className="h-4 w-4" />} Buscar noticias relevantes
            </Button>
          </Panel>
          {news.length === 0 ? <p className="text-sm text-gray-500">No hay noticias guardadas.</p> : <div className="grid gap-3 lg:grid-cols-2">{news.map((t) => <TopicCard key={t.id} t={t} onAction={action} busy={busy} />)}</div>}
        </div>
      )}

      {sub === 'calendario' && (
        <Panel title="Calendario anual del brief (90 temas)" action={<span className="text-xs text-gray-500">Se usan en este orden, en los huecos aleatorios. Las fechas del brief no se aplican.</span>}>
          <ol className="divide-y divide-gray-100">
            {calendar.map((t) => (
              <li key={t.id} className={cn('flex items-center gap-3 py-2', t.status !== 'pendiente' && 'opacity-60')}>
                <span className="w-6 text-right text-xs text-gray-400">{t.order}</span>
                <Pill className="bg-gray-100 text-gray-600">{t.theme}</Pill>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-900">{t.title}</p>
                  <p className="text-[11px] text-gray-500">{t.keyword} → {t.destination} · {t.ownMaterial}</p>
                </div>
                <Pill className={t.status === 'usado' ? 'bg-emerald-50 text-emerald-700' : t.status === 'descartado' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-500'}>{t.status}</Pill>
                {t.status === 'descartado' ? (
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => action(t.id, 'restore')}>Recuperar</Button>
                ) : t.status === 'pendiente' ? (
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-gray-400" onClick={() => action(t.id, 'discard')}><X className="h-3.5 w-3.5" /></Button>
                ) : null}
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {sub === 'nuevo' && (
        <Panel title="Añadir un tema a la cola">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Título de trabajo"><input className={inputCls} value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} /></Field>
            <Field label="Palabra clave (hipótesis)" hint="El brief la valida con búsquedas reales"><input className={inputCls} value={manual.keyword} onChange={(e) => setManual({ ...manual, keyword: e.target.value })} /></Field>
            <Field label="Tema">
              <select className={inputCls} value={manual.theme} onChange={(e) => setManual({ ...manual, theme: e.target.value as ThemeCode })}>
                {Object.entries(THEME_NAMES).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
              </select>
            </Field>
            <Field label="Página de venta a la que empuja"><input className={inputCls} value={manual.destination} onChange={(e) => setManual({ ...manual, destination: e.target.value })} /></Field>
          </div>
          <div className="mt-3"><Field label="Notas y material propio"><textarea className={inputCls + ' h-24'} value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} /></Field></div>
          <div className="mt-4 flex justify-end">
            <Button onClick={addManual} disabled={!manual.title || !!busy} className="gap-1.5 rounded-xl">{busy === 'manual' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Añadir al principio de la cola</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}
