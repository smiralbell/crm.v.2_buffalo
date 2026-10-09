import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, Lock, Newspaper, Shuffle, Trash2, Unlock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Slot } from '@/lib/blog/types'
import { cn } from '@/lib/utils'
import { api, fmt, Notice, Pill, STATUS, StatusPill, THEME_COLOR, THEME_NAMES, ThemePill, time } from './shared'
import type { PostLite, TabProps } from './types'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Día en Madrid (AAAA-MM-DD) de un instante. */
const madridDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

interface Entry {
  key: string
  at: string
  slot?: Slot
  post?: PostLite
}

export default function Calendario({ state, reload }: TabProps) {
  const { slots, posts, settings } = state
  const [month, setMonth] = useState(() => {
    const first = slots.find((s) => s.at >= new Date().toISOString())
    const base = first ? new Date(first.at) : new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts])

  // Huecos con su artículo, más los publicados que no tienen hueco (publicados a mano)
  const entries = useMemo(() => {
    const list: Entry[] = slots.map((s) => ({ key: s.id, at: s.at, slot: s, post: s.postId ? byId.get(s.postId) : undefined }))
    const inSlots = new Set(slots.map((s) => s.postId).filter(Boolean))
    for (const p of posts) if (p.status === 'publicado' && p.publishedAt && !inSlots.has(p.id)) list.push({ key: p.id, at: p.publishedAt, post: p })
    const map = new Map<string, Entry[]>()
    for (const e of list) map.set(madridDay(e.at), [...(map.get(madridDay(e.at)) || []), e])
    Array.from(map.values()).forEach((l) => l.sort((a, b) => a.at.localeCompare(b.at)))
    return map
  }, [slots, posts, byId])

  // Cuadrícula de 6 semanas empezando en lunes
  const days = useMemo(() => {
    const start = new Date(month)
    start.setDate(1 - ((start.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [month])
  const rows = Array.from({ length: 6 }, (_, r) => days.slice(r * 7, r * 7 + 7)).filter((row, i) => i < 5 || row.some((d) => d.getMonth() === month.getMonth()))

  const paused = (d: Date) => settings.schedule.pauses.some((p) => dayKey(d) >= p.from && dayKey(d) <= p.to)
  const today = dayKey(new Date())
  const sel = selected ? Array.from(entries.values()).flat().find((e) => e.key === selected) : null
  const assignable = posts.filter((p) => !['publicado', 'rechazado'].includes(p.status))
  const monthCount = days.filter((d) => d.getMonth() === month.getMonth()).reduce((n, d) => n + (entries.get(dayKey(d))?.length || 0), 0)

  const call = async (key: string, path: string, body: unknown = {}) => {
    setBusy(key)
    setErr('')
    try {
      await api(path, { body })
      await reload()
      if (path.endsWith('/delete')) setSelected(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  const weekOf = (row: Date[]) => slots.find((s) => row.some((d) => madridDay(s.at) === dayKey(d)))?.week

  return (
    <div className="space-y-5">
      {/* Cabecera centrada */}
      <div className="flex flex-col items-center gap-3 lg:flex-row lg:justify-between">
        <div className="hidden lg:block lg:w-56" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-[200px] text-center">
            <p className="text-lg font-semibold capitalize text-gray-900">{month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</p>
            <p className="text-xs text-gray-500">{monthCount} artículos este mes</p>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Hoy</Button>
        </div>
        <div className="flex justify-center lg:w-56 lg:justify-end">
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => call('plan', 'schedule/plan')} disabled={!!busy}>
            {busy === 'plan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Planificar semanas
          </Button>
        </div>
      </div>

      <p className="mx-auto max-w-3xl text-center text-xs text-gray-500">
        {settings.schedule.minPerWeek}-{settings.schedule.maxPerWeek} artículos por semana en días y horas aleatorios ({settings.schedule.windows.map((w) => `${w.from}-${w.to}`).join(' y ')}), con al menos {settings.schedule.minGapHours} h entre uno y otro. 1 de cada {settings.schedule.newsEvery} es de actualidad.
      </p>
      {err && <Notice tone="error">{err}</Notice>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/80">
          {WEEKDAYS.map((d) => <div key={d} className="py-2.5 text-center text-xs font-medium text-gray-500">{d}</div>)}
        </div>
        {rows.map((row, ri) => {
          const week = weekOf(row)
          return (
            <div key={ri} className="group/row grid grid-cols-7 border-b border-gray-100 last:border-b-0">
              {row.map((d, di) => {
                const k = dayKey(d)
                const list = entries.get(k) || []
                const out = d.getMonth() !== month.getMonth()
                return (
                  <div
                    key={k}
                    className={cn(
                      'relative min-h-[118px] border-r border-gray-100 p-1.5 last:border-r-0',
                      out && 'bg-gray-50/60',
                      paused(d) && 'bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(0,0,0,0.025)_6px,rgba(0,0,0,0.025)_12px)]',
                      di >= 5 && !out && 'bg-gray-50/30'
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between px-1">
                      <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs', k === today ? 'bg-gray-900 font-semibold text-white' : out ? 'text-gray-300' : 'text-gray-600')}>{d.getDate()}</span>
                      {di === 0 && week && (
                        <button
                          title="Volver a sortear esta semana"
                          onClick={() => call('w' + week, 'schedule/reshuffle', { week })}
                          className="rounded-lg p-1 text-gray-300 opacity-0 transition hover:bg-gray-100 hover:text-gray-700 group-hover/row:opacity-100"
                        >
                          {busy === 'w' + week ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {paused(d) && di !== 0 && <span className="text-[10px] text-gray-400">Pausa</span>}
                    </div>
                    <div className="space-y-1">
                      {list.map((e) => {
                        const p = e.post
                        const news = e.slot?.kind === 'actualidad'
                        return (
                          <button
                            key={e.key}
                            onClick={() => setSelected(e.key === selected ? null : e.key)}
                            className={cn(
                              'w-full overflow-hidden rounded-xl border text-left transition hover:shadow-sm',
                              selected === e.key ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200',
                              p?.status === 'publicado' ? 'bg-gray-50' : 'bg-white'
                            )}
                          >
                            <div className="flex">
                              <span className={cn('w-1 shrink-0', p ? THEME_COLOR[p.theme] : news ? THEME_COLOR.N : 'bg-gray-200')} />
                              <div className="min-w-0 flex-1 px-2 py-1.5">
                                <div className="flex items-center gap-1 text-[10px] font-medium text-gray-500">
                                  <span>{time(e.at)}</span>
                                  {news && <span className="rounded-full bg-orange-50 px-1.5 text-orange-600">Actualidad</span>}
                                  {e.slot?.locked && <Lock className="h-2.5 w-2.5" />}
                                  {p && <span className={cn('ml-auto h-1.5 w-1.5 rounded-full', STATUS[p.status].dot)} title={STATUS[p.status].label} />}
                                </div>
                                <p className={cn('mt-0.5 line-clamp-2 text-[11px] leading-snug', p ? 'text-gray-800' : 'italic text-gray-400')}>
                                  {p ? p.h1 || p.title : 'Tema por asignar'}
                                </p>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-gray-500">
        {Object.entries(STATUS).filter(([k]) => k !== 'rechazado').map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-full', v.dot)} />{v.label}</span>
        ))}
        <span className="text-gray-300">|</span>
        {(Object.keys(THEME_NAMES) as (keyof typeof THEME_NAMES)[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className={cn('h-2.5 w-1 rounded-full', THEME_COLOR[k])} />{THEME_NAMES[k]}</span>
        ))}
      </div>

      {/* Ficha del hueco seleccionado */}
      {sel && (
        <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="text-sm font-medium capitalize text-gray-500">{fmt(sel.at)}</p>
              <p className="text-base font-semibold text-gray-900">{sel.post ? sel.post.h1 || sel.post.title : 'Hueco sin tema todavía'}</p>
              <div className="flex flex-wrap gap-1.5">
                {sel.post && <StatusPill status={sel.post.status} />}
                {sel.post && <ThemePill theme={sel.post.theme} />}
                {sel.slot?.kind === 'actualidad' && <Pill className="bg-orange-50 text-orange-600">Actualidad</Pill>}
                {sel.slot?.locked && <Pill className="bg-gray-900 text-white">Fijado</Pill>}
              </div>
              {!sel.post && <p className="text-xs text-gray-500">El motor le asignará el siguiente tema de la cola {settings.leadTimes.briefDaysBefore} días antes. También puedes elegir uno ahora.</p>}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {sel.post && <Link href={`/blog/${sel.post.id}`}><Button size="sm" className="rounded-xl">Abrir artículo</Button></Link>}
            {sel.slot && (
              <>
                {!sel.post && (
                  <select className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700" value="" onChange={(e) => e.target.value && call('assign', `slot/${sel.slot!.id}/assign`, { postId: e.target.value })}>
                    <option value="">Asignar un artículo…</option>
                    {assignable.map((x) => <option key={x.id} value={x.id}>{x.h1 || x.title}</option>)}
                  </select>
                )}
                <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={() => call('kind', `slot/${sel.slot!.id}/kind`)}><Newspaper className="h-3.5 w-3.5" /> {sel.slot.kind === 'actualidad' ? 'Pasar a normal' : 'Pasar a actualidad'}</Button>
                <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={() => call('lock', `slot/${sel.slot!.id}/lock`)}>
                  {sel.slot.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} {sel.slot.locked ? 'Desfijar' : 'Fijar fecha'}
                </Button>
                {sel.post && sel.post.status !== 'publicado' && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => call('free', `slot/${sel.slot!.id}/assign`, { postId: '' })}>Quitar el artículo</Button>}
                <Button size="sm" variant="ghost" className="gap-1.5 rounded-xl text-gray-500" onClick={() => call('del', `slot/${sel.slot!.id}/delete`)}><Trash2 className="h-3.5 w-3.5" /> Eliminar hueco</Button>
              </>
            )}
            {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>
        </div>
      )}
    </div>
  )
}
