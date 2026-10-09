import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, Loader2, X } from 'lucide-react'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth'
import type { Post } from '@/lib/blog/types'
import { api, Field, fmt, inputCls, Notice, Panel, Pill, StatusPill, THEME_NAMES } from '@/components/blog/shared'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin') return { redirect: { destination: '/dashboard', permanent: false } }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function BlogPostPage() {
  const { query, push } = useRouter()
  const id = query.id as string
  const [post, setPost] = useState<Post | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [v, setV] = useState(0) // recarga la vista previa

  const load = useCallback(async () => {
    if (!id) return
    try {
      setPost((await api<{ post: Post }>(`post/${id}`)).post)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    }
  }, [id])
  useEffect(() => void load(), [load])

  const act = async (key: string, path: string, body: unknown = {}, method?: string) => {
    setBusy(key)
    setErr('')
    try {
      const r = await api<{ post?: Post; ok?: boolean }>(`post/${id}${path}`, { body, method })
      if (key === 'delete') return push('/blog?tab=articulos')
      if (r.post) setPost(r.post)
      setV((x) => x + 1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  if (!post) return <Layout><div className="flex justify-center py-20 text-gray-400">{err || <Loader2 className="h-6 w-6 animate-spin" />}</div></Layout>
  const set = (k: keyof Post, val: unknown) => setPost({ ...post, [k]: val } as Post)
  const r = post.brief?.research
  const btn = (key: string, label: string, path: string, body?: unknown, variant: 'default' | 'outline' = 'outline') => (
    <Button size="sm" variant={variant} className="gap-1 rounded-lg" disabled={!!busy} onClick={() => act(key, path, body)}>
      {busy === key && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {label}
    </Button>
  )

  return (
    <Layout>
      <div className="mx-auto max-w-7xl space-y-4">
        <Link href="/blog?tab=articulos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft className="h-4 w-4" /> Artículos</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={post.status} />
              <Pill className="bg-gray-100 text-gray-600">{post.theme} · {THEME_NAMES[post.theme]}</Pill>
              {typeof post.score === 'number' && <Pill className={post.score >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}>SEO {post.score}/100</Pill>}
              <span className="text-xs text-gray-500">Sale {fmt(post.scheduledAt)} · Coste {(post.cost?.usd || 0).toFixed(2)} $</span>
            </div>
            <h1 className="mt-2 text-xl font-semibold text-gray-900">{post.h1 || post.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {btn('brief', post.brief ? 'Rehacer investigación' : 'Investigar (brief)', '/step', { step: 'brief' })}
            {!post.manual && btn('borrador', post.body ? 'Reescribir borrador' : 'Escribir borrador', '/step', { step: 'borrador' })}
            {btn('control', post.manual ? 'Pasar control SEO' : 'Corregir SEO', '/step', { step: 'control' })}
            {btn('imagenes', 'Generar imágenes', '/step', { step: 'imagenes' })}
            {['revision', 'borrador'].includes(post.status) && btn('approve', 'Aprobar', '/approve', {}, 'default')}
            {post.status === 'aprobado' && btn('publish', 'Publicar ya', '/publish', {}, 'default')}
            {post.status === 'publicado' && btn('unpublish', 'Despublicar', '/unpublish')}
            {post.status === 'rechazado' ? btn('reopen', 'Reabrir', '/reopen') : btn('reject', 'Rechazar', '/reject', { reason: typeof window !== 'undefined' ? '' : '' })}
            <Button size="sm" variant="ghost" className="text-gray-400" disabled={!!busy} onClick={() => confirm('¿Eliminar el artículo?') && act('delete', '/delete')}>Eliminar</Button>
          </div>
        </div>
        {busy && ['brief', 'borrador', 'control', 'imagenes'].includes(busy) && <Notice>Trabajando… la investigación y la redacción tardan uno o dos minutos.</Notice>}
        {err && <Notice tone="error">{err}</Notice>}

        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <div className="space-y-4">
            <Panel title="Control SEO">
              {!post.checks?.length ? <p className="text-sm text-gray-500">Aún no hay texto que comprobar.</p> : (
                <ul className="space-y-1.5">
                  {post.checks.map((c) => (
                    <li key={c.id} className="flex gap-2 text-xs">
                      {c.ok ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <X className={c.severity === 'error' ? 'h-4 w-4 shrink-0 text-red-600' : 'h-4 w-4 shrink-0 text-amber-500'} />}
                      <span><b className="font-medium text-gray-800">{c.label}</b> <span className="text-gray-500">· {c.detail}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Datos SEO" action={btn('save', 'Guardar cambios', '', { h1: post.h1, slug: post.slug, metaDescription: post.metaDescription, keyword: post.keyword, secondary: post.secondary, excerpt: post.excerpt, body: post.body, scheduledAt: post.scheduledAt })}>
              <div className="space-y-3">
                <Field label={`H1 (${post.h1.length} car.)`}><input className={inputCls} value={post.h1} onChange={(e) => set('h1', e.target.value)} /></Field>
                <Field label={`Slug (${post.slug.length} car.)`}><input className={inputCls} value={post.slug} onChange={(e) => set('slug', e.target.value)} /></Field>
                <Field label={`Meta-description (${post.metaDescription.length} car.)`}><textarea className={inputCls + ' h-20'} value={post.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} /></Field>
                <Field label="Palabra clave"><input className={inputCls} value={post.keyword} onChange={(e) => set('keyword', e.target.value)} /></Field>
                <Field label="Secundarias (separadas por comas)"><input className={inputCls} value={post.secondary.join(', ')} onChange={(e) => set('secondary', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></Field>
                <Field label="Resumen para la tarjeta"><textarea className={inputCls + ' h-16'} value={post.excerpt} onChange={(e) => set('excerpt', e.target.value)} /></Field>
                <Field label="Texto (HTML)" hint="(imagen1) e (imagen2) marcan dónde van las imágenes. Los huecos [SERGI: …] hay que rellenarlos antes de aprobar.">
                  <textarea className={inputCls + ' h-72 font-mono text-[11px]'} value={post.body} onChange={(e) => set('body', e.target.value)} />
                </Field>
              </div>
            </Panel>

            {r && (
              <Panel title="Investigación">
                <div className="space-y-2 text-xs text-gray-600">
                  <p>Demanda <b>{r.demand}</b> · intención {r.intent}</p>
                  <p><b>Búsquedas reales:</b> {r.suggestions.join(' · ')}</p>
                  <p><b>Preguntas:</b> {r.questions.join(' · ')}</p>
                  {r.alternatives?.length ? <p><b>Otras palabras clave:</b> {r.alternatives.map((a) => `${a.keyword} (${a.why})`).join(' · ')}</p> : null}
                  <p><b>Competencia:</b></p>
                  <ul className="list-disc pl-4">{r.competitors.map((c) => <li key={c.url}><a className="underline" href={c.url} target="_blank" rel="noreferrer">{c.title}</a>: {c.covers}</li>)}</ul>
                  <p><b>Lo que les falta:</b> {r.gaps.join(' · ')}</p>
                </div>
              </Panel>
            )}

            <Panel title="Historial">
              <ul className="space-y-1 text-xs text-gray-600">
                {post.history.map((h, i) => <li key={i}><span className="text-gray-400">{fmt(h.at)}</span> · {h.event}{h.detail ? ` · ${h.detail}` : ''}{h.by ? ` · ${h.by}` : ''}</li>)}
              </ul>
            </Panel>
          </div>

          <Panel title="Vista previa con el diseño de la web" className="p-2" action={<a className="text-xs text-emerald-700" href={`/api/blog/preview/${post.id}`} target="_blank" rel="noreferrer">Abrir en pestaña nueva →</a>}>
            {post.body ? (
              <iframe key={v} src={`/api/blog/preview/${post.id}`} className="h-[1400px] w-full rounded-xl border border-gray-100" title="Vista previa" />
            ) : (
              <p className="p-6 text-sm text-gray-500">Todavía no hay texto. Pulsa «Investigar» y luego «Escribir borrador», o espera a que el motor lo haga en su fecha.</p>
            )}
          </Panel>
        </div>
      </div>
    </Layout>
  )
}
