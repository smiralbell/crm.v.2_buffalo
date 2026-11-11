import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderKanban,
  History,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import WorkLogDialog from '@/components/trabajo/WorkLogDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { addDays, groupByDay, presetRange, todayMadrid, type WorkDay } from '@/lib/trabajo/format'
import type { TrabajoResponse, WorkEntry, WorkReport } from '@/lib/trabajo/types'

type View = 'historia' | 'calendario'
const PRESETS = [
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: 'month', label: 'Este mes' },
  { id: '90d', label: 'Últimos 3 meses' },
  { id: 'all', label: 'Último año' },
]

interface Props {
  /** Admin, desde Usuarios: el trabajo de esa persona */
  scopeUserId?: number
  storageKey: string
}

function dayLabel(d: string): string {
  const s = format(parseISO(d), "EEEE d 'de' MMMM", { locale: es })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function hoursLabel(h: number): string {
  return `${String(Math.round(h * 100) / 100).replace('.', ',')} h`
}

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function readPrefs(key: string): { view: View; preset: string } {
  try {
    const p = JSON.parse(window.localStorage.getItem(key) || '{}')
    return {
      view: p.view === 'calendario' ? 'calendario' : 'historia',
      preset: PRESETS.some((x) => x.id === p.preset) ? p.preset : '30d',
    }
  } catch {
    return { view: 'historia', preset: '30d' }
  }
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

/** Módulo Trabajo diario: lo que ha hecho cada día, como historia o calendario. */
export default function WorkLogWorkspace({ scopeUserId, storageKey }: Props) {
  const today = todayMadrid()
  const [view, setView] = useState<View>('historia')
  const [preset, setPreset] = useState('30d')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [projectFilter, setProjectFilter] = useState('all')
  const [q, setQ] = useState('')
  const [data, setData] = useState<TrabajoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WorkEntry | null>(null)
  const [report, setReport] = useState<WorkReport | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  useEffect(() => {
    const p = readPrefs(`${storageKey}:prefs`)
    setView(p.view)
    setPreset(p.preset)
  }, [storageKey])

  useEffect(() => {
    try {
      window.localStorage.setItem(`${storageKey}:prefs`, JSON.stringify({ view, preset }))
    } catch {
      // sin almacenamiento: no pasa nada
    }
  }, [view, preset, storageKey])

  const range = useMemo(
    () => (view === 'calendario' ? monthRange(month) : presetRange(preset, today)),
    [view, month, preset, today]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ desde: range.from, hasta: range.to })
      if (scopeUserId) params.set('user_id', String(scopeUserId))
      const res = await fetch(`/api/trabajo?${params}`)
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'No se pudo cargar')
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, scopeUserId])

  useEffect(() => {
    void load()
  }, [load])

  const entries = useMemo(() => {
    const n = norm(q.trim())
    return (data?.entries ?? []).filter((e) => {
      if (projectFilter === 'none' && e.project_id) return false
      if (projectFilter !== 'all' && projectFilter !== 'none' && e.project_id !== projectFilter) return false
      if (n && !norm(`${e.title} ${e.detail ?? ''} ${e.project_name ?? ''}`).includes(n)) return false
      return true
    })
  }, [data, q, projectFilter])

  const days = useMemo(() => groupByDay(entries), [entries])
  const reports = useMemo(() => new Map((data?.reports ?? []).map((r) => [r.id, r])), [data])
  const totalHours = useMemo(() => entries.reduce((s, e) => s + (e.hours ?? 0), 0), [entries])
  const projectOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of data?.projects ?? []) map.set(p.id, p.name)
    for (const e of data?.entries ?? []) if (e.project_id && e.project_name) map.set(e.project_id, e.project_name)
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [data])

  const canWrite = Boolean(data?.scope_user)
  const remove = async (e: WorkEntry) => {
    if (!window.confirm(`¿Borrar "${e.title}"?`)) return
    const res = await fetch(`/api/trabajo/${e.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      window.alert(d.error || 'No se pudo borrar')
      return
    }
    void load()
  }

  const selectClass = (active: boolean) =>
    cn(
      'h-10 min-w-0 rounded-lg border bg-white px-2.5 text-sm outline-none transition-colors focus:border-gray-400',
      active ? 'border-gray-900 font-medium text-gray-900' : 'border-gray-200 text-gray-600'
    )

  return (
    <div className="min-w-0 space-y-4">
      {/* Una sola fila: buscar, proyecto, periodo, vista y registrar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm lg:flex-nowrap">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en el trabajo…"
            className={cn(
              'h-10 w-full rounded-lg border bg-white pl-9 pr-8 text-sm outline-none placeholder:text-gray-400 focus:border-gray-400',
              q.trim() ? 'border-gray-900' : 'border-gray-200'
            )}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
              title="Borrar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className={cn(selectClass(projectFilter !== 'all'), 'w-full sm:w-48')}
          title="Proyecto"
        >
          <option value="all">Todos los proyectos</option>
          <option value="none">Sin proyecto</option>
          {projectOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        {view === 'historia' ? (
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className={cn(selectClass(false), 'w-full sm:w-44')}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        ) : (
          <div className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-white">
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="px-2 text-gray-500 hover:text-gray-900" title="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="w-32 text-center text-sm font-medium capitalize text-gray-800">
              {format(parseISO(`${month}-01`), 'MMMM yyyy', { locale: es })}
            </span>
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              disabled={month >= today.slice(0, 7)}
              className="px-2 text-gray-500 hover:text-gray-900 disabled:opacity-30"
              title="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="inline-flex h-10 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {(
              [
                { id: 'historia', label: 'Historia', icon: History },
                { id: 'calendario', label: 'Calendario', icon: CalendarDays },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setView(t.id)}
                title={t.label}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
                  view === t.id ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                )}
              >
                <t.icon className="h-4 w-4" />
                <span className="hidden md:inline">{t.label}</span>
              </button>
            ))}
          </div>
          {canWrite && (
            <Button
              type="button"
              className="h-10 rounded-lg"
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Registrar trabajo</span>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          <p className="px-1 text-xs text-gray-500">
            {entries.length} {entries.length === 1 ? 'trabajo' : 'trabajos'} en {days.length}{' '}
            {days.length === 1 ? 'día' : 'días'}
            {totalHours > 0 && <> · {hoursLabel(totalHours)}</>}
            {loading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
          </p>

          {view === 'calendario' ? (
            <WorkCalendar
              month={month}
              today={today}
              days={days}
              selected={selectedDay}
              onSelect={(d) => setSelectedDay((cur) => (cur === d ? null : d))}
            />
          ) : null}

          {(view === 'historia' ? days : days.filter((d) => d.date === selectedDay)).map((d) => (
            <DayCard
              key={d.date}
              day={d}
              reports={reports}
              canWrite={canWrite}
              onEdit={(e) => {
                setEditing(e)
                setDialogOpen(true)
              }}
              onRemove={remove}
              onOpenReport={setReport}
            />
          ))}

          {view === 'historia' && days.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
              {data?.entries.length ? 'Nada con estos filtros.' : 'Todavía no hay trabajo apuntado en este periodo.'}
              {canWrite && !data?.entries.length && (
                <p className="mt-1 text-xs text-gray-400">
                  Pulsa «Registrar trabajo» o cuéntaselo al agente de WhatsApp (por texto o con un audio).
                </p>
              )}
            </div>
          )}
          {view === 'calendario' && !selectedDay && days.length > 0 && (
            <p className="px-1 text-xs text-gray-400">Pulsa un día para ver lo que se hizo.</p>
          )}
        </>
      )}

      {data && (
        <WorkLogDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          entry={editing}
          today={today}
          projects={data.projects}
          userId={scopeUserId}
          onSaved={() => void load()}
        />
      )}

      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent className="max-h-[85vh] w-[min(96vw,44rem)] max-w-none overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle>Lo que contó</DialogTitle>
            <DialogDescription>
              {report?.source === 'whatsapp' ? 'Mensaje o audio de WhatsApp' : 'Texto escrito en el CRM'}
              {report ? ` · ${format(parseISO(report.created_at), "d MMM yyyy, HH:mm", { locale: es })}` : ''}
            </DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-800">
            {report?.raw_text}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DayCard({
  day,
  reports,
  canWrite,
  onEdit,
  onRemove,
  onOpenReport,
}: {
  day: WorkDay
  reports: Map<string, WorkReport>
  canWrite: boolean
  onEdit: (e: WorkEntry) => void
  onRemove: (e: WorkEntry) => void
  onOpenReport: (r: WorkReport) => void
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-900">{dayLabel(day.date)}</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span>
            {day.entries.length} {day.entries.length === 1 ? 'trabajo' : 'trabajos'}
          </span>
          {day.hours > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {hoursLabel(day.hours)}
            </span>
          )}
          {day.reportIds.map((id) => {
            const r = reports.get(id)
            return r ? (
              <button
                key={id}
                type="button"
                onClick={() => onOpenReport(r)}
                className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline"
              >
                <MessageSquareText className="h-3 w-3" />
                {r.source === 'whatsapp' ? 'Mensaje original' : 'Texto original'}
              </button>
            ) : null
          })}
        </div>
      </header>
      <ul className="divide-y divide-gray-100">
        {day.entries.map((e) => (
          <li key={e.id} className="group flex items-start gap-3 px-4 py-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-gray-900 [overflow-wrap:anywhere]">{e.title}</p>
              {e.detail && (
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-500 [overflow-wrap:anywhere]">
                  {e.detail}
                </p>
              )}
              {(e.project_name || e.hours) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {e.project_name && (
                    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      <FolderKanban className="h-3 w-3 shrink-0" />
                      <span className="truncate">{e.project_name}</span>
                    </span>
                  )}
                  {e.hours ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                      <Clock className="h-3 w-3" />
                      {hoursLabel(e.hours)}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
            {canWrite && (
              <div className="flex shrink-0 gap-1 sm:opacity-0 sm:group-hover:opacity-100">
                <button type="button" onClick={() => onEdit(e)} className="p-1 text-gray-400 hover:text-gray-900" title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onRemove(e)} className="p-1 text-gray-400 hover:text-red-600" title="Borrar">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function WorkCalendar({
  month,
  today,
  days,
  selected,
  onSelect,
}: {
  month: string
  today: string
  days: WorkDay[]
  selected: string | null
  onSelect: (day: string) => void
}) {
  const byDay = new Map(days.map((d) => [d.date, d]))
  const first = `${month}-01`
  const firstDow = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7 // lunes = 0
  const { to } = monthRange(month)
  const cells: (string | null)[] = Array.from({ length: firstDow }, () => null)
  for (let d = first; d <= to; d = addDays(d, 1)) cells.push(d)
  while (cells.length % 7) cells.push(null)
  const maxCount = Math.max(1, ...days.map((d) => d.entries.length))

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/60">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="min-h-[76px] border-b border-r border-gray-100 bg-gray-50/30" />
          const info = byDay.get(d)
          const level = info ? Math.ceil((info.entries.length / maxCount) * 3) : 0
          const future = d > today
          return (
            <button
              key={d}
              type="button"
              disabled={!info}
              onClick={() => onSelect(d)}
              className={cn(
                'flex min-h-[76px] flex-col items-start gap-1 border-b border-r border-gray-100 p-2 text-left transition-colors',
                info ? 'hover:ring-2 hover:ring-inset hover:ring-gray-300' : 'cursor-default',
                level === 1 && 'bg-emerald-50',
                level === 2 && 'bg-emerald-100',
                level === 3 && 'bg-emerald-200/70',
                selected === d && 'ring-2 ring-inset ring-gray-900',
                future && 'opacity-40'
              )}
            >
              <span className={cn('text-xs font-medium', d === today ? 'rounded-full bg-gray-900 px-1.5 text-white' : 'text-gray-500')}>
                {Number(d.slice(8))}
              </span>
              {info && (
                <span className="text-[11px] leading-tight text-emerald-900">
                  <span className="font-semibold">{info.entries.length}</span> {info.entries.length === 1 ? 'trabajo' : 'trabajos'}
                  {info.hours > 0 && <span className="block text-emerald-800/80">{hoursLabel(info.hours)}</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
