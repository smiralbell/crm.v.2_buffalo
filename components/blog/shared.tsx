import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { PostStatus, ThemeCode } from '@/lib/blog/types'

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

export const STATUS: Record<PostStatus, { label: string; cls: string }> = {
  idea: { label: 'Idea', cls: 'bg-gray-100 text-gray-700' },
  brief: { label: 'Brief', cls: 'bg-sky-50 text-sky-700' },
  borrador: { label: 'Borrador', cls: 'bg-amber-50 text-amber-800' },
  revision: { label: 'En revisión', cls: 'bg-violet-50 text-violet-700' },
  aprobado: { label: 'Aprobado', cls: 'bg-emerald-50 text-emerald-700' },
  publicado: { label: 'Publicado', cls: 'bg-emerald-600 text-white' },
  rechazado: { label: 'Rechazado', cls: 'bg-red-50 text-red-700' },
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

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', className)}>{children}</span>
}

export function StatusPill({ status }: { status: PostStatus }) {
  return <Pill className={STATUS[status].cls}>{STATUS[status].label}</Pill>
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-gray-200 bg-white p-5 shadow-sm', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-500">{hint}</span>}
    </label>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const cls = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-800',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone]
  return <div className={cn('rounded-xl border px-4 py-3 text-sm', cls)}>{children}</div>
}

export const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30'
