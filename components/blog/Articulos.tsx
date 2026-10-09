import Link from 'next/link'
import { useRouter } from 'next/router'
import { useMemo, useState } from 'react'
import { Loader2, PenLine, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PostKind, PostStatus, ThemeCode, Topic } from '@/lib/blog/types'
import { cn } from '@/lib/utils'
import { api, chipCls, Field, fmt, inputCls, KIND_NAMES, Notice, Panel, Pill, Segmented, STATUS, StatusPill, THEME_COLOR, THEME_NAMES, ThemePill } from './shared'
import type { PostLite, TabProps } from './types'

const COLUMNS: PostStatus[] = ['idea', 'brief', 'borrador', 'revision', 'aprobado', 'publicado']
type View = 'tablero' | 'categorias' | 'lista'

function Card({ p, origin }: { p: PostLite; origin?: Topic['source'] }) {
  return (
    <Link href={`/blog/${p.id}`} className="block overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:border-gray-300 hover:shadow-sm">
      <div className="flex">
        <span className={cn('w-1 shrink-0', THEME_COLOR[p.theme])} />
        <div className="min-w-0 flex-1 p-3">
          <p className="line-clamp-3 text-[13px] font-medium leading-snug text-gray-900">{p.h1 || p.title}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Pill className="bg-gray-100 text-gray-600">{KIND_NAMES[p.kind]}</Pill>
            {p.manual && <Pill className="bg-indigo-50 text-indigo-600">A mano</Pill>}
            {origin === 'propuesta' && <Pill className="bg-sky-50 text-sky-700">Propuesta IA</Pill>}
            {typeof p.score === 'number' && <Pill className={p.score >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>SEO {p.score}</Pill>}
            {p.gaps > 0 && <Pill className="bg-violet-50 text-violet-700">{p.gaps} [SERGI]</Pill>}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">{p.status === 'publicado' ? 'Publicado ' + fmt(p.publishedAt, false) : p.scheduledAt ? 'Sale ' + fmt(p.scheduledAt) : 'Sin fecha'}</p>
        </div>
      </div>
    </Link>
  )
}

export default function Articulos({ state }: TabProps) {
  const router = useRouter()
  const [view, setView] = useState<View>('tablero')
  const [q, setQ] = useState('')
  const [theme, setTheme] = useState<ThemeCode | ''>('')
  const [kind, setKind] = useState<PostKind | ''>('')
  const [origin, setOrigin] = useState<Topic['source'] | 'manual-post' | ''>('')
  const [showRejected, setShowRejected] = useState(false)
  const [writing, setWriting] = useState(false)
  const [form, setForm] = useState({ title: '', keyword: '', theme: 'A' as ThemeCode, body: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const topicSource = useMemo(() => new Map(state.topics.map((t) => [t.id, t.source])), [state.topics])
  const originOf = (p: PostLite): Topic['source'] | 'manual-post' => (p.manual ? 'manual-post' : (p.topicId && topicSource.get(p.topicId)) || 'manual')

  const posts = state.posts.filter((p) => {
    if (!showRejected && p.status === 'rechazado') return false
    if (theme && p.theme !== theme) return false
    if (kind && p.kind !== kind) return false
    if (origin && originOf(p) !== origin) return false
    if (q && !`${p.h1} ${p.title} ${p.keyword}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })
  const countTheme = (t: ThemeCode) => state.posts.filter((p) => p.theme === t && p.status !== 'rechazado').length

  const create = async () => {
    setBusy(true)
    setErr('')
    try {
      const { post } = await api('post/new', { body: { ...form, h1: form.title, manual: true } })
      router.push(`/blog/${post.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
      setBusy(false)
    }
  }

  const sortByDate = (a: PostLite, b: PostLite) => (a.scheduledAt || a.publishedAt || 'z').localeCompare(b.scheduledAt || b.publishedAt || 'z')

  return (
    <div className="space-y-5">
      {/* Barra de clasificación */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full flex-col items-center justify-between gap-3 md:flex-row">
          <div className="relative w-full md:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input className={inputCls + ' pl-9'} placeholder="Buscar por título o palabra clave" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Segmented<View> value={view} onChange={setView} options={[{ id: 'tablero', label: 'Por estado' }, { id: 'categorias', label: 'Por categoría' }, { id: 'lista', label: 'Lista' }]} />
          <Button className="gap-1.5 rounded-xl" onClick={() => setWriting((v) => !v)}><PenLine className="h-4 w-4" /> Escribir yo</Button>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          <button className={chipCls(!theme)} onClick={() => setTheme('')}>Todas las categorías</button>
          {(Object.keys(THEME_NAMES) as ThemeCode[]).map((t) => (
            <button key={t} className={cn(chipCls(theme === t), 'inline-flex items-center gap-1.5')} onClick={() => setTheme(theme === t ? '' : t)}>
              <span className={cn('h-2 w-2 rounded-full', THEME_COLOR[t])} />
              {THEME_NAMES[t]} <span className={theme === t ? 'text-white/60' : 'text-gray-400'}>{countTheme(t)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <select className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700" value={kind} onChange={(e) => setKind(e.target.value as PostKind | '')}>
            <option value="">Todos los tipos</option>
            {Object.entries(KIND_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700" value={origin} onChange={(e) => setOrigin(e.target.value as typeof origin)}>
            <option value="">Cualquier origen</option>
            <option value="calendario">Calendario anual</option>
            <option value="propuesta">Propuestas de la IA</option>
            <option value="noticia">Noticias</option>
            <option value="manual">Temas añadidos a mano</option>
            <option value="manual-post">Escritos a mano</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" className="h-4 w-4 accent-gray-900" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> Ver rechazados
          </label>
        </div>
      </div>

      {writing && (
        <Panel title="Escribir un artículo a mano" center>
          <p className="mx-auto mb-4 max-w-2xl text-center text-sm text-gray-500">
            Lo redactas tú. El motor no reescribe tu texto: te propone palabra clave, título y meta si se lo pides, pasa el control SEO, genera las imágenes y lo publica cuando digas.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Título (H1)"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Palabra clave principal" hint="Vacía = el motor investiga la mejor"><input className={inputCls} value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} /></Field>
            <Field label="Categoría">
              <select className={inputCls} value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value as ThemeCode })}>
                {Object.entries(THEME_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Texto" hint="Puedes pegar HTML (<h2>, <p>, <ul>…) o empezar vacío y editarlo en la ficha del artículo.">
              <textarea className={inputCls + ' h-40 font-mono text-xs'} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </Field>
          </div>
          {err && <div className="mt-3"><Notice tone="error">{err}</Notice></div>}
          <div className="mt-4 flex justify-center">
            <Button onClick={create} disabled={!form.title || busy} className="gap-1.5 rounded-xl">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Crear y abrir</Button>
          </div>
        </Panel>
      )}

      {posts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-16 text-center text-sm text-gray-400">
          No hay artículos con estos filtros. Los artículos aparecen cuando el motor asigna un tema a un hueco del calendario, o cuando pulsas «Escribirlo ya» en un tema.
        </div>
      )}

      {posts.length > 0 && view === 'tablero' && (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[...COLUMNS, ...(showRejected ? (['rechazado'] as PostStatus[]) : [])].map((col) => {
            const list = posts.filter((p) => p.status === col).sort(col === 'publicado' ? (a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') : sortByDate)
            return (
              <div key={col} className="rounded-2xl bg-gray-50 p-2.5">
                <p className="mb-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-600">
                  <span className={cn('h-2 w-2 rounded-full', STATUS[col].dot)} /> {STATUS[col].label} <span className="font-normal text-gray-400">{list.length}</span>
                </p>
                <div className="space-y-2">
                  {list.map((p) => <Card key={p.id} p={p} origin={p.topicId ? topicSource.get(p.topicId) : undefined} />)}
                  {!list.length && <p className="py-6 text-center text-xs text-gray-300">—</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {posts.length > 0 && view === 'categorias' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(THEME_NAMES) as ThemeCode[])
            .filter((t) => posts.some((p) => p.theme === t))
            .map((t) => {
              const list = posts.filter((p) => p.theme === t).sort(sortByDate)
              return (
                <div key={t} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="flex items-center gap-2 text-sm font-semibold text-gray-900"><span className={cn('h-2.5 w-2.5 rounded-full', THEME_COLOR[t])} />{THEME_NAMES[t]}</p>
                    <span className="text-xs text-gray-400">{list.length}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {list.map((p) => (
                      <li key={p.id}>
                        <Link href={`/blog/${p.id}`} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-gray-50">
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS[p.status].dot)} title={STATUS[p.status].label} />
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{p.h1 || p.title}</span>
                          <span className="shrink-0 text-[11px] text-gray-400">{fmt(p.publishedAt || p.scheduledAt, false)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
        </div>
      )}

      {posts.length > 0 && view === 'lista' && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Artículo</th>
                <th className="px-3 py-2.5 text-left font-medium">Categoría</th>
                <th className="px-3 py-2.5 text-left font-medium">Tipo</th>
                <th className="px-3 py-2.5 text-center font-medium">SEO</th>
                <th className="px-3 py-2.5 text-left font-medium">Estado</th>
                <th className="px-4 py-2.5 text-right font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {posts.slice().sort(sortByDate).map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-gray-50" onClick={() => router.push(`/blog/${p.id}`)}>
                  <td className="max-w-md px-4 py-2.5"><p className="truncate font-medium text-gray-900">{p.h1 || p.title}</p><p className="truncate text-xs text-gray-400">{p.keyword || 'sin palabra clave'}</p></td>
                  <td className="px-3 py-2.5"><ThemePill theme={p.theme} /></td>
                  <td className="px-3 py-2.5 text-gray-600">{KIND_NAMES[p.kind]}</td>
                  <td className="px-3 py-2.5 text-center text-gray-600">{p.score ?? '—'}</td>
                  <td className="px-3 py-2.5"><StatusPill status={p.status} /></td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{fmt(p.publishedAt || p.scheduledAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
