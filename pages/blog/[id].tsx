import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, ExternalLink, ImageIcon, Loader2, X } from 'lucide-react'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth'
import type { Post } from '@/lib/blog/types'
import { cn } from '@/lib/utils'
import { api, Field, fmt, inputCls, KIND_NAMES, Notice, Panel, Pill, Segmented, StatusPill, ThemePill } from '@/components/blog/shared'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin') return { redirect: { destination: '/dashboard', permanent: false } }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

const STEPS = ['Brief generado', 'Borrador escrito', 'Control SEO', 'Imágenes generadas', 'Pendiente de revisión']

export default function BlogPostPage() {
  const { query, push } = useRouter()
  const id = query.id as string
  const [post, setPost] = useState<Post | null>(null)
  const [working, setWorking] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [v, setV] = useState(0)
  const [left, setLeft] = useState<'seo' | 'datos' | 'investigacion' | 'historial'>('seo')

  const load = useCallback(async () => {
    if (!id) return
    try {
      const r = await api<{ post: Post; working: boolean }>(`post/${id}`)
      setPost(r.post)
      setWorking((was) => {
        if (was && !r.working) setV((x) => x + 1) // ha terminado: recargar vista previa
        return r.working
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    }
  }, [id])
  useEffect(() => void load(), [load])

  // Mientras el motor trabaja, se consulta cada 4 s
  useEffect(() => {
    if (!working) return
    const t = setInterval(() => void load(), 4000)
    return () => clearInterval(t)
  }, [working, load])

  const act = async (key: string, path: string, body: unknown = {}, method?: string) => {
    setBusy(key)
    setErr('')
    try {
      const r = await api<{ post?: Post; working?: boolean }>(`post/${id}${path}`, { body, method })
      if (key === 'delete') return push('/blog?tab=articulos')
      if (r.post) setPost(r.post)
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
  const step = (key: string, label: string, s: string) => (
    <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" disabled={!!busy || working} onClick={() => act(key, '/step', { step: s })}>{label}</Button>
  )
  const lastEvents = post.history.slice(0, 6)

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Link href="/blog?tab=articulos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft className="h-4 w-4" /> Artículos</Link>
          <a className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900" href={`/api/blog/preview/${post.id}`} target="_blank" rel="noreferrer">Abrir vista previa <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>

        {/* Cabecera centrada */}
        <div className="mx-auto max-w-4xl space-y-3 text-center">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <StatusPill status={post.status} />
            <ThemePill theme={post.theme} />
            <Pill className="bg-gray-100 text-gray-600">{KIND_NAMES[post.kind]}</Pill>
            {typeof post.score === 'number' && <Pill className={post.score >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>SEO {post.score}/100</Pill>}
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">{post.h1 || post.title}</h1>
          <p className="text-sm text-gray-500">Sale el {fmt(post.scheduledAt)} · Palabra clave «{post.keyword || '—'}» · Coste {(post.cost?.usd || 0).toFixed(2)} $</p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {step('brief', post.brief ? 'Rehacer investigación' : 'Investigar', 'brief')}
            {!post.manual && step('borrador', post.body ? 'Reescribir borrador' : 'Escribir borrador', 'borrador')}
            {step('control', post.manual ? 'Pasar control SEO' : 'Corregir SEO', 'control')}
            {step('imagenes', post.images?.length ? 'Rehacer imágenes' : 'Generar imágenes', 'imagenes')}
            {['revision', 'borrador'].includes(post.status) && (
              <Button size="sm" className="gap-1.5 rounded-xl" disabled={!!busy || working} onClick={() => act('approve', '/approve')}>{busy === 'approve' && <Loader2 className="h-4 w-4 animate-spin" />}Aprobar</Button>
            )}
            {post.status === 'aprobado' && <Button size="sm" className="rounded-xl" disabled={!!busy} onClick={() => act('publish', '/publish')}>Publicar ya</Button>}
            {post.status === 'publicado' && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => act('unpublish', '/unpublish')}>Despublicar</Button>}
            {post.status === 'rechazado' ? (
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => act('reopen', '/reopen')}>Reabrir</Button>
            ) : (
              <Button size="sm" variant="ghost" className="rounded-xl text-gray-500" disabled={!!busy || working} onClick={() => { const reason = prompt('¿Por qué lo rechazas? (ayuda a mejorar los siguientes)'); if (reason !== null) void act('reject', '/reject', { reason }) }}>Rechazar</Button>
            )}
            <Button size="sm" variant="ghost" className="rounded-xl text-gray-400" disabled={!!busy || working} onClick={() => confirm('¿Eliminar el artículo?') && act('delete', '/delete')}>Eliminar</Button>
          </div>
        </div>

        {working && (
          <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-gray-900"><Loader2 className="h-4 w-4 animate-spin" /> Trabajando en el artículo…</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {STEPS.map((s) => {
                const done = post.history.some((h) => h.event.startsWith(s.split(' ')[0]) || h.event.startsWith(s))
                return <Pill key={s} className={done ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}>{done && <Check className="h-3 w-3" />}{s}</Pill>
              })}
            </div>
            <p className="mt-3 text-center text-xs text-gray-400">La investigación tarda 1-2 minutos, el borrador 1-3 y cada imagen unos 20 segundos. Puedes salir de esta página: sigue trabajando.</p>
          </div>
        )}
        {err && <Notice tone="error">{err}</Notice>}
        {!working && post.status === 'revision' && fails > 0 && <Notice tone="warn">Quedan {fails} normas sin cumplir tras las reescrituras automáticas. Revísalas en «Control SEO» antes de aprobar.</Notice>}
        {!working && /\[SERGI:/.test(post.body) && <Notice tone="warn">El texto tiene huecos <b>[SERGI: …]</b> con material propio por rellenar. No se puede aprobar hasta completarlos (pestaña «Datos y texto»).</Notice>}

        <div className="grid gap-5 xl:grid-cols-[440px_1fr]">
          <div className="space-y-4">
            <div className="flex justify-center">
              <Segmented value={left} onChange={setLeft} options={[{ id: 'seo', label: 'Control SEO' }, { id: 'datos', label: 'Datos y texto' }, { id: 'investigacion', label: 'Investigación' }, { id: 'historial', label: 'Historial' }]} />
            </div>

            {left === 'seo' && (
              <Panel title={post.checks?.length ? `${post.checks.filter((c) => c.ok).length} de ${post.checks.length} normas cumplidas` : 'Control SEO'}>
                {!post.checks?.length ? <p className="py-6 text-center text-sm text-gray-400">Aún no hay texto que comprobar.</p> : (
                  <ul className="space-y-2">
                    {post.checks.map((c) => (
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
              <Panel
                title="Datos SEO y texto"
                action={<Button size="sm" className="rounded-xl" disabled={!!busy || working} onClick={() => act('save', '', { h1: post.h1, slug: post.slug, metaDescription: post.metaDescription, keyword: post.keyword, secondary: post.secondary, excerpt: post.excerpt, body: post.body, scheduledAt: post.scheduledAt }, 'PUT')}>{busy === 'save' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Guardar</Button>}
              >
                <div className="space-y-3">
                  <Field label={`H1 · ${post.h1.length}/55`}><input className={inputCls} value={post.h1} onChange={(e) => set('h1', e.target.value)} /></Field>
                  <Field label={`Slug · ${post.slug.length}/70`}><input className={inputCls} value={post.slug} onChange={(e) => set('slug', e.target.value)} /></Field>
                  <Field label={`Meta-description · ${post.metaDescription.length}/155`}><textarea className={inputCls + ' h-20'} value={post.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} /></Field>
                  <Field label="Palabra clave principal"><input className={inputCls} value={post.keyword} onChange={(e) => set('keyword', e.target.value)} /></Field>
                  <Field label="Secundarias (separadas por comas)"><input className={inputCls} value={post.secondary.join(', ')} onChange={(e) => set('secondary', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></Field>
                  <Field label="Resumen para la tarjeta del blog"><textarea className={inputCls + ' h-16'} value={post.excerpt} onChange={(e) => set('excerpt', e.target.value)} /></Field>
                  <Field label="Texto (HTML)" hint="(imagen1) e (imagen2) marcan dónde van las imágenes. Al guardar se vuelve a pasar el control SEO.">
                    <textarea className={inputCls + ' h-80 font-mono text-[11px] leading-relaxed'} value={post.body} onChange={(e) => set('body', e.target.value)} />
                  </Field>
                </div>
              </Panel>
            )}

            {left === 'investigacion' && (
              <Panel title="Investigación de palabras clave">
                {!r ? <p className="py-6 text-center text-sm text-gray-400">Pulsa «Investigar» para buscar qué busca la gente.</p> : (
                  <div className="space-y-4 text-sm">
                    <div className="flex flex-wrap gap-1.5">
                      <Pill className={r.demand === 'alta' ? 'bg-emerald-50 text-emerald-700' : r.demand === 'media' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}>Demanda {r.demand}</Pill>
                      <Pill className="bg-gray-100 text-gray-600">Intención {r.intent}</Pill>
                    </div>
                    <div><p className="mb-1.5 text-xs font-medium text-gray-500">Lo que busca la gente</p><div className="flex flex-wrap gap-1">{r.suggestions.map((x) => <Pill key={x} className="bg-gray-50 text-gray-700 ring-1 ring-gray-200">{x}</Pill>)}</div></div>
                    <div><p className="mb-1.5 text-xs font-medium text-gray-500">Preguntas</p><ul className="list-disc space-y-0.5 pl-4 text-gray-700">{r.questions.map((x) => <li key={x}>{x}</li>)}</ul></div>
                    {r.alternatives?.length ? <div><p className="mb-1.5 text-xs font-medium text-gray-500">Otras palabras clave posibles</p><ul className="space-y-1 text-gray-700">{r.alternatives.map((a) => <li key={a.keyword}><b className="font-medium">{a.keyword}</b> <span className="text-gray-500">· {a.why}</span></li>)}</ul></div> : null}
                    <div><p className="mb-1.5 text-xs font-medium text-gray-500">Lo que posiciona ahora</p><ul className="space-y-1.5">{r.competitors.map((c) => <li key={c.url}><a className="font-medium text-gray-800 underline decoration-gray-300" href={c.url} target="_blank" rel="noreferrer">{c.title}</a><span className="block text-xs text-gray-500">{c.covers}</span></li>)}</ul></div>
                    <div><p className="mb-1.5 text-xs font-medium text-gray-500">Lo que les falta (nuestro ángulo)</p><ul className="list-disc space-y-0.5 pl-4 text-gray-700">{r.gaps.map((x) => <li key={x}>{x}</li>)}</ul></div>
                    {post.brief?.externalLinks?.length ? <div><p className="mb-1.5 text-xs font-medium text-gray-500">Fuentes externas verificadas</p><ul className="space-y-1">{post.brief.externalLinks.map((l) => <li key={l.url}><a className="text-gray-800 underline decoration-gray-300" href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}</a></li>)}</ul></div> : null}
                  </div>
                )}
              </Panel>
            )}

            {left === 'historial' && (
              <Panel title="Historial">
                <ul className="space-y-2 text-xs">
                  {post.history.map((h, i) => (
                    <li key={i} className="flex gap-2"><span className="w-28 shrink-0 text-gray-400">{fmt(h.at)}</span><span className="text-gray-700"><b className="font-medium">{h.event}</b>{h.detail ? ` · ${h.detail}` : ''}{h.by ? ` · ${h.by}` : ''}</span></li>
                  ))}
                </ul>
              </Panel>
            )}

            <Panel title="Imágenes">
              {post.images?.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {post.images.map((img) => (
                    <a key={img.slot} href={`/api/blog/image/${post.id}/${img.slot}?v=${v}`} target="_blank" rel="noreferrer" className="group block" title={img.prompt}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/blog/image/${post.id}/${img.slot}?v=${v}`} alt={img.alt} className="aspect-video w-full rounded-xl object-cover ring-1 ring-gray-200 group-hover:ring-gray-400" />
                      <span className="mt-1 block text-center text-[11px] text-gray-500">{img.slot === 'destacada' ? 'Destacada' : img.slot === 'imagen2' ? 'Infografía' : 'Imagen 1'}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="flex flex-col items-center gap-2 py-4 text-center text-sm text-gray-400"><ImageIcon className="h-6 w-6" />Sin imágenes todavía.</p>
              )}
            </Panel>
            {!working && lastEvents.length > 0 && <p className="text-center text-[11px] text-gray-400">Último cambio: {lastEvents[0].event} · {fmt(lastEvents[0].at)}</p>}
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-4 py-2.5">
              <p className="text-xs font-medium text-gray-500">Vista previa con el diseño de buffaloia.com</p>
              <span className="text-[11px] text-gray-400">/blog/{post.slug || '…'}/</span>
            </div>
            {post.body ? (
              <iframe key={v} src={`/api/blog/preview/${post.id}`} className="h-[1500px] w-full" title="Vista previa" />
            ) : (
              <p className="px-6 py-24 text-center text-sm text-gray-400">Todavía no hay texto. Pulsa «Investigar» y luego «Escribir borrador», o espera a que el motor lo haga en su fecha.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
