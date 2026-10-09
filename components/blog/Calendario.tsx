import Link from 'next/link'
import { useState } from 'react'
import { Lock, Loader2, Newspaper, Shuffle, Trash2, Unlock, CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, fmt, Notice, Panel, Pill, StatusPill } from './shared'
import type { TabProps } from './types'

export default function Calendario({ state, reload }: TabProps) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const { slots, posts, settings } = state
  const byId = new Map(posts.map((p) => [p.id, p]))
  const now = new Date().toISOString()
  const assignable = posts.filter((p) => !['publicado', 'rechazado'].includes(p.status))

  const weeks = new Map<string, typeof slots>()
  for (const s of slots.filter((x) => x.at >= now.slice(0, 10))) weeks.set(s.week, [...(weeks.get(s.week) || []), s])

  const call = async (key: string, path: string, body: unknown = {}) => {
    setBusy(key)
    setErr('')
    try {
      await api(path, { body })
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-gray-500">
          {settings.schedule.minPerWeek}-{settings.schedule.maxPerWeek} artículos por semana, en días laborables distintos, a una hora aleatoria dentro de las franjas ({settings.schedule.windows.map((w) => `${w.from}-${w.to}`).join(' y ')}), con al menos {settings.schedule.minGapHours} h entre uno y otro.
          1 de cada {settings.schedule.newsEvery} es de actualidad. Se planifica con {settings.schedule.planAheadWeeks} semanas de margen.
        </p>
        <Button variant="outline" className="gap-1.5 rounded-xl" onClick={() => call('plan', 'schedule/plan')} disabled={!!busy}>
          {busy === 'plan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Planificar semanas
        </Button>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      {weeks.size === 0 && <Notice>No hay huecos planificados. Pulsa «Planificar semanas».</Notice>}

      {[...weeks.entries()].map(([week, list]) => (
        <Panel
          key={week}
          title={`Semana del ${fmt(list[0].at, false)} · ${list.length} artículos`}
          action={
            <Button size="sm" variant="ghost" className="gap-1 rounded-lg text-xs" disabled={!!busy} onClick={() => call(week, 'schedule/reshuffle', { week })}>
              {busy === week ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />} Volver a sortear
            </Button>
          }
        >
          <ul className="divide-y divide-gray-100">
            {list.map((sl) => {
              const p = sl.postId ? byId.get(sl.postId) : null
              return (
                <li key={sl.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="w-40 text-sm font-medium capitalize text-gray-900">{fmt(sl.at)}</span>
                  {sl.kind === 'actualidad' ? <Pill className="bg-orange-50 text-orange-700">Actualidad</Pill> : <Pill className="bg-gray-100 text-gray-600">Normal</Pill>}
                  {sl.locked && <Pill className="bg-gray-800 text-white">Fijado</Pill>}
                  <div className="min-w-[200px] flex-1">
                    {p ? (
                      <span className="flex items-center gap-2">
                        <Link href={`/blog/${p.id}`} className="truncate text-sm text-gray-700 hover:text-emerald-700">{p.h1 || p.title}</Link>
                        <StatusPill status={p.status} />
                      </span>
                    ) : (
                      <select
                        className="w-full max-w-md rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-500"
                        value=""
                        onChange={(e) => e.target.value && call(sl.id, `slot/${sl.id}/assign`, { postId: e.target.value })}
                      >
                        <option value="">Se asignará solo el siguiente tema · o elige un artículo…</option>
                        {assignable.map((x) => <option key={x.id} value={x.id}>{x.h1 || x.title}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-8 rounded-lg" title="Cambiar a normal / actualidad" onClick={() => call(sl.id, `slot/${sl.id}/kind`)}><Newspaper className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 rounded-lg" title={sl.locked ? 'Desbloquear' : 'Fijar (no se mueve al volver a sortear)'} onClick={() => call(sl.id, `slot/${sl.id}/lock`)}>
                      {sl.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    </Button>
                    {p && <Button size="sm" variant="ghost" className="h-8 rounded-lg text-xs" title="Quitar el artículo de este hueco" onClick={() => call(sl.id, `slot/${sl.id}/assign`, { postId: '' })}>Liberar</Button>}
                    <Button size="sm" variant="ghost" className="h-8 rounded-lg text-gray-400" title="Eliminar hueco" onClick={() => call(sl.id, `slot/${sl.id}/delete`)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      ))}
    </div>
  )
}
