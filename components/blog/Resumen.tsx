import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { CalendarDays, Download, ExternalLink, FlaskConical, Loader2, Play, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api, fmt, Notice, Panel, Pill, Stat, StatusPill, THEME_COLOR, time } from './shared'
import type { TabProps } from './types'

export default function Resumen({ state, reload, go }: TabProps & { go: (t: string) => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const { settings, posts, slots, runs, status, topics } = state

  const byId = new Map(posts.map((p) => [p.id, p]))
  const upcoming = slots.filter((s) => s.at >= new Date().toISOString()).slice(0, 8)
  const count = (st: string) => posts.filter((p) => p.status === st).length
  const toReview = posts.filter((p) => p.status === 'revision')
  const firstTopic = topics.filter((t) => t.status === 'pendiente' && t.source === 'calendario').sort((a, b) => a.order - b.order)[0]

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    setMsg(null)
    try {
      const r = (await fn()) as { message?: string }
      if (r?.message) setMsg({ tone: 'info', text: r.message })
      await reload()
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Error' })
    } finally {
      setBusy('')
    }
  }

  /** Prueba completa: crea el artículo del primer tema y lo lleva de la investigación a la revisión. */
  const testRun = () =>
    run('test', async () => {
      if (!firstTopic) throw new Error('No quedan temas pendientes en el calendario')
      const { post } = await api(`topics/${firstTopic.id}/write`, { body: {} })
      await api(`post/${post.id}/step`, { body: { step: 'todo' } })
      router.push(`/blog/${post.id}`)
    })

  const imageKeyMissing = settings.images.provider === 'openai' && !status.keys.openai

  return (
    <div className="space-y-6">
      {!status.keys.openrouter && <Notice tone="error">Falta <b>OPENROUTER_API_KEY</b> en el entorno: sin ella no se puede investigar, redactar ni generar imágenes.</Notice>}
      {imageKeyMissing && <Notice tone="warn">Las imágenes están configuradas con OpenAI pero falta <b>OPENAI_API_KEY</b>. Cambia el proveedor a OpenRouter en Configuración.</Notice>}
      {status.store === 'file' && <Notice>Modo de prueba local: los datos del blog se guardan en un fichero de este ordenador, no en la base de datos.</Notice>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Publicados" value={count('publicado')} />
        <Stat label="Por revisar" value={count('revision')} />
        <Stat label="Aprobados" value={count('aprobado')} sub="esperan su fecha" />
        <Stat label="En preparación" value={count('idea') + count('brief') + count('borrador')} />
        <Stat label="Gasto del mes" value={`${status.spend.toFixed(2)} $`} sub={`de ${settings.budget.monthlyUsd} $`} />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => run('power', () => api('settings', { method: 'PUT', body: { ...settings, enabled: !settings.enabled } }))} variant={settings.enabled ? 'outline' : 'default'} className="gap-1.5 rounded-xl">
          {busy === 'power' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
          {settings.enabled ? 'Pausar el motor' : 'Activar el motor'}
        </Button>
        <Button variant="outline" className="gap-1.5 rounded-xl" onClick={() => run('tick', () => api('tick', { body: {} }))} disabled={!!busy}>
          {busy === 'tick' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Ejecutar ahora
        </Button>
        <Button variant="outline" className="gap-1.5 rounded-xl" onClick={testRun} disabled={!!busy || !status.keys.openrouter} title={firstTopic ? `Escribe «${firstTopic.title}» de principio a fin` : ''}>
          {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Probar con un artículo
        </Button>
        <Button variant="outline" className="gap-1.5 rounded-xl" onClick={() => go('calendario')}>
          <CalendarDays className="h-4 w-4" /> Calendario
        </Button>
        {/* Descarga de fichero desde la API: tiene que ser un <a> normal, no <Link> */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/blog/package" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-input bg-background px-4 text-sm font-medium hover:bg-accent">
          <Download className="h-4 w-4" /> Paquete para CDMON
        </a>
        <a href="/api/blog/preview/index" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-gray-600 hover:text-gray-900">
          Portada del blog <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      {busy === 'test' && (
        <Notice>
          Escribiendo «{firstTopic?.title}»: investigación de palabras clave, brief, borrador, control SEO y 3 imágenes. Tarda entre 3 y 6 minutos; no cierres la pestaña.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Próximas publicaciones" action={<span className="text-xs text-gray-400">{settings.schedule.minPerWeek}-{settings.schedule.maxPerWeek} por semana · 1 de cada {settings.schedule.newsEvery} de actualidad</span>}>
          {upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-10 text-center text-sm text-gray-400">
              Aún no hay fechas. Pulsa «Ejecutar ahora» o «Planificar semanas» en el calendario.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {upcoming.map((sl) => {
                const p = sl.postId ? byId.get(sl.postId) : null
                return (
                  <li key={sl.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-gray-50">
                    <div className="w-14 shrink-0 rounded-xl bg-gray-50 py-1 text-center">
                      <p className="text-[10px] uppercase text-gray-400">{new Date(sl.at).toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'Europe/Madrid' })}</p>
                      <p className="text-sm font-semibold leading-none text-gray-900">{new Date(sl.at).toLocaleDateString('es-ES', { day: 'numeric', timeZone: 'Europe/Madrid' })}</p>
                      <p className="text-[10px] text-gray-400">{time(sl.at)}</p>
                    </div>
                    <span className={cn('h-8 w-1 shrink-0 rounded-full', p ? THEME_COLOR[p.theme] : sl.kind === 'actualidad' ? THEME_COLOR.N : 'bg-gray-200')} />
                    <div className="min-w-0 flex-1">
                      {p ? (
                        <Link href={`/blog/${p.id}`} className="line-clamp-1 text-sm font-medium text-gray-800 hover:text-gray-950">{p.h1 || p.title}</Link>
                      ) : (
                        <p className="text-sm italic text-gray-400">Tema por asignar ({settings.leadTimes.briefDaysBefore} días antes)</p>
                      )}
                      {sl.kind === 'actualidad' && <Pill className="mt-0.5 bg-orange-50 text-orange-600">Actualidad</Pill>}
                    </div>
                    {p && <StatusPill status={p.status} />}
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title={`Por revisar (${toReview.length})`}>
            {toReview.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">Nada pendiente.</p>
            ) : (
              <ul className="space-y-2">
                {toReview.map((p) => (
                  <li key={p.id}>
                    <Link href={`/blog/${p.id}`} className="block rounded-xl border border-gray-100 p-3 hover:border-gray-300">
                      <p className="text-sm font-medium text-gray-900">{p.h1}</p>
                      <p className="mt-1 text-xs text-gray-500">SEO {p.score ?? '—'}/100 · sale el {fmt(p.scheduledAt, false)}{p.gaps ? ` · ${p.gaps} huecos [SERGI]` : ''}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Actividad">
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {runs.slice(0, 20).map((r) => (
                <li key={r.id} className="flex gap-2 text-xs">
                  <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', r.ok ? 'bg-emerald-500' : 'bg-red-500')} />
                  <span>
                    <span className="text-gray-400">{fmt(r.at)}</span> · <b className="font-medium text-gray-700">{r.kind}</b> · <span className="text-gray-600">{r.message}</span>
                    {r.usd ? <span className="text-gray-400"> · {r.usd.toFixed(3)} $</span> : null}
                  </span>
                </li>
              ))}
              {!runs.length && <li className="py-4 text-center text-sm text-gray-400">Sin actividad todavía.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
