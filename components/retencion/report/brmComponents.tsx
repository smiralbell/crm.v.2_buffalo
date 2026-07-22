import type { ReactNode } from 'react'
import { SEMAFORO_LABEL, type SemaforoLevel } from './buffaloTheme'

export { BuffaloChart } from './charts/BuffaloChart'

/* Utilidades ------------------------------------------------------------- */

type AnyProps = Record<string, unknown> & { children?: ReactNode }

function str(v: unknown): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  return s.length ? s : undefined
}

function trendClass(trend: unknown): 'up' | 'down' | 'flat' {
  const t = str(trend)?.toLowerCase()
  if (t === 'up') return 'up'
  if (t === 'down') return 'down'
  return 'flat'
}

function trendPrefix(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up') return '\u25B2 ' // ▲
  if (trend === 'down') return '\u25BC ' // ▼
  return '\u2013 ' // –
}

/* Semáforo --------------------------------------------------------------- */

export function SemaforoPill({ level }: { level: SemaforoLevel }) {
  return <span className={`bf-semaforo ${level}`}>{SEMAFORO_LABEL[level]}</span>
}

/* KPI -------------------------------------------------------------------- */

export function KpiGrid({ children }: AnyProps) {
  return <div className="bf-kpi-grid">{children}</div>
}

export function KpiCard(props: AnyProps) {
  const value = str(props.value) ?? '—'
  const label = str(props.label)
  const delta = str(props.delta)
  const hint = str(props.hint)
  const trend = trendClass(props.trend)
  const pending = value.toLowerCase() === 'pendiente'
  return (
    <div className="bf-kpi">
      <div className={`bf-kpi-value${pending ? ' pending' : ''}`}>{value}</div>
      {label && <div className="bf-kpi-label">{label}</div>}
      {!pending && delta && (
        <div className={`bf-kpi-delta ${trend}`}>
          {trendPrefix(trend)}
          {delta}
        </div>
      )}
      {hint && <div className="bf-kpi-hint">{hint}</div>}
    </div>
  )
}

/* Callout ---------------------------------------------------------------- */

export function Callout(props: AnyProps) {
  const type = str(props.type)?.toLowerCase()
  const variant = type === 'warn' ? 'warn' : type === 'down' ? 'down' : 'accent'
  const semaforo = str(props['data-semaforo']) as SemaforoLevel | undefined
  const title = str(props.title) ?? (variant === 'warn' ? 'Atención' : 'Estado')
  return (
    <div className={`bf-callout ${variant === 'accent' ? '' : variant}`.trim()}>
      <div className="bf-callout-body">
        <p className="bf-callout-label">
          {title}
          {semaforo && <SemaforoPill level={semaforo} />}
        </p>
        {props.children}
      </div>
    </div>
  )
}

/* Highlight -------------------------------------------------------------- */

export function Highlight({ children }: AnyProps) {
  return <div className="bf-highlight">{children}</div>
}

/* ROI -------------------------------------------------------------------- */

export function Roi(props: AnyProps) {
  const cards: Array<{ key: string; label: string }> = [
    { key: 'baseline', label: 'Coste manual' },
    { key: 'buffalo', label: 'Coste Buffalo' },
    { key: 'saving', label: 'Ahorro / mes' },
    { key: 'payback', label: 'Payback' },
    { key: 'roi', label: 'ROI anual' },
  ]
  return (
    <div className="bf-roi">
      {cards.map((c) => {
        const v = str(props[c.key]) ?? '—'
        const pending = v.toLowerCase() === 'pendiente'
        return (
          <div className="bf-kpi" key={c.key}>
            <div className={`bf-kpi-value${pending ? ' pending' : ''}`}>{v}</div>
            <div className="bf-kpi-label">{c.label}</div>
          </div>
        )
      })}
    </div>
  )
}

/* Checklist -------------------------------------------------------------- */

export function Checklist({ children }: AnyProps) {
  return <div className="bf-checklist">{children}</div>
}

export function ChecklistItem(props: AnyProps) {
  const checked = str(props['data-checked']) === 'true'
  return (
    <div className="bf-checklist-item">
      <span className={`bf-check ${checked ? 'on' : 'off'}`}>{checked ? '\u2713' : ''}</span>
      <span className="bf-checklist-text">{props.children}</span>
    </div>
  )
}
