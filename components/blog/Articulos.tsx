import Link from 'next/link'
import { useRouter } from 'next/router'
import { useMemo, useState } from 'react'
import { AlertCircle, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PostStatus, Topic } from '@/lib/blog/types'
import { cn } from '@/lib/utils'
import NewArticle from './NewArticle'
import { CategorySelect } from './Categories'
import { fmt, Info, inputCls, KIND_NAMES, Pill, Segmented, STATUS, StatusPill, THEME_COLOR, THEME_NAMES, ThemePill } from './shared'
import type { PostLite, TabProps } from './types'

const COLUMNS: PostStatus[] = ['idea', 'brief', 'borrador', 'revision', 'aprobado', 'publicado']
const COLUMN_INFO: Record<PostStatus, string> = {
  idea: 'Tienen tema y fecha, pero el sistema aún no ha empezado a trabajar en ellos.',
  brief: 'El sistema ya ha investigado qué busca la gente y ha preparado la estructura. Falta escribirlo.',
  borrador: 'Escrito. Si es de la IA, está pasando el control SEO; si lo escribís vosotros, está a medias.',
  revision: 'Listos para que alguien del equipo los lea y los apruebe.',
  aprobado: 'Aprobados: se publican y suben a la web solos en su fecha.',
  publicado: 'Ya están en buffaloia.com/blog.',
  rechazado: 'Descartados. Su fecha queda libre para otro tema.',
}
type View = 'tablero' | 'categorias' | 'lista'

function Card({ p, origin }: { p: PostLite; origin?: Topic['source'] }) {
  return (
    <Link href={`/blog/${p.id}`} className={cn('block overflow-hidden rounded-2xl border bg-white transition hover:shadow-sm', p.lastError ? 'border-red-200' : 'border-gray-200 hover:border-gray-300')}>
      <div className="flex">
        <span className={cn('w-1 shrink-0', THEME_COLOR[p.theme])} />
        <div className="min-w-0 flex-1 p-3">
          <p className="line-clamp-3 text-[13px] font-medium leading-snug text-gray-900">{p.h1 || p.title}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Pill className="bg-gray-100 text-gray-600">{KIND_NAMES[p.kind]}</Pill>
            {p.manual && <Pill className="bg-indigo-50 text-indigo-600">A mano</Pill>}
            {origin === 'propuesta' && <Pill className="bg-sky-50 text-sky-700">Idea nueva</Pill>}
            {typeof p.score === 'number' && <Pill className={p.score >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>SEO {p.score}</Pill>}
            {p.lastError && <Pill className="bg-red-50 text-red-600"><AlertCircle className="h-3 w-3" />Error</Pill>}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">{p.status === 'publicado' ? 'Publicado ' + fmt(p.publishedAt, false) : p.scheduledAt ? 'Sale ' + fmt(p.scheduledAt) : 'Sin fecha'}</p>
        </div>
      </div>
    </Link>
  )
}

export default function Articulos({ state, reload }: TabProps) {
  const router = useRouter()
  const [view, setView] = useState<View>('tablero')
  const [q, setQ] = useState('')
  const [theme, setTheme] = useState('')
  const [showRejected, setShowRejected] = useState(false)
  const [creating, setCreating] = useState(false)

  const topicSource = useMemo(() => new Map(state.topics.map((t) => [t.id, t.source])), [state.topics])
  const posts = state.posts.filter((p) => {
    if (!showRejected && p.status === 'rechazado') return false
    if (theme && p.theme !== theme) return false
    if (q && !`${p.h1} ${p.title} ${p.keyword}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })
  const countTheme = (t: string) => state.posts.filter((p) => p.theme === t && p.status !== 'rechazado').length
  const sortByDate = (a: PostLite, b: PostLite) => (a.scheduledAt || a.publishedAt || 'z').localeCompare(b.scheduledAt || b.publishedAt || 'z')

  return (
    <div className="space-y-5">
      {/* Una sola línea: buscar, categoría, vista y crear */}
      <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input className={inputCls + ' pl-9'} placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5 lg:w-64">
          <CategorySelect className="flex-1" value={theme} onChange={setTheme} allowAll="Todas las categorías" counts={countTheme} onCreated={reload} />
          <Info>Cada categoría tiene su color, su página en la web (buffaloia.com/blog/tema/…) y su página de venta. Con «＋ Nueva categoría» podéis crear otra.</Info>
        </div>
        <div className="flex flex-1 items-center justify-center gap-2">
          <Segmented<View> value={view} onChange={setView} options={[{ id: 'tablero', label: 'Por estado' }, { id: 'categorias', label: 'Por categoría' }, { id: 'lista', label: 'Lista' }]} />
          <Info>«Por estado» enseña en qué punto está cada artículo. «Por categoría» ayuda a ver si alguna se queda corta. «Lista» lo pone todo en una tabla.</Info>
        </div>
        <label className="flex items-center justify-center gap-2 text-xs text-gray-500">
          <input type="checkbox" className="h-3.5 w-3.5 accent-gray-900" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> Descartados
        </label>
        <Button className="gap-1.5 rounded-xl" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo artículo</Button>
      </div>

      {posts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-16 text-center text-sm text-gray-400">
          Todavía no hay artículos{theme || q ? ' con estos filtros' : ''}. Crea uno con «Nuevo artículo» o activa el piloto automático en Inicio.
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
                  <Info>{COLUMN_INFO[col]}</Info>
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
          {Object.keys(THEME_NAMES)
            .filter((t) => posts.some((p) => p.theme === t))
            .map((t) => {
              const list = posts.filter((p) => p.theme === t).sort(sortByDate)
              return (
                <div key={t} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="flex items-center gap-2 text-sm font-semibold text-gray-900"><span className={cn('h-2.5 w-2.5 rounded-full', THEME_COLOR[t])} />{THEME_NAMES[t]}</p>
                    <span className="text-xs text-gray-400">{list.length}</span>
                  </div>
                  <ul className="space-y-1">
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
                  <td className="px-3 py-2.5 text-center text-gray-600">{p.score ?? '—'}</td>
                  <td className="px-3 py-2.5"><StatusPill status={p.status} /></td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{fmt(p.publishedAt || p.scheduledAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewArticle open={creating} onClose={() => setCreating(false)} topics={state.topics} reload={reload} />
    </div>
  )
}
