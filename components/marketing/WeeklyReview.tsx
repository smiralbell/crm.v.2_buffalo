import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { MAX_DECISIONS, addDays, mondayOf, type ReviewData, type ReviewDecision } from '@/lib/marketing/sales.types'
import { ErrorBox, call, field, isoDay, json, shortDay } from '@/components/marketing/shared'

const API = '/api/marketing/review'

function TaskState({ d }: { d: ReviewDecision }) {
  const s = d.task_status
  const [label, cls] =
    s === 'done'
      ? ['Hecha', 'bg-emerald-50 text-emerald-800']
      : s === 'in_progress'
      ? ['En curso', 'bg-blue-50 text-blue-800']
      : s === 'buffalo_validation'
      ? ['En validación', 'bg-violet-50 text-violet-800']
      : s === 'pending'
      ? ['Pendiente', 'bg-amber-50 text-amber-800']
      : ['Sin tarea', 'bg-gray-100 text-gray-500']
  return <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', cls)}>{label}</span>
}

/** Revisión del lunes: qué pasó, cómo vamos y qué decidimos (cada decisión es una tarea). */
export default function WeeklyReview() {
  const today = isoDay(new Date())
  const current = mondayOf(today)
  const [week, setWeek] = useState(current)
  const [data, setData] = useState<ReviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ texto: '', user_id: '', due_date: '' })
  const [notes, setNotes] = useState('')

  const load = useCallback(
    () =>
      call<ReviewData>(`${API}?week=${week}`)
        .then((d) => {
          setData(d)
          setNotes(d.notas ?? '')
          setError(null)
        })
        .catch((e) => setError(e.message)),
    [week]
  )
  useEffect(() => {
    setData(null)
    void load()
  }, [load])

  const run = async (fn: () => Promise<unknown>, reload = true) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      if (reload) await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      return false
    } finally {
      setBusy(false)
    }
  }
  const add = async () => {
    const ok = await run(() =>
      call(API, json('POST', { week_start: week, texto: f.texto, user_id: f.user_id ? Number(f.user_id) : null, due_date: f.due_date || null }))
    )
    if (ok) setF({ texto: '', user_id: '', due_date: '' })
  }
  const left = data ? MAX_DECISIONS - data.decisions.length : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Revisión del lunes {shortDay(week)}</h2>
          <p className="text-sm text-gray-500">10 minutos: qué pasó, cómo vamos y qué hacemos esta semana.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setWeek(addDays(week, -7))} aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {week !== current && (
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setWeek(current)}>
              Esta semana
            </Button>
          )}
          <Button variant="outline" size="sm" className="rounded-xl" disabled={week >= current} onClick={() => setWeek(addDays(week, 7))} aria-label="Semana siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ErrorBox text={error} />
      {!data && !error && <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />}
      {data && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-800">1 · Qué pasó</CardTitle>
                <p className="text-xs text-gray-400">
                  Del {shortDay(data.from)} al {shortDay(data.to)}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-700">
                  {data.summary.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                      {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-800">2 · Cómo vamos</CardTitle>
                <p className="text-xs text-gray-400">
                  {data.goals.period_label}
                  {data.goals.days_left > 0 && ` · quedan ${data.goals.days_left} días`}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.goals.items.map((g) => (
                  <div key={g.label}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-gray-600">{g.label}</span>
                      <span className="font-semibold tabular-nums text-gray-900">
                        {g.cur}
                        {g.goal != null && <span className="font-normal text-gray-400"> / {g.goal}</span>}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${g.goal ? Math.min(100, Math.round((g.cur / g.goal) * 100)) : 0}%` }} />
                    </div>
                  </div>
                ))}
                {data.goals.items.every((g) => g.goal == null) && <p className="text-xs text-gray-400">Pon los objetivos del mes en Planificación.</p>}
              </CardContent>
            </Card>
          </div>

          {data.previous.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-800">Lo que decidimos la semana pasada</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {data.previous.map((d) => (
                    <li key={d.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-gray-900">
                          {d.texto} <span className="font-normal text-gray-500">· {d.user_name}</span>
                        </span>
                        <TaskState d={d} />
                      </div>
                      <input
                        className={cn(field, 'mt-2')}
                        placeholder="¿Qué ha pasado?"
                        aria-label={`Resultado: ${d.texto}`}
                        defaultValue={d.resultado ?? ''}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (v !== (d.resultado ?? '')) void run(() => call(`${API}?id=${d.id}`, json('PATCH', { resultado: v })))
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-800">
                3 · Qué decidimos <span className="font-normal text-gray-400">· {data.decisions.length} de {MAX_DECISIONS}</span>
              </CardTitle>
              <p className="text-xs text-gray-400">Cada decisión se crea como tarea del CRM para esa persona</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.decisions.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 p-3 text-sm">
                  <span className="font-medium text-gray-900">
                    {d.texto}
                    <span className="font-normal text-gray-500">
                      {' '}
                      · {d.user_name}
                      {d.due_date && ` · ${shortDay(d.due_date)}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <TaskState d={d} />
                    <button
                      type="button"
                      aria-label={`Quitar ${d.texto}`}
                      className="text-gray-300 hover:text-red-600"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('¿Quitar esta decisión de la revisión? La tarea seguirá en Tareas.')) {
                          void run(() => call(`${API}?id=${d.id}`, { method: 'DELETE' }))
                        }
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </div>
              ))}
              {left > 0 ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_180px_160px_auto]">
                  <input className={field} name="decision" placeholder="Ej.: parar el anuncio B" value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} />
                  {data.can_assign ? (
                    <select className={field} name="decision-user" value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })}>
                      <option value="">¿Quién?</option>
                      {data.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="self-center text-xs text-gray-400">Para ti</span>
                  )}
                  <input type="date" className={field} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} aria-label="Para cuándo" />
                  <Button size="sm" className="h-full rounded-xl" onClick={add} disabled={busy || f.texto.trim().length < 3 || (data.can_assign && !f.user_id)}>
                    <Plus className="mr-1 h-4 w-4" /> Añadir
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Máximo tres por semana: mejor pocas y hechas.</p>
              )}
              <textarea
                rows={2}
                className={field}
                placeholder="Notas de la revisión (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== (data.notas ?? '') && void run(() => call(API, json('PUT', { week_start: week, notas: notes })), false)}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
