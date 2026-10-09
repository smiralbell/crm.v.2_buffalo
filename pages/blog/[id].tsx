import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, ExternalLink, ImageIcon, Loader2, Save, X } from 'lucide-react'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth'
import type { Post, Theme } from '@/lib/blog/types'
import { cn } from '@/lib/utils'
import RichEditor from '@/components/blog/RichEditor'
import { CategorySelect } from '@/components/blog/Categories'
import { api, Field, fmt, Info, inputCls, KIND_NAMES, Notice, Panel, Pill, registerThemes, Segmented, StatusPill, ThemePill } from '@/components/blog/shared'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin') return { redirect: { destination: '/dashboard', permanent: false } }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

/** Fases que se enseñan mientras la IA trabaja, con el evento del historial que marca cada una. */
const PHASES: [string, string][] = [
  ['Elegir tema', 'Tema elegido'],
  ['Investigación', 'Brief generado'],
  ['Texto', 'Borrador escrito'],
  ['Revisión SEO', 'Control SEO'],
  ['Imágenes', 'Imágenes generadas'],
]

export default function BlogPostPage() {
  const { query, push } = useRouter()
  const id = query.id as string
  const [post, setPost] = useState<Post | null>(null)
  const [working, setWorking] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [v, setV] = useState(0)
  const [left, setLeft] = useState<'seo' | 'datos' | 'investigacion'>('seo')
  const [main, setMain] = useState<'vista' | 'escribir' | null>(null)
  const [redoOpen, setRedoOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [startedAt] = useState(() => new Date().toISOString())

  const load = useCallback(async () => {
    if (!id) return
    try {
      const r = await api<{ post: Post; working: boolean; themes: Theme[] }>(`post/${id}`)
      registerThemes(r.themes)
      setPost((prev) => (dirty && prev ? prev : r.post))
      setWorking((was) => {
        if (was && !r.working) setV((x) => x + 1)
        return r.working
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    }
  }, [id, dirty])
  useEffect(() => void load(), [load])
  useEffect(() => {
    if (!working) return
    const t = setInterval(() => void load(), 4000)
    return () => clearInterval(t)
  }, [working, load])

  const act = async (key: string, path: string, body: unknown = {}, method?: string) => {
    setBusy(key)
    setErr('')
    setMsg('')
    setRedoOpen(false)
    try {
      const r = await api<{ post?: Post; working?: boolean; message?: string }>(`post/${id}${path}`, { body, method })
      if (key === 'delete') return push('/blog?tab=articulos')
      if (r.post) setPost(r.post)
      if (key === 'save') setDirty(false)
      if (r.message) setMsg(r.message)
      if (r.working) setWorking(true)
      else setV((x) => x + 1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  if (!post) return <Layout><div className="flex justify-center py-24 text-gray-400">{err || <Loader2 className="h-6 w-6 animate-spin" />}</div></Layout>

  const mainView = main ?? (post.manual ? 'escribir' : 'vista')
  const set = (k: keyof Post, val: unknown) => {
    setDirty(true)
    setPost({ ...post, [k]: val } as Post)
  }
  const save = () => act('save', '', { h1: post.h1, slug: post.slug, metaDescription: post.metaDescription, keyword: post.keyword, secondary: post.secondary, excerpt: post.excerpt, body: post.body, theme: post.theme }, 'PUT')
  const r = post.brief?.research
  const fails = (post.checks || []).filter((c) => !c.ok && c.severity === 'error').length
  const gaps = (post.body.match(/\[SERGI:/g) || []).length
  const doneSince = (event: string) => post.history.some((h) => h.event.startsWith(event) && h.at >= startedAt)
  const live = post.status === 'publicado'
  const auto = post.history.some((h) => h.event === 'La IA está eligiendo el tema')
  const phases = PHASES.filter(([l]) => auto || l !== 'Elegir tema').filter(([l]) => !post.manual || ['Investigación', 'Revisión SEO', 'Imágenes'].includes(l))

  const redo: [string, string, string][] = post.manual
    ? [
        ['brief', 'Sugerirme palabra clave y SEO', 'Investiga qué busca la gente y propone palabra clave, título, URL y descripción. No toca tu texto.'],
        ['control', 'Revisar el SEO', 'Comprueba tu texto contra las normas, sin cambiarlo.'],
        ['imagenes', 'Generar las imágenes', 'Crea la destacada, la de apoyo y la infografía.'],
      ]
    : [
        ['brief', 'Volver a investigar', 'Busca otra vez qué busca la gente y rehace la estructura.'],
        ['borrador', 'Reescribir el texto', 'Escribe el artículo de nuevo con la investigación actual.'],
        ['control', 'Corregir el SEO', 'Corrige solo lo que no cumple las normas.'],
        ['imagenes', 'Rehacer las imágenes', 'Genera de nuevo las 3 imágenes.'],
      ]

  return (
    <Layout>
      <div className="space-y-4">
        {/* Cabecera compacta: título a la izquierda, acciones a la derecha */}
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-3.5 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Link href="/blog?tab=articulos" className="mr-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"><ArrowLeft className="h-3.5 w-3.5" /> Artículos</Link>
                <StatusPill status={post.status} />
                <ThemePill theme={post.theme} />
                <Pill className="bg-gray-100 text-gray-600">{KIND_NAMES[post.kind]}</Pill>
                {typeof post.score === 'number' && <Pill className={post.score >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>SEO {post.score}/100</Pill>}
              </div>
              <h1 className="mt-1.5 truncate text-lg font-semibold text-gray-900" title={post.h1 || post.title}>{post.h1 || post.title}</h1>
              <p className="text-xs text-gray-500">
                {live ? `Publicado el ${fmt(post.publishedAt)}` : post.scheduledAt ? `Sale el ${fmt(post.scheduledAt)}` : 'Sin fecha: al aprobarlo ocupa el siguiente hueco libre'}
                {post.keyword ? ` · «${post.keyword}»` : ''} · {(post.cost?.usd || 0).toFixed(2)} $
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {dirty && <Button size="sm" className="gap-1.5 rounded-xl" disabled={!!busy} onClick={save}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar</Button>}
              {!live && post.status !== 'aprobado' && post.status !== 'rechazado' && (
                <span className="flex items-center gap-1">
                  <Button size="sm" variant={dirty ? 'outline' : 'default'} className="gap-1.5 rounded-xl" disabled={!!busy || working || !post.body || dirty} onClick={() => act('approve', '/approve')}>
                    {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprobar
                  </Button>
                  <Info>Lo dais por bueno. Se publica y se sube a la web solo, en su fecha del calendario. Si queréis que salga ya, usad «Publicar ahora».</Info>
                </span>
              )}
              {!live && post.body && post.status !== 'rechazado' && (
                <Button size="sm" variant={post.status === 'aprobado' ? 'default' : 'outline'} className="rounded-xl" disabled={!!busy || working || dirty} onClick={() => confirm('¿Publicarlo ahora en buffaloia.com, sin esperar a su fecha?') && act('publish', '/publish')}>
                  {busy === 'publish' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Publicar ahora
                </Button>
              )}
              {live && <a className="inline-flex h-9 items-center gap-1 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50" href={`https://buffaloia.com/blog/${post.slug}/`} target="_blank" rel="noreferrer">Ver en la web <ExternalLink className="h-3.5 w-3.5" /></a>}
              {live && <Button size="sm" variant="outline" className="rounded-xl" disabled={!!busy} onClick={() => confirm('¿Retirarlo de la web?') && act('unpublish', '/unpublish')}>Retirar de la web</Button>}

              <div className="relative">
                <Button size="sm" variant="outline" className="gap-1 rounded-xl" disabled={!!busy || working} onClick={() => setRedoOpen((o) => !o)}>{post.manual ? 'Ayuda de la IA' : 'Rehacer'} <ChevronDown className="h-4 w-4" /></Button>
                {redoOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-1.5 text-left shadow-lg">
                    {redo.map(([k, l, d]) => (
                      <button key={k} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-gray-50" onClick={() => (dirty ? alert('Guarda los cambios primero.') : act(k, '/step', { step: k }))}>
                        <span className="block text-sm font-medium text-gray-900">{l}</span>
                        <span className="block text-xs text-gray-500">{d}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {post.status === 'rechazado' ? (
                <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => act('reopen', '/reopen')}>Recuperar</Button>
              ) : !live ? (
                <Button size="sm" variant="ghost" className="rounded-xl text-gray-500" disabled={!!busy || working} onClick={() => { const reason = prompt('¿Por qué lo descartas? (opcional)'); if (reason !== null) void act('reject', '/reject', { reason }) }}>Descartar</Button>
              ) : null}
              <Button size="sm" variant="ghost" className="rounded-xl text-gray-400" disabled={!!busy || working} onClick={() => confirm('¿Eliminar el artículo para siempre?') && act('delete', '/delete')}>Eliminar</Button>
            </div>
          </div>
        </div>

        {working && (
          <div className="rounded-2xl border border-gray-200 bg-white px-5 py-3.5 text-center shadow-sm">
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-gray-900"><Loader2 className="h-4 w-4 animate-spin" /> La IA está trabajando · puedes salir de esta página, sigue sola</p>
            <div className="mt-2.5 flex flex-wrap justify-center gap-2">
              {phases.map(([label, event]) => (
                <Pill key={label} className={doneSince(event) ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}>{doneSince(event) && <Check className="h-3 w-3" />}{label}</Pill>
              ))}
            </div>
          </div>
        )}
        {post.lastError && !working && <Notice tone="error"><b>No se pudo completar ({post.lastError.step}).</b> {post.lastError.message} — usa «{post.manual ? 'Ayuda de la IA' : 'Rehacer'}» para intentarlo otra vez.</Notice>}
        {msg && <Notice tone="ok">{msg}</Notice>}
        {err && <Notice tone="error">{err}</Notice>}
        {!working && gaps > 0 && <Notice tone="warn">Hay {gaps} {gaps === 1 ? 'hueco' : 'huecos'} <b>[SERGI: …]</b> donde hace falta un caso o dato vuestro. Complétalos en «Escribir» antes de aprobar.</Notice>}
        {!working && post.body && fails > 0 && !live && <Notice tone="warn">{fails} {fails === 1 ? 'norma SEO no se cumple' : 'normas SEO no se cumplen'}. Mira «Revisión SEO» a la izquierda.</Notice>}

        <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
          {/* Columna izquierda */}
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Segmented value={left} onChange={setLeft} options={[{ id: 'seo', label: 'Revisión SEO' }, { id: 'datos', label: 'Datos SEO' }, { id: 'investigacion', label: 'Investigación' }]} />
              <Info>
                <b>Revisión SEO</b>: cada norma, en verde si se cumple.<br />
                <b>Datos SEO</b>: título, URL, descripción para Google y palabras clave.<br />
                <b>Investigación</b>: qué busca la gente, la competencia y las fuentes.
              </Info>
            </div>

            {left === 'seo' && (
              <Panel title={post.checks?.length ? `${post.checks.filter((c) => c.ok).length} de ${post.checks.length} normas` : 'Revisión SEO'} info="Las rojas impiden pasar a revisión (la IA las corrige sola en sus artículos); las amarillas son avisos.">
                {!post.checks?.length ? <p className="py-6 text-center text-sm text-gray-400">{post.manual ? 'Escribe el texto y pulsa «Ayuda de la IA → Revisar el SEO».' : 'Aún no hay texto que revisar.'}</p> : (
                  <ul className="space-y-2">
                    {post.checks.slice().sort((a, b) => Number(a.ok) - Number(b.ok)).map((c) => (
                      <li key={c.id} className="flex gap-2.5 text-xs">
                        <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full', c.ok ? 'bg-emerald-50 text-emerald-600' : c.severity === 'error' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600')}>
                          {c.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        </span>
                        <span><b className="font-medium text-gray-800">{c.label}</b><span className="block text-gray-500">{c.detail}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}

            {left === 'datos' && (
              <Panel title="Datos SEO" info="Lo que lee Google. Al guardar se vuelve a revisar; si ya está publicado, se actualiza también en la web.">
                <div className="space-y-3">
                  <Field label={`Título · ${post.h1.length}/55`} info="El H1: lo primero que se lee y lo que más pesa para Google. Con la palabra clave."><input className={inputCls} value={post.h1} onChange={(e) => set('h1', e.target.value)} /></Field>
                  <Field label={`URL · ${post.slug.length}/70`} info="buffaloia.com/blog/esta-parte/. Con la palabra clave y guiones."><input className={inputCls} value={post.slug} onChange={(e) => set('slug', e.target.value)} /></Field>
                  <Field label={`Descripción para Google · ${post.metaDescription.length}/155`} info="El texto gris bajo el título en los resultados de Google."><textarea className={inputCls + ' h-20'} value={post.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} /></Field>
                  <Field label="Palabra clave principal" info="La búsqueda para la que quiere posicionar."><input className={inputCls} value={post.keyword} onChange={(e) => set('keyword', e.target.value)} /></Field>
                  <Field label="Secundarias" info="Separadas por comas. Variantes que también debe cubrir."><input className={inputCls} value={post.secondary.join(', ')} onChange={(e) => set('secondary', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></Field>
                  <Field label="Categoría"><CategorySelect value={post.theme} onChange={(c) => set('theme', c)} /></Field>
                  <Field label="Resumen para la portada del blog" info="Las dos frases que salen en la tarjeta del artículo."><textarea className={inputCls + ' h-16'} value={post.excerpt} onChange={(e) => set('excerpt', e.target.value)} /></Field>
                </div>
              </Panel>
            )}

            {left === 'investigacion' && (
              <Panel title="Investigación" info="Lo que encontró el sistema antes de escribir. Las búsquedas salen del autocompletado real de Google, Bing y DuckDuckGo.">
                {!r ? <p className="py-6 text-center text-sm text-gray-400">Aún no se ha investigado.</p> : (
                  <div className="space-y-4 text-sm">
                    <div className="flex flex-wrap gap-1.5">
                      <Pill className={r.demand === 'alta' ? 'bg-emerald-50 text-emerald-700' : r.demand === 'media' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}>Interés {r.demand}</Pill>
                      <Pill className="bg-gray-100 text-gray-600">Búsqueda {r.intent}</Pill>
                    </div>
                    <div><p className="mb-1.5 text-xs font-medium text-gray-500">Así lo busca la gente</p><div className="flex flex-wrap gap-1">{r.suggestions.map((x) => <Pill key={x} className="bg-gray-50 text-gray-700 ring-1 ring-gray-200">{x}</Pill>)}</div></div>
                    <div><p className="mb-1.5 text-xs font-medium text-gray-500">Preguntas que se hacen</p><ul className="list-disc space-y-0.5 pl-4 text-gray-700">{r.questions.map((x) => <li key={x}>{x}</li>)}</ul></div>
                    <div><p className="mb-1.5 text-xs font-medium text-gray-500">Lo que sale ahora en Google</p><ul className="space-y-1.5">{r.competitors.map((c) => <li key={c.url}><a className="font-medium text-gray-800 underline decoration-gray-300" href={c.url} target="_blank" rel="noreferrer">{c.title}</a><span className="block text-xs text-gray-500">{c.covers}</span></li>)}</ul></div>
                    <div><p className="mb-1.5 text-xs font-medium text-gray-500">Lo que les falta (nuestro ángulo)</p><ul className="list-disc space-y-0.5 pl-4 text-gray-700">{r.gaps.map((x) => <li key={x}>{x}</li>)}</ul></div>
                    {post.brief?.externalLinks?.length ? <div><p className="mb-1.5 text-xs font-medium text-gray-500">Fuentes enlazadas (comprobadas)</p><ul className="space-y-1">{post.brief.externalLinks.map((l) => <li key={l.url}><a className="text-gray-800 underline decoration-gray-300" href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}</a></li>)}</ul></div> : null}
                  </div>
                )}
              </Panel>
            )}

            <Panel title="Imágenes" info="La destacada (arriba y al compartir), una de apoyo y una infografía. Pulsa una para verla grande.">
              {post.images?.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {post.images.map((img) => (
                    <a key={img.slot} href={`/api/blog/image/${post.id}/${img.slot}?v=${v}`} target="_blank" rel="noreferrer" className="group block" title={img.prompt}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/blog/image/${post.id}/${img.slot}?v=${v}`} alt={img.alt} className="aspect-video w-full rounded-xl object-cover ring-1 ring-gray-200 group-hover:ring-gray-400" />
                      <span className="mt-1 block text-center text-[11px] text-gray-500">{img.slot === 'destacada' ? 'Destacada' : img.slot === 'imagen2' ? 'Infografía' : 'De apoyo'}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="flex flex-col items-center gap-2 py-3 text-center text-sm text-gray-400"><ImageIcon className="h-6 w-6" />Sin imágenes todavía.</p>
              )}
            </Panel>
          </div>

          {/* Zona principal: vista previa o editor */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/80 px-4 py-2">
              <Segmented value={mainView} onChange={(x) => setMain(x)} options={[{ id: 'vista', label: 'Vista previa' }, { id: 'escribir', label: 'Escribir' }]} />
              <span className="flex items-center gap-2 text-[11px] text-gray-400">
                /blog/{post.slug || '…'}/
                <a href={`/api/blog/preview/${post.id}`} target="_blank" rel="noreferrer" title="Abrir a pantalla completa" className="text-gray-500 hover:text-gray-900"><ExternalLink className="h-3.5 w-3.5" /></a>
              </span>
            </div>
            {mainView === 'escribir' ? (
              <div className="space-y-2 p-4">
                <p className="text-xs text-gray-500">
                  Usa «Título de sección» para cada apartado y «Insertar imagen» donde quieras una imagen (el sistema la genera). Los enlaces, con el botón de enlace. Cuando acabes, pulsa <b>Guardar</b> arriba.
                </p>
                <RichEditor value={post.body} onChange={(html) => set('body', html)} placeholder="Empieza a escribir aquí…" />
              </div>
            ) : post.body ? (
              dirty ? (
                <p className="px-6 py-24 text-center text-sm text-gray-400">Guarda los cambios para ver la vista previa actualizada.</p>
              ) : (
                <iframe key={v} src={`/api/blog/preview/${post.id}`} className="h-[1500px] w-full" title="Vista previa" />
              )
            ) : (
              <p className="px-6 py-24 text-center text-sm text-gray-400">{working ? 'Escribiendo…' : 'Todavía no hay texto.'}</p>
            )}
          </div>
        </div>

        <details className="mx-auto max-w-3xl text-xs text-gray-500">
          <summary className="cursor-pointer text-center font-medium">Historial del artículo</summary>
          <ul className="mt-3 space-y-1.5 rounded-2xl border border-gray-200 bg-white p-4">
            {post.history.map((h, i) => <li key={i}><span className="text-gray-400">{fmt(h.at)}</span> · <b className="font-medium text-gray-700">{h.event}</b>{h.detail ? ` · ${h.detail}` : ''}{h.by ? ` · ${h.by}` : ''}</li>)}
          </ul>
        </details>
      </div>
    </Layout>
  )
}
