import Link from 'next/link'
import { useState } from 'react'
import { CalendarClock, Download, Loader2, Play, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, fmt, Notice, Panel, Pill, StatusPill, THEME_NAMES } from './shared'
import type { TabProps } from './types'

export default function Resumen({ state, reload, go }: TabProps & { go: (t: string) => void }) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const { settings, posts, slots, runs, status } = state

  const byId = new Map(posts.map((p) => [p.id, p]))
  const upcoming = slots.filter((s) => s.at >= new Date().toISOString()).slice(0, 9)
  const count = (st: string) => posts.filter((p) => p.status === st).length
  const toReview = posts.filter((p) => p.status === 'revision')

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    setMsg('')
    try {
      const r = (await fn()) as { message?: string }
      if (r?.message) setMsg(r.message)
      await reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  const toggleEngine = () => run('power', () => api('settings', { method: 'PUT', body: { ...settings, enabled: !settings.enabled } }))

  return (
    <div className="space-y-5">
      {!status.keys.openrouter && <Notice tone="error">Falta <b>OPENROUTER_API_KEY</b> en el entorno: sin ella no se puede investigar ni redactar.</Notice>}
      {settings.images.provider === 'openai' && !status.keys.openai && (
        <Notice tone="warn">Las imágenes están configuradas con OpenAI pero falta <b>OPENAI_API_KEY</b>. Añádela o cambia a OpenRouter en Configuración.</Notice>
      )}
      {status.store === 'file' && <Notice tone="info">Modo de prueba: los datos se guardan en un fichero local (BLOG_STORE=file), no en la base de datos.</Notice>}
      {msg && <Notice tone="info">{msg}</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['Publicados', count('publicado')],
          ['Por revisar', count('revision')],
          ['Aprobados', count('aprobado')],
          ['En preparación', count('idea') + count('brief') + count('borrador')],
          [`Gasto del mes`, `${status.spend.toFixed(2)} / ${settings.budget.monthlyUsd} $`],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">{l}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={toggleEngine} variant={settings.enabled ? 'outline' : 'default'} className="gap-1.5 rounded-xl">
          {busy === 'power' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
          {settings.enabled ? 'Pausar el motor' : 'Activar el motor'}
        </Button>
        <Button variant="outline" className="gap-1.5 rounded-xl" onClick={() => run('tick', () => api('tick', { body: {} }))} disabled={!!busy}>
          {busy === 'tick' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Ejecutar ahora
        </Button>
        <Button variant="outline" className="gap-1.5 rounded-xl" onClick={() => go('calendario')}>
          <CalendarClock className="h-4 w-4" /> Ver calendario
        </Button>
        <a href="/api/blog/package" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-input bg-background px-4 text-sm hover:bg-accent">
          <Download className="h-4 w-4" /> Paquete para CDMON
        </a>
        <a href="/api/blog/preview/index" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-xl px-3 text-sm text-gray-600 hover:text-gray-900">
          Ver portada del blog →
        </a>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Próximas publicaciones" action={<span className="text-xs text-gray-500">{settings.schedule.minPerWeek}-{settings.schedule.maxPerWeek} por semana · 1 de cada {settings.schedule.newsEvery} de actualidad</span>}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-500">Aún no hay huecos planificados. Pulsa «Ejecutar ahora» para planificar las próximas semanas.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {upcoming.map((sl) => {
                const p = sl.postId ? byId.get(sl.postId) : null
                return (
                  <li key={sl.id} className="flex items-center gap-3 py-2.5">
                    <span className="w-36 shrink-0 text-sm font-medium capitalize text-gray-900">{fmt(sl.at)}</span>
                    {sl.kind === 'actualidad' && <Pill className="bg-orange-50 text-orange-700">Actualidad</Pill>}
                    {p ? (
                      <Link href={`/blog/${p.id}`} className="min-w-0 flex-1 truncate text-sm text-gray-700 hover:text-emerald-700">
                        {p.h1 || p.title}
                      </Link>
                    ) : (
                      <span className="flex-1 text-sm text-gray-400">Tema por asignar ({settings.leadTimes.briefDaysBefore} días antes)</span>
                    )}
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
              <p className="text-sm text-gray-500">Nada pendiente.</p>
            ) : (
              <ul className="space-y-2">
                {toReview.map((p) => (
                  <li key={p.id}>
                    <Link href={`/blog/${p.id}`} className="block rounded-xl border border-gray-100 p-3 hover:border-emerald-200">
                      <p className="text-sm font-medium text-gray-900">{p.h1}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {THEME_NAMES[p.theme]} · SEO {p.score ?? '—'}/100 · sale el {fmt(p.scheduledAt, false)}
                        {p.gaps ? ` · ${p.gaps} huecos [SERGI]` : ''}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Actividad">
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {runs.slice(0, 20).map((r) => (
                <li key={r.id} className="text-xs">
                  <span className={r.ok ? 'text-emerald-600' : 'text-red-600'}>{r.ok ? '●' : '●'}</span>{' '}
                  <span className="text-gray-400">{fmt(r.at)}</span> · <b className="font-medium text-gray-700">{r.kind}</b> · <span className="text-gray-600">{r.message}</span>
                  {r.usd ? <span className="text-gray-400"> · {r.usd.toFixed(3)} $</span> : null}
                </li>
              ))}
              {!runs.length && <li className="text-sm text-gray-500">Sin actividad todavía.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
