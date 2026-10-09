import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, ExternalLink, ImageIcon, Loader2, X } from 'lucide-react'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth'
import type { Post } from '@/lib/blog/types'
import { cn } from '@/lib/utils'
import { api, Field, fmt, Info, inputCls, KIND_NAMES, Notice, Panel, Pill, Segmented, StatusPill, ThemePill } from '@/components/blog/shared'

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
  const [left, setLeft] = useState<'seo' | 'editar' | 'investigacion'>('seo')
  const [redoOpen, setRedoOpen] = useState(false)
  const [startedAt] = useState(() => new Date().toISOString())

  const load = useCallback(async () => {
    if (!id) return
    try {
      const r = await api<{ post: Post; working: boolean }>(`post/${id}`)
      setPost(r.post)
      setWorking((was) => {
        if (was && !r.working) setV((x) => x + 1)
        return r.working
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    }
  }, [id])
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

  const set = (k: keyof Post, val: unknown) => setPost({ ...post, [k]: val } as Post)
  const r = post.brief?.research
  const fails = (post.checks || []).filter((c) => !c.ok && c.severity === 'error').length
  const gaps = (post.body.match(/\[SERGI:/g) || []).length
  const doneSince = (event: string) => post.history.some((h) => h.event.startsWith(event) && h.at >= startedAt)
  const live = post.status === 'publicado'
  const url = `https://buffaloia.com/blog/${post.slug}/`

  const redo = [
    ['brief', 'Volver a investigar', 'Busca otra vez qué busca la gente y rehace la estructura.'],
    ...(post.manual ? [] : [['borrador', 'Reescribir el texto', 'Escribe el artículo de nuevo con la investigación actual.']]),
    ['control', post.manual ? 'Revisar el SEO' : 'Corregir el SEO', post.manual ? 'Comprueba las normas sin tocar tu texto.' : 'Corrige solo lo que no cumple las normas.'],
    ['imagenes', 'Rehacer las imágenes', 'Genera de nuevo las 3 imágenes.'],
  ]

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Link href="/blog?tab=articulos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft className="h-4 w-4" /> Artículos</Link>
          {live ? (
            <a className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-950" href={url} target="_blank" rel="noreferrer">Ver en buffaloia.com <ExternalLink className="h-3.5 w-3.5" /></a>
          ) : (
            <a className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900" href={`/api/blog/preview/${post.id}`} target="_blank" rel="noreferrer">Vista previa a pantalla completa <ExternalLink className="h-3.5 w-3.5" /></a>
          )}
        </div>

        {/* Cabecera centrada */}
        <div className="mx-auto max-w-4xl space-y-3 text-center">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <StatusPill status={post.status} />
            <ThemePill theme={post.theme} />
            <Pill className="bg-gray-100 text-gray-600">{KIND_NAMES[post.kind]}</Pill>
            {typeof post.score === 'number' && <Pill className={post.score >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>SEO {post.score}/100</Pill>}
          </div>
          <h1 className="text-2xl font-semibold leading-tight text-gray-900">{post.h1 || post.title}</h1>
          <p className="text-sm text-gray-500">
            {live ? `Publicado el ${fmt(post.publishedAt)}` : post.scheduledAt ? `Sale el ${fmt(post.scheduledAt)}` : 'Sin fecha: al aprobarlo ocupará el siguiente hueco libre'}
            {post.keyword ? ` · palabra clave «${post.keyword}»` : ''} · coste {(post.cost?.usd || 0).toFixed(2)} $
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {['revision', 'borrador', 'brief', 'idea'].includes(post.status) && (
              <>
                <Button className="gap-1.5 rounded-xl" disabled={!!busy || working || !post.body} onClick={() => act('approve', '/approve')}>
                  {busy === 'approve' && <Loader2 className="h-4 w-4 animate-spin" />}<Check className="h-4 w-4" /> Aprobar
                </Button>
                <Info>Lo dais por bueno. Se publicará y se subirá a la web solo, en su fecha del calendario. Si queréis que salga ya, usad «Publicar ahora».</Info>
              </>
            )}
            {['revision', 'aprobado', 'borrador'].includes(post.status) && post.body && (
              <Button variant={post.status === 'aprobado' ? 'default' : 'outline'} className="rounded-xl" disabled={!!busy || working} onClick={() => confirm('¿Publicarlo ahora en buffaloia.com, sin esperar a su fecha?') && act('publish', '/publish')}>
                {busy === 'publish' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Publicar ahora
              </Button>
            )}
            {live && <Button variant="outline" className="rounded-xl" disabled={!!busy} onClick={() => confirm('¿Retirarlo de la web?') && act('unpublish', '/unpublish')}>Retirar de la web</Button>}

            <div className="relative">
              <Button variant="outline" className="gap-1 rounded-xl" disabled={!!busy || working} onClick={() => setRedoOpen((o) => !o)}>Rehacer <ChevronDown className="h-4 w-4" /></Button>
              {redoOpen && (
                <div className="absolute left-1/2 z-20 mt-2 w-72 -translate-x-1/2 rounded-2xl border border-gray-200 bg-white p-1.5 text-left shadow-lg">
                  {redo.map(([k, l, d]) => (
                    <button key={k} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-gray-50" onClick={() => act(k, '/step', { step: k })}>
                      <span className="block text-sm font-medium text-gray-900">{l}</span>
                      <span className="block text-xs text-gray-500">{d}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {post.status === 'rechazado' ? (
              <Button variant="ghost" className="rounded-xl" onClick={() => act('reopen', '/reopen')}>Recuperar</Button>
            ) : !live ? (
              <Button variant="ghost" className="rounded-xl text-gray-500" disabled={!!busy || working} onClick={() => { const reason = prompt('¿Por qué lo descartas? (opcional)'); if (reason !== null) void act('reject', '/reject', { reason }) }}>Descartar</Button>
            ) : null}
            <Button variant="ghost" className="rounded-xl text-gray-400" disabled={!!busy || working} onClick={() => confirm('¿Eliminar el artículo para siempre?') && act('delete', '/delete')}>Eliminar</Button>
          </div>
        </div>

        {working && (
          <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm">
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-gray-900"><Loader2 className="h-4 w-4 animate-spin" /> La IA está trabajando en el artículo</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {PHASES.map(([label, event]) => (
                <Pill key={label} className={doneSince(event) ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}>{doneSince(event) && <Check className="h-3 w-3" />}{label}</Pill>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-400">Tarda entre 3 y 6 minutos. Puedes salir de esta página: sigue trabajando.</p>
          </div>
        )}
        {post.lastError && !working && <Notice tone="error"><b>No se pudo completar ({post.lastError.step}).</b> {post.lastError.message} <span className="text-red-600/70">· {fmt(post.lastError.at)}</span> — usa «Rehacer» para intentarlo otra vez.</Notice>}
        {msg && <Notice tone="ok">{msg}</Notice>}
        {err && <Notice tone="error">{err}</Notice>}
        {!working && gaps > 0 && <Notice tone="warn">Hay {gaps} {gaps === 1 ? 'hueco' : 'huecos'} <b>[SERGI: …]</b> donde la IA necesita un caso o dato vuestro. Rellénalos en «Editar» antes de aprobar.</Notice>}
        {!working && post.body && fails > 0 && post.status !== 'publicado' && <Notice tone="warn">{fails} {fails === 1 ? 'norma SEO no se cumple' : 'normas SEO no se cumplen'} tras las correcciones automáticas. Mira «Revisión SEO».</Notice>}

        <div className="grid gap-5 xl:grid-cols-[440px_1fr]">
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Segmented value={left} onChange={setLeft} options={[{ id: 'seo', label: 'Revisión SEO' }, { id: 'editar', label: 'Editar' }, { id: 'investigacion', label: 'Investigación' }]} />
              <Info>
                <b>Revisión SEO</b>: cada norma, en verde si se cumple.<br />
                <b>Editar</b>: cambiar título, URL, descripción y texto.<br />
                <b>Investigación</b>: qué busca la gente, la competencia y las fuentes usadas.
              </Info>
            </div>

            {left === 'seo' && (
              <Panel title={post.checks?.length ? `${post.checks.filter((c) => c.ok).length} de ${post.checks.length} normas cumplidas` : 'Revisión SEO'} info="Las rojas impiden pasar a revisión y la IA las corrige sola; las amarillas son avisos para quien revisa.">
                {!post.checks?.length ? <p className="py-6 text-center text-sm text-gray-400">Aún no hay texto que revisar.</p> : (
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

            {left === 'editar' && (
              <Panel
                title="Editar"
                info="Al guardar se vuelve a revisar el SEO. Si el artículo ya está publicado, el cambio se sube también a la web."
                action={<Button size="sm" className="rounded-xl" disabled={!!busy || working} onClick={() => act('save', '', { h1: post.h1, slug: post.slug, metaDescription: post.metaDescription, keyword: post.keyword, secondary: post.secondary, excerpt: post.excerpt, body: post.body }, 'PUT')}>{busy === 'save' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Guardar</Button>}
              >
                <div className="space-y-3">
                  <Field label={`Título · ${post.h1.length}/55`} info="El H1: lo primero que se lee y lo que más pesa para Google. Con la palabra clave."><input className={inputCls} value={post.h1} onChange={(e) => set('h1', e.target.value)} /></Field>
                  <Field label={`URL · ${post.slug.length}/70`} info="La dirección del artículo: buffaloia.com/blog/esta-parte/. Con la palabra clave y guiones."><input className={inputCls} value={post.slug} onChange={(e) => set('slug', e.target.value)} /></Field>
                  <Field label={`Descripción para Google · ${post.metaDescription.length}/155`} info="La meta-description: el texto gris bajo el título en los resultados de Google."><textarea className={inputCls + ' h-20'} value={post.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Palabra clave" info="La búsqueda principal para la que quiere posicionar."><input className={inputCls} value={post.keyword} onChange={(e) => set('keyword', e.target.value)} /></Field>
                    <Field label="Secundarias" info="Separadas por comas. Variantes que también debe cubrir."><input className={inputCls} value={post.secondary.join(', ')} onChange={(e) => set('secondary', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></Field>
                  </div>
                  <Field label="Resumen para la tarjeta" info="Las dos frases que salen en la portada del blog."><textarea className={inputCls + ' h-16'} value={post.excerpt} onChange={(e) => set('excerpt', e.target.value)} /></Field>
                  <Field label="Texto" info="En HTML. (imagen1) e (imagen2) marcan dónde van las imágenes; [SERGI: …] marca lo que tenéis que completar.">
                    <textarea className={inputCls + ' h-96 font-mono text-[11px] leading-relaxed'} value={post.body} onChange={(e) => set('body', e.target.value)} />
                  </Field>
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

            <Panel title="Imágenes" info="La destacada (arriba del artículo y al compartir), una de apoyo y una infografía. Pulsa una para verla grande.">
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
                <p className="flex flex-col items-center gap-2 py-4 text-center text-sm text-gray-400"><ImageIcon className="h-6 w-6" />Sin imágenes todavía.</p>
              )}
            </Panel>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-4 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">Así se verá en buffaloia.com <Info side="bottom">Vista previa con el diseño real de la web. Lo que ves aquí es exactamente lo que se publicará.</Info></p>
              <span className="text-[11px] text-gray-400">/blog/{post.slug || '…'}/</span>
            </div>
            {post.body ? (
              <iframe key={v} src={`/api/blog/preview/${post.id}`} className="h-[1500px] w-full" title="Vista previa" />
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
