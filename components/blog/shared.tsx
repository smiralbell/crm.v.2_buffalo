import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { PostKind, PostStatus, ThemeCode } from '@/lib/blog/types'

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch('/api/blog/' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
  return data as T
}

/** Colores de estado: los mismos tonos suaves que usa el resto del CRM. */
export const STATUS: Record<PostStatus, { label: string; cls: string; dot: string }> = {
  idea: { label: 'Idea', cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  brief: { label: 'Brief', cls: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  borrador: { label: 'Borrador', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  revision: { label: 'En revisión', cls: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  aprobado: { label: 'Aprobado', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  publicado: { label: 'Publicado', cls: 'bg-gray-900 text-white', dot: 'bg-gray-900' },
  rechazado: { label: 'Rechazado', cls: 'bg-red-50 text-red-600', dot: 'bg-red-500' },
}

export const THEME_NAMES: Record<ThemeCode, string> = {
  A: 'Atención y captación',
  B: 'Antes de automatizar',
  C: 'Voz y WhatsApp',
  D: 'Procesos y software',
  E: 'Riesgo y ley',
  F: 'Precio y decisión',
  G: 'Formación',
  S: 'Sectores',
  N: 'Actualidad',
}

/** Un color por categoría para reconocerlas de un vistazo en el tablero y el calendario. */
export const THEME_COLOR: Record<ThemeCode, string> = {
  A: 'bg-sky-500',
  B: 'bg-amber-500',
  C: 'bg-violet-500',
  D: 'bg-teal-500',
  E: 'bg-rose-500',
  F: 'bg-indigo-500',
  G: 'bg-lime-500',
  S: 'bg-cyan-500',
  N: 'bg-orange-500',
}

export const KIND_NAMES: Record<PostKind, string> = {
  pilar: 'Guía pilar',
  articulo: 'Artículo',
  sector: 'Sector',
  estudio: 'Estudio',
  actualidad: 'Actualidad',
}

export const fmt = (iso?: string, withTime = true) =>
  iso
    ? new Date(iso).toLocaleString('es-ES', {
        weekday: withTime ? 'short' : undefined,
        day: 'numeric',
        month: 'short',
        hour: withTime ? '2-digit' : undefined,
        minute: withTime ? '2-digit' : undefined,
        timeZone: 'Europe/Madrid',
      })
    : '—'

export const time = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium', className)}>{children}</span>
}

export function StatusPill({ status }: { status: PostStatus }) {
  return <Pill className={STATUS[status].cls}>{STATUS[status].label}</Pill>
}

export function ThemePill({ theme }: { theme: ThemeCode }) {
  return (
    <Pill className="bg-gray-100 text-gray-700">
      <span className={cn('h-1.5 w-1.5 rounded-full', THEME_COLOR[theme])} />
      {THEME_NAMES[theme]}
    </Pill>
  )
}

/** La «i» de información: al pasar el ratón (o tocarla en el móvil) explica qué hace cada cosa. */
export function Info({ children, className, side = 'top' }: { children: ReactNode; className?: string; side?: 'top' | 'bottom' }) {
  return (
    <span className={cn('group/info relative inline-flex align-middle', className)} tabIndex={0}>
      <span className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold leading-none text-gray-400 transition group-hover/info:border-gray-900 group-hover/info:text-gray-900 group-focus/info:border-gray-900 group-focus/info:text-gray-900">
        i
      </span>
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 w-72 -translate-x-1/2 rounded-xl bg-gray-900 px-3 py-2.5 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-white opacity-0 shadow-lg transition group-hover/info:opacity-100 group-focus/info:opacity-100',
          side === 'top' ? 'bottom-6' : 'top-6'
        )}
      >
        {children}
      </span>
    </span>
  )
}

/** Título con su «i». */
export function Title({ children, info, className }: { children: ReactNode; info?: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {children}
      {info && <Info side="bottom">{info}</Info>}
    </span>
  )
}

export function Panel({ title, info, action, children, className, center }: { title?: ReactNode; info?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; center?: boolean }) {
  return (
    <section className={cn('rounded-2xl border border-gray-200 bg-white p-5 shadow-sm', className)}>
      {(title || action) && (
        <div className={cn('mb-4 flex flex-wrap items-center gap-3', center ? 'flex-col justify-center text-center' : 'justify-between')}>
          {title && <h2 className="text-sm font-semibold text-gray-900"><Title info={info}>{title}</Title></h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, sub, info }: { label: string; value: ReactNode; sub?: ReactNode; info?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white px-5 py-4 text-center shadow-sm">
      <p className="text-xs font-medium text-gray-500"><Title info={info}>{label}</Title></p>
      <p className="mt-1 text-2xl font-semibold leading-tight text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

export function Field({ label, info, hint, children }: { label: string; info?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="block space-y-1.5">
      {label && <span className="block text-xs font-medium text-gray-600"><Title info={info}>{label}</Title></span>}
      {children}
      {hint && <span className="block text-[11px] leading-snug text-gray-400">{hint}</span>}
    </div>
  )
}

/** Ventana emergente centrada, con el mismo aspecto que los diálogos del CRM. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className={cn('max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl', wide ? 'max-w-3xl' : 'max-w-xl')} onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const cls = {
    info: 'border-gray-200 bg-gray-50 text-gray-700',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-800',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }[tone]
  return <div className={cn('rounded-2xl border px-4 py-3 text-sm', cls)}>{children}</div>
}

/** Botones de segmento (filtros, vistas). Mismo aspecto que los selectores del CRM. */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { id: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition', value === o.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const inputCls =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200'

export const chipCls = (on: boolean) =>
  cn('rounded-full border px-3 py-1.5 text-sm transition', on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900')
