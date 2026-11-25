import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ExternalLink, List, Plus, Target, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  PLAN_CHANNELS,
  PLAN_FORMATS,
  PLAN_PILLARS,
  PLAN_SECTORS,
  PLAN_STATUSES,
  labelOf,
  summarizePlan,
  type PlanGoals,
  type PlanItem,
  type PlanMonth,
} from '@/lib/marketing/plan.types'

type Draft = {
  id?: number
  fecha: string
  titulo: string
  formato: string
  canal: string
  pilar: string
  sector: string
  estado: string
  responsable: string
  enlace: string
  notas: string
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const channelColor = (id: string) => PLAN_CHANNELS.find((c) => c.id === id)?.color ?? '#6B7280'
const statusColor = (id: string) => PLAN_STATUSES.find((s) => s.id === id)?.color ?? '#9CA3AF'
const todayStr = () => new Date().toISOString().slice(0, 10)

function emptyDraft(fecha: string): Draft {
  return { fecha, titulo: '', formato: 'reel', canal: 'instagram', pilar: '', sector: 'legal', estado: 'idea', responsable: '', enlace: '', notas: '' }
}

function monthGrid(period: string): (string | null)[] {
  const [y, m] = period.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7 // lunes = 0
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= days; d++) cells.push(`${period}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)
  return cells
}

const field = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200'

function Select({ value, onChange, options, empty }: { value: string; onChange: (v: string) => void; options: readonly { id: string; label: string }[]; empty?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={field}>
      {empty != null && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export default function MarketingPlanCalendar({ period }: { period: string }) {
  const [data, setData] = useState<PlanMonth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'mes' | 'lista'>('mes')
  const [channelFilter, setChannelFilter] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [goals, setGoals] = useState<PlanGoals | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/marketing/plan?period=${encodeURIComponent(period)}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo cargar')
      setData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    load()
  }, [load])

  const items = useMemo(
    () => (data?.items ?? []).filter((i) => !channelFilter || i.canal === channelFilter),
    [data, channelFilter]
  )
  const byDay = useMemo(() => {
    const m = new Map<string, PlanItem[]>()
    for (const it of items) m.set(it.fecha, [...(m.get(it.fecha) || []), it])
    return m
  }, [items])
  const summary = useMemo(() => summarizePlan(data?.items ?? [], data?.goals ?? null, todayStr()), [data])

  const openNew = (fecha?: string) => setDraft(emptyDraft(fecha || (todayStr().startsWith(period) ? todayStr() : `${period}-01`)))
  const openEdit = (it: PlanItem) =>
    setDraft({
      id: it.id,
      fecha: it.fecha,
      titulo: it.titulo,
      formato: it.formato,
      canal: it.canal,
      pilar: it.pilar ?? '',
      sector: it.sector ?? '',
      estado: it.estado,
      responsable: it.responsable ?? '',
      enlace: it.enlace ?? '',
      notas: it.notas ?? '',
    })

  const save = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    const body = { ...draft, pilar: draft.pilar || null, sector: draft.sector || null }
    delete (body as { id?: number }).id
    try {
      const r = await fetch(draft.id ? `/api/marketing/plan?id=${draft.id}` : '/api/marketing/plan', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar')
      setDraft(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!draft?.id) return
    if (!window.confirm('¿Borrar esta pieza del calendario?')) return
    setSaving(true)
    try {
      const r = await fetch(`/api/marketing/plan?id=${draft.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo borrar')
      setDraft(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const quickStatus = async (it: PlanItem, estado: string) => {
    await fetch(`/api/marketing/plan?id=${it.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    load()
  }

  const saveGoals = async () => {
    if (!goals) return
    setSaving(true)
    try {
      const r = await fetch('/api/marketing/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goals),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo guardar')
      setGoalsOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const today = todayStr()

  return (
    <div className="space-y-4">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-0.5">
          {(['mes', 'lista'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', view === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900')}
            >
              {v === 'mes' ? <CalendarDays className="h-4 w-4" /> : <List className="h-4 w-4" />}
              {v === 'mes' ? 'Mes' : 'Lista'}
            </button>
          ))}
        </div>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="">Todos los canales</option>
          {PLAN_CHANNELS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setGoals(data?.goals ?? null); setGoalsOpen(true) }} disabled={!data}>
            <Target className="mr-1.5 h-4 w-4" /> Objetivos del mes
          </Button>
          <Button size="sm" className="rounded-xl" onClick={() => openNew()}>
            <Plus className="mr-1.5 h-4 w-4" /> Nueva pieza
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: 'Piezas del mes', v: `${summary.total}${data?.goals.piezas_objetivo != null ? ` / ${data.goals.piezas_objetivo}` : ''}` },
          { l: 'Publicadas', v: String(summary.publicados) },
          { l: 'En curso', v: String(summary.en_curso) },
          { l: 'Atrasadas', v: String(summary.atrasados), warn: summary.atrasados > 0 },
        ].map((k) => (
          <div key={k.l} className={cn('rounded-2xl border bg-white px-4 py-3 shadow-sm', k.warn ? 'border-amber-300' : 'border-gray-200/80')}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{k.l}</p>
            <p className={cn('mt-1 text-xl font-semibold tabular-nums', k.warn ? 'text-amber-700' : 'text-gray-900')}>{k.v}</p>
          </div>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading && !data ? (
        <div className="h-96 animate-pulse rounded-2xl bg-gray-100" />
      ) : view === 'mes' ? (
        <Card className="overflow-hidden shadow-sm">
          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50 text-center text-[11px] font-medium uppercase tracking-wide text-gray-500">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthGrid(period).map((day, i) => (
              <div
                key={i}
                className={cn('group min-h-[112px] border-b border-r border-gray-100 p-1.5', !day && 'bg-gray-50/50', day === today && 'bg-emerald-50/40')}
              >
                {day && (
                  <>
                    <div className="mb-1 flex items-center justify-between">
                      <span className={cn('text-xs tabular-nums', day === today ? 'font-bold text-emerald-700' : 'text-gray-400')}>{Number(day.slice(8))}</span>
                      <button type="button" onClick={() => openNew(day)} className="hidden rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 group-hover:block" title="Añadir pieza">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {(byDay.get(day) || []).map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => openEdit(it)}
                          className={cn('block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium text-white', it.estado === 'publicado' && 'opacity-60')}
                          style={{ background: channelColor(it.canal) }}
                          title={`${it.titulo} · ${labelOf(PLAN_FORMATS, it.formato)} · ${labelOf(PLAN_STATUSES, it.estado)}`}
                        >
                          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: statusColor(it.estado), boxShadow: '0 0 0 1px #fff' }} />
                          {it.titulo}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="shadow-sm">
          <CardContent className="overflow-x-auto p-0">
            {items.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">No hay piezas este mes. Pulsa «Nueva pieza» para empezar.</p>
            ) : (
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="py-2 font-medium">Pieza</th>
                    <th className="py-2 font-medium">Canal</th>
                    <th className="py-2 font-medium">Formato</th>
                    <th className="py-2 font-medium">Pilar</th>
                    <th className="py-2 font-medium">Responsable</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const late = it.estado !== 'publicado' && it.fecha < today
                    return (
                      <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className={cn('px-4 py-2 tabular-nums', late ? 'font-medium text-amber-700' : 'text-gray-600')}>
                          {it.fecha.slice(8)}/{it.fecha.slice(5, 7)}
                        </td>
                        <td className="py-2">
                          <button type="button" onClick={() => openEdit(it)} className="text-left font-medium text-gray-900 hover:underline">
                            {it.titulo}
                          </button>
                          {it.enlace && (
                            <a href={it.enlace} target="_blank" rel="noreferrer" className="ml-1.5 inline-block text-gray-400 hover:text-gray-700">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </td>
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1.5 text-gray-700">
                            <span className="h-2 w-2 rounded-full" style={{ background: channelColor(it.canal) }} />
                            {labelOf(PLAN_CHANNELS, it.canal)}
                          </span>
                        </td>
                        <td className="py-2 text-gray-600">{labelOf(PLAN_FORMATS, it.formato)}</td>
                        <td className="py-2 text-gray-600">{it.pilar ? labelOf(PLAN_PILLARS, it.pilar) : '—'}</td>
                        <td className="py-2 text-gray-600">{it.responsable || '—'}</td>
                        <td className="py-2 pr-4">
                          <select value={it.estado} onChange={(e) => quickStatus(it, e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs" style={{ color: statusColor(it.estado) }}>
                            {PLAN_STATUSES.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        {PLAN_CHANNELS.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
            {c.label}
          </span>
        ))}
      </div>

      {/* Editar / crear pieza */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Editar pieza' : 'Nueva pieza'}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">Título</label>
                <input className={field} value={draft.titulo} onChange={(e) => setDraft({ ...draft, titulo: e.target.value })} placeholder="Ej.: Carrusel «¿Cuántas horas facturables pierde tu despacho?»" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Fecha</label>
                <input type="date" className={field} value={draft.fecha} onChange={(e) => setDraft({ ...draft, fecha: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Estado</label>
                <Select value={draft.estado} onChange={(v) => setDraft({ ...draft, estado: v })} options={PLAN_STATUSES} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Canal</label>
                <Select value={draft.canal} onChange={(v) => setDraft({ ...draft, canal: v })} options={PLAN_CHANNELS} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Formato</label>
                <Select value={draft.formato} onChange={(v) => setDraft({ ...draft, formato: v })} options={PLAN_FORMATS} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Pilar</label>
                <Select value={draft.pilar} onChange={(v) => setDraft({ ...draft, pilar: v })} options={PLAN_PILLARS} empty="—" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Sector</label>
                <Select value={draft.sector} onChange={(v) => setDraft({ ...draft, sector: v })} options={PLAN_SECTORS} empty="—" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Responsable</label>
                <input className={field} value={draft.responsable} onChange={(e) => setDraft({ ...draft, responsable: e.target.value })} placeholder="Ekaitz" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Enlace (cuando esté publicado)</label>
                <input className={field} value={draft.enlace} onChange={(e) => setDraft({ ...draft, enlace: e.target.value })} placeholder="https://…" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">Notas / guion</label>
                <textarea rows={4} className={field} value={draft.notas} onChange={(e) => setDraft({ ...draft, notas: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                {draft.id && (
                  <Button variant="outline" size="sm" className="rounded-xl text-red-600" onClick={remove} disabled={saving}>
                    <Trash2 className="mr-1.5 h-4 w-4" /> Borrar
                  </Button>
                )}
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setDraft(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="rounded-xl" onClick={save} disabled={saving || !draft.titulo.trim()}>
                    {saving ? 'Guardando…' : 'Guardar'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Objetivos */}
      <Dialog open={goalsOpen} onOpenChange={setGoalsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Objetivos del mes</DialogTitle>
          </DialogHeader>
          {goals && (
            <div className="space-y-3">
              {(
                [
                  ['piezas_objetivo', 'Piezas a publicar'],
                  ['reuniones_objetivo', 'Reuniones'],
                  ['clientes_objetivo', 'Clientes nuevos'],
                ] as const
              ).map(([k, l]) => (
                <div key={k}>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{l}</label>
                  <input
                    type="number"
                    min={0}
                    className={field}
                    value={goals[k] ?? ''}
                    onChange={(e) => setGoals({ ...goals, [k]: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Notas</label>
                <textarea rows={3} className={field} value={goals.notas ?? ''} onChange={(e) => setGoals({ ...goals, notas: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setGoalsOpen(false)}>
                  Cancelar
                </Button>
                <Button size="sm" className="rounded-xl" onClick={saveGoals} disabled={saving}>
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
