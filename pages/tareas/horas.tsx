import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Info, Loader2 } from 'lucide-react'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import type { HoursReport, HoursReportPerson } from '@/lib/horas/store'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

type Mode = 'semana' | 'mes'
type Data = HoursReport & { can_see_team: boolean }

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function startOf(mode: Mode, ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  if (mode === 'mes') return new Date(d.getFullYear(), d.getMonth(), 1)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d
}

function shift(mode: Mode, start: Date, n: number): Date {
  return mode === 'mes'
    ? new Date(start.getFullYear(), start.getMonth() + n, 1)
    : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * n)
}

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(h: number): string {
  return h.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

function label(mode: Mode, start: Date, end: Date): string {
  if (mode === 'mes') return start.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const last = new Date(end.getTime() - 86400000)
  const a = start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  const b = last.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${a} – ${b}`
}

/** Días del periodo (laborables hasta hoy cuentan para la jornada disponible). */
function periodDays(start: Date, end: Date): { key: string; date: Date; workday: boolean; future: boolean }[] {
  const out = []
  const today = key(new Date())
  for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const dow = (d.getDay() + 6) % 7
    out.push({ key: key(d), date: d, workday: dow < 5, future: key(d) > today })
  }
  return out
}

function PersonRow({
  person,
  days,
  capacity,
  workday,
  mode,
}: {
  person: HoursReportPerson
  days: ReturnType<typeof periodDays>
  capacity: number
  workday: number
  mode: Mode
}) {
  const [open, setOpen] = useState(false)
  const pct = capacity > 0 ? Math.min(100, Math.round((person.hours / capacity) * 100)) : 0
  const shownDays = mode === 'semana' ? days : days.filter((d) => d.workday)
  return (
    <li className="rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-col gap-4 p-5 text-left lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3 lg:w-64">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
            {person.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{person.name}</p>
            <p className="text-xs text-gray-500">
              {pct}% de su jornada{capacity > 0 ? ` (${fmt(capacity)} h)` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-baseline gap-1 lg:w-28">
          <span className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(person.hours)}</span>
          <span className="text-sm text-gray-500">h</span>
        </div>

        {/* Horas por día */}
        <div className="flex min-w-0 flex-1 items-end gap-1" style={{ height: 44 }}>
          {shownDays.map((d) => {
            const h = person.by_day[d.key] ?? 0
            const height = Math.max(h > 0 ? 4 : 2, Math.round((Math.min(h, workday) / workday) * 40))
            return (
              <div key={d.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${d.date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}: ${fmt(h)} h`}>
                <div
                  className={cn('w-full max-w-[28px] rounded-sm', h > 0 ? 'bg-emerald-500' : d.workday && !d.future ? 'bg-gray-200' : 'bg-gray-100')}
                  style={{ height }}
                />
                {mode === 'semana' && <span className="text-[10px] text-gray-400">{DOW[(d.date.getDay() + 6) % 7]}</span>}
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 lg:w-72 lg:justify-end">
          {person.by_project.slice(0, 3).map((p) => (
            <span key={p.project_id ?? 'sueltas'} className="max-w-[11rem] truncate rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-700">
              {p.name} · {fmt(p.hours)} h
            </span>
          ))}
          {person.by_project.length > 3 && <span className="text-[11px] text-gray-400">+{person.by_project.length - 3}</span>}
          <ChevronDown className={cn('ml-1 h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4">
          <ul className="divide-y divide-gray-50">
            {person.tasks.map((t) => (
              <li key={t.task_id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-900">{t.title}</p>
                  <p className="text-[11px] text-gray-500">{t.project_name || (t.source === 'personal' ? 'Tarea suelta' : 'Proyecto')}</p>
                </div>
                {t.confirmed && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700" title="Horas confirmadas por la persona">
                    <CheckCircle2 className="h-3.5 w-3.5" /> confirmadas
                  </span>
                )}
                <span className="w-16 text-right text-sm font-medium tabular-nums text-gray-900">{fmt(t.hours)} h</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

export default function HorasPage() {
  const [mode, setMode] = useState<Mode>('semana')
  const [start, setStart] = useState(() => startOf('semana', new Date()))
  const end = useMemo(() => shift(mode, start, 1), [mode, start])
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    const qs = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() })
    fetch(`/api/tareas/horas?${qs}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error((d as { error?: string }).error || 'No se pudieron cargar las horas')
        return d as Data
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [start, end])

  const days = useMemo(() => periodDays(start, end), [start, end])
  const workday = data?.workday_hours ?? 8
  const capacity = days.filter((d) => d.workday && !d.future).length * workday
  const people = data?.people ?? []
  const total = people.reduce((a, p) => a + p.hours, 0)
  const isCurrent = key(start) === key(startOf(mode, new Date()))

  const changeMode = (m: Mode) => {
    setMode(m)
    setStart(startOf(m, new Date()))
  }

  return (
    <Layout>
      <div className="w-full space-y-6 pb-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/tareas" className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
                <Clock className="h-5 w-5" /> Horas trabajadas
              </h1>
              <p className="text-sm text-gray-500">
                {data?.can_see_team ? 'Lo que ha trabajado cada persona' : 'Lo que has trabajado'}, calculado con el tiempo de sus tareas en curso.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-9 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              {(['semana', 'mes'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => changeMode(m)}
                  className={cn(
                    'rounded-md px-3 text-sm font-medium capitalize transition-colors',
                    mode === m ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white">
              <button type="button" onClick={() => setStart(shift(mode, start, -1))} className="px-2 text-gray-500 hover:text-gray-900" aria-label="Anterior">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[10.5rem] px-1 text-center text-sm font-medium capitalize text-gray-800">{label(mode, start, end)}</span>
              <button
                type="button"
                onClick={() => setStart(shift(mode, start, 1))}
                disabled={isCurrent}
                className="px-2 text-gray-500 hover:text-gray-900 disabled:opacity-30"
                aria-label="Siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {!isCurrent && (
              <button type="button" onClick={() => setStart(startOf(mode, new Date()))} className="text-xs font-medium text-gray-500 hover:text-gray-900">
                Hoy
              </button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: data?.can_see_team ? 'Horas del equipo' : 'Tus horas', value: `${fmt(total)} h` },
            data?.can_see_team
              ? { label: 'Media por persona', value: people.length ? `${fmt(total / people.length)} h` : '—' }
              : { label: 'De tu jornada', value: capacity ? `${Math.round((total / capacity) * 100)}%` : '—' },
            { label: 'Jornada disponible', value: `${fmt(capacity)} h`, hint: `${fmt(workday)} h por día laborable hasta hoy` },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{k.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{k.value}</p>
              {'hint' in k && k.hint && <p className="mt-0.5 text-[11px] text-gray-400">{k.hint}</p>}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : people.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
            <p className="text-sm font-medium text-gray-700">Sin horas en este periodo</p>
            <p className="mt-1 text-xs text-gray-500">Las horas salen solas cuando las tareas pasan por «En curso».</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {people.map((p) => (
              <PersonRow key={p.key} person={p} days={days} capacity={capacity} workday={workday} mode={mode} />
            ))}
          </ul>
        )}

        <div className="flex gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-5 text-xs leading-relaxed text-gray-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div className="space-y-1">
            <p className="font-medium text-gray-800">Cómo se calcula</p>
            <p>
              Cuenta el tiempo que cada tarea está «En curso», solo de lunes a viernes de 9:00 a 14:00 y de 15:00 a 18:00 ({fmt(workday)} h al día).
              Validación no cuenta; si la tarea vuelve a «En curso», sigue sumando.
            </p>
            <p>
              Si alguien tiene varias tareas en curso a la vez, cada hora se reparte entre ellas, así que nadie pasa de su jornada.
              Al pasar una tarea a «Hecha» se pide confirmar las horas: lo confirmado manda sobre lo calculado.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
