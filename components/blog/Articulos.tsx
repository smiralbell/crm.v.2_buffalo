import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { Loader2, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PostStatus, ThemeCode } from '@/lib/blog/types'
import { api, Field, fmt, inputCls, Notice, Panel, Pill, STATUS, THEME_NAMES } from './shared'
import type { TabProps } from './types'

const COLUMNS: PostStatus[] = ['idea', 'brief', 'borrador', 'revision', 'aprobado', 'publicado']

export default function Articulos({ state }: TabProps) {
  const router = useRouter()
  const [showRejected, setShowRejected] = useState(false)
  const [writing, setWriting] = useState(false)
  const [form, setForm] = useState({ title: '', keyword: '', theme: 'A' as ThemeCode, body: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

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

  const posts = state.posts
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">Cada artículo avanza solo según su fecha. Pulsa uno para ver la vista previa, el control SEO y las acciones.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowRejected((v) => !v)}>
            {showRejected ? 'Ocultar' : 'Ver'} rechazados ({posts.filter((p) => p.status === 'rechazado').length})
          </Button>
          <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => setWriting((v) => !v)}>
            <PenLine className="h-4 w-4" /> Escribir yo
          </Button>
        </div>
      </div>

      {writing && (
        <Panel title="Escribir un artículo a mano">
          <p className="mb-4 text-sm text-gray-500">
            Lo redactas tú. El motor no reescribe tu texto: te propone palabra clave, título y meta si se lo pides, pasa el control SEO, genera las imágenes y lo publica cuando digas.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Título (H1)"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Palabra clave principal" hint="Déjala vacía si quieres que el motor investigue la mejor"><input className={inputCls} value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} /></Field>
            <Field label="Tema">
              <select className={inputCls} value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value as ThemeCode })}>
                {Object.entries(THEME_NAMES).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Texto" hint="Puedes pegar HTML (<h2>, <p>, <ul>...) o empezar vacío y editarlo después en la ficha del artículo.">
              <textarea className={inputCls + ' h-40 font-mono text-xs'} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </Field>
          </div>
          {err && <div className="mt-3"><Notice tone="error">{err}</Notice></div>}
          <div className="mt-4 flex justify-end">
            <Button onClick={create} disabled={!form.title || busy} className="gap-1.5 rounded-xl">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Crear y abrir
            </Button>
          </div>
        </Panel>
      )}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[...COLUMNS, ...(showRejected ? (['rechazado'] as PostStatus[]) : [])].map((col) => {
          const list = posts
            .filter((p) => p.status === col)
            .sort((a, b) => (col === 'publicado' ? (b.publishedAt || '').localeCompare(a.publishedAt || '') : (a.scheduledAt || 'z').localeCompare(b.scheduledAt || 'z')))
          return (
            <div key={col} className="rounded-2xl bg-gray-50 p-2.5">
              <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-gray-600">
                {STATUS[col].label} <span className="font-normal text-gray-400">{list.length}</span>
              </p>
              <div className="space-y-2">
                {list.map((p) => (
                  <Link key={p.id} href={`/blog/${p.id}`} className="block rounded-xl border border-gray-200 bg-white p-3 text-left hover:border-emerald-300">
                    <p className="line-clamp-3 text-[13px] font-medium leading-snug text-gray-900">{p.h1 || p.title}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Pill className="bg-gray-100 text-gray-600">{p.theme} · {THEME_NAMES[p.theme]}</Pill>
                      {p.kind === 'actualidad' && <Pill className="bg-orange-50 text-orange-700">Actualidad</Pill>}
                      {p.manual && <Pill className="bg-indigo-50 text-indigo-700">A mano</Pill>}
                      {typeof p.score === 'number' && <Pill className={p.score >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}>SEO {p.score}</Pill>}
                      {p.gaps > 0 && <Pill className="bg-violet-50 text-violet-700">{p.gaps} [SERGI]</Pill>}
                    </div>
                    <p className="mt-2 text-[11px] text-gray-500">{col === 'publicado' ? 'Publicado ' + fmt(p.publishedAt, false) : p.scheduledAt ? 'Sale ' + fmt(p.scheduledAt) : 'Sin fecha'}</p>
                  </Link>
                ))}
                {!list.length && <p className="px-1 py-4 text-center text-xs text-gray-400">—</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
