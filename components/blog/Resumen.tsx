import Link from 'next/link'
import { useState } from 'react'
import { ChevronDown, ExternalLink, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import NewArticle from './NewArticle'
import { api, fmt, Info, Notice, Panel, Pill, Stat, StatusPill, THEME_COLOR, time } from './shared'
import type { TabProps } from './types'

export default function Resumen({ state, reload, go }: TabProps & { go: (t: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const { settings, posts, slots, runs, status, topics } = state

  const byId = new Map(posts.map((p) => [p.id, p]))
  const upcoming = slots.filter((s) => s.at >= new Date().toISOString()).slice(0, 6)
  const toReview = posts.filter((p) => p.status === 'revision' || (p.status === 'borrador' && p.manual))
  const failed = posts.filter((p) => p.lastError && p.status !== 'rechazado')
  const count = (st: string) => posts.filter((p) => p.status === st).length

  const toggleEngine = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await api('settings', { method: 'PUT', body: { ...settings, enabled: !settings.enabled } })
      // Al activarlo, se planifica el calendario en el momento
      if (!settings.enabled) await api('tick', { body: {} })
      await reload()
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Acciones principales, centradas */}
      <div className="flex flex-col items-center gap-3">
        <Button onClick={() => setCreating(true)} className="h-11 gap-2 rounded-xl px-6 text-sm">
          <Plus className="h-4 w-4" /> Nuevo artículo
        </Button>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <button
            type="button"
            onClick={toggleEngine}
            disabled={busy}
            className={cn('relative h-6 w-11 rounded-full transition', settings.enabled ? 'bg-gray-900' : 'bg-gray-300')}
            aria-label="Activar o pausar el piloto automático"
          >
            <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', settings.enabled ? 'left-[22px]' : 'left-0.5')} />
          </button>
          <span className="font-medium text-gray-900">Piloto automático {settings.enabled ? 'activado' : 'en pausa'}</span>
          {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          <Info>
            Activado, el sistema trabaja solo: cada semana reserva 2-3 fechas al azar, {settings.leadTimes.briefDaysBefore} días antes investiga el tema que toca, {settings.leadTimes.draftDaysBefore} días antes lo escribe y os lo deja en «Para revisar». Cuando lo aprobáis, se publica y se sube a la web en su fecha. En pausa no hace nada por su cuenta; podéis seguir creando artículos a mano.
          </Info>
        </div>
      </div>

      {!status.keys.openrouter && <Notice tone="error">Falta la clave de OpenRouter (<b>OPENROUTER_API_KEY</b>): sin ella no se puede investigar, escribir ni hacer imágenes.</Notice>}
      {settings.publish.method === 'ftp' && !status.keys.ftp && (
        <Notice tone="warn">
          Aún no está conectada la web. Para que los artículos se suban solos a buffaloia.com hay que poner los datos FTP de CDMON. <button className="font-medium underline" onClick={() => go('ajustes')}>Ver cómo</button>
        </Notice>
      )}
      {status.store === 'file' && <Notice>Modo de prueba: los datos del blog se guardan en este ordenador, no en la base de datos.</Notice>}
      {failed.length > 0 && (
        <Notice tone="error">
          {failed.length === 1 ? 'Un artículo tiene un error' : `${failed.length} artículos tienen errores`}:{' '}
          {failed.map((p, i) => <span key={p.id}>{i ? ', ' : ''}<Link className="font-medium underline" href={`/blog/${p.id}`}>{p.h1 || p.title}</Link></span>)}
        </Notice>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Para revisar" value={toReview.length} info="Artículos ya escritos y revisados por el sistema que esperan que alguien del equipo los lea y los apruebe." />
        <Stat label="Programados" value={count('aprobado')} info="Aprobados que esperan su fecha. Se publican y se suben a la web solos ese día y a esa hora." />
        <Stat label="Publicados" value={count('publicado')} info="Ya están en buffaloia.com/blog." />
        <Stat label="Gasto del mes" value={`${status.spend.toFixed(2)} $`} sub={`límite ${settings.budget.monthlyUsd} $`} info="Lo que han costado este mes la IA y las imágenes en OpenRouter. Si se llega al límite, el sistema deja de escribir hasta el mes siguiente. Se cambia en Ajustes." />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={`Para revisar (${toReview.length})`} info="Lo que tenéis que mirar. Abre cada uno, léelo en la vista previa, corrige lo que quieras y pulsa «Aprobar».">
          {toReview.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Nada pendiente de revisar.</p>
          ) : (
            <ul className="space-y-2">
              {toReview.map((p) => (
                <li key={p.id}>
                  <Link href={`/blog/${p.id}`} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 transition hover:border-gray-300">
                    <span className={cn('h-9 w-1 shrink-0 rounded-full', THEME_COLOR[p.theme])} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{p.h1 || p.title}</p>
                      <p className="text-xs text-gray-500">SEO {p.score ?? '—'}/100{p.scheduledAt ? ` · sale el ${fmt(p.scheduledAt, false)}` : ''}{p.gaps ? ` · ${p.gaps} huecos por rellenar` : ''}</p>
                    </div>
                    <span className="text-xs font-medium text-gray-500">Revisar →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Próximas publicaciones"
          info={`Las fechas que ha reservado el sistema: ${settings.schedule.minPerWeek}-${settings.schedule.maxPerWeek} por semana, en días y horas al azar para que no haya un patrón fijo. Un hueco «sin tema» recibe el siguiente tema de la cola ${settings.leadTimes.briefDaysBefore} días antes.`}
          action={<button className="text-xs font-medium text-gray-500 hover:text-gray-900" onClick={() => go('calendario')}>Ver calendario →</button>}
        >
          {upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">{settings.enabled ? 'Planificando…' : 'Activa el piloto automático para reservar fechas.'}</p>
          ) : (
            <ul className="space-y-1.5">
              {upcoming.map((sl) => {
                const p = sl.postId ? byId.get(sl.postId) : null
                return (
                  <li key={sl.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                    <div className="w-14 shrink-0 rounded-xl bg-gray-50 py-1 text-center">
                      <p className="text-[10px] uppercase text-gray-400">{new Date(sl.at).toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'Europe/Madrid' })}</p>
                      <p className="text-sm font-semibold leading-none text-gray-900">{new Date(sl.at).toLocaleDateString('es-ES', { day: 'numeric', timeZone: 'Europe/Madrid' })}</p>
                      <p className="text-[10px] text-gray-400">{time(sl.at)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      {p ? <Link href={`/blog/${p.id}`} className="line-clamp-1 text-sm text-gray-800 hover:text-gray-950">{p.h1 || p.title}</Link> : <p className="text-sm italic text-gray-400">Sin tema todavía</p>}
                      {sl.kind === 'actualidad' && <Pill className="mt-0.5 bg-orange-50 text-orange-600">Actualidad</Pill>}
                    </div>
                    {p && <StatusPill status={p.status} />}
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-4 text-xs">
          <a href="/api/blog/preview/index" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-gray-500 hover:text-gray-900">Ver cómo queda el blog <ExternalLink className="h-3 w-3" /></a>
          <button onClick={() => setShowLog((v) => !v)} className="inline-flex items-center gap-1 font-medium text-gray-500 hover:text-gray-900">
            Actividad reciente <ChevronDown className={cn('h-3 w-3 transition', showLog && 'rotate-180')} />
          </button>
        </div>
        {showLog && (
          <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {runs.slice(0, 30).map((r) => (
                <li key={r.id} className="flex gap-2 text-xs">
                  <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', r.ok ? 'bg-emerald-500' : 'bg-red-500')} />
                  <span><span className="text-gray-400">{fmt(r.at)}</span> · <b className="font-medium text-gray-700">{r.kind}</b> · <span className="text-gray-600">{r.message}</span>{r.usd ? <span className="text-gray-400"> · {r.usd.toFixed(3)} $</span> : null}</span>
                </li>
              ))}
              {!runs.length && <li className="py-4 text-center text-sm text-gray-400">Sin actividad todavía.</li>}
            </ul>
          </div>
        )}
      </div>

      <NewArticle open={creating} onClose={() => setCreating(false)} topics={topics} />
    </div>
  )
}
