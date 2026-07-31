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

/* Bubble ----------------------------------------------------------------- */

export function Bubble(props: AnyProps) {
  const tone = (str(props.tone) || str(props.type) || 'accent').toLowerCase()
  const variant =
    tone === 'warn' || tone === 'soft' || tone === 'muted' || tone === 'accent' ? tone : 'accent'
  const title = str(props.title)
  return (
    <div className={`bf-bubble ${variant}`} data-brm="bubble">
      {title ? <p className="bf-bubble-title">{title}</p> : null}
      <div className="bf-bubble-body">{props.children}</div>
    </div>
  )
}

/* Cards ------------------------------------------------------------------ */

export function Cards(props: AnyProps) {
  const cols = str(props.columns) || str(props.cols) || '2'
  const n = Math.min(4, Math.max(1, parseInt(cols, 10) || 2))
  return (
    <div className={`bf-cards cols-${n}`} data-brm="cards">
      {props.children}
    </div>
  )
}

export function Card(props: AnyProps) {
  const title = str(props.title)
  const badge = str(props.badge)
  const tone = (str(props.tone) || 'default').toLowerCase()
  const cls = tone === 'accent' || tone === 'warn' ? tone : 'default'
  return (
    <div className={`bf-card ${cls}`} data-brm="card">
      {(title || badge) && (
        <div className="bf-card-head">
          {title ? <p className="bf-card-title">{title}</p> : <span />}
          {badge ? <span className="bf-card-badge">{badge}</span> : null}
        </div>
      )}
      <div className="bf-card-body">{props.children}</div>
    </div>
  )
}

/* Table wrap (GFM + :::table) ------------------------------------------- */

export function StyledTable(props: AnyProps) {
  const variant = (str(props.variant) || str(props.type) || 'default').toLowerCase()
  const v =
    variant === 'compare' ||
    variant === 'pricing' ||
    variant === 'striped' ||
    variant === 'cards'
      ? variant
      : 'default'
  return (
    <div className={`bf-table-wrap ${v}`} data-brm="table">
      {props.children}
    </div>
  )
}

/* Signatures (aceptación) ----------------------------------------------- */

export function Signatures(props: AnyProps) {
  const client = str(props.client) || 'Cliente'
  const clientCif = str(props.client_cif) || str(props.client_nif)
  const clientAddress = str(props.client_address)
  const clientPhone = str(props.client_phone)
  const provider = str(props.provider) || 'Buffalo IA Global Digital Solutions, S.L.'
  const providerCif = str(props.provider_cif) || 'B22944599'
  const providerAddress =
    str(props.provider_address) || 'C/ Provença 474, esc B, entr. 2ª, 08025 Barcelona'
  const providerPhone = str(props.provider_phone) || '658 571 087'

  return (
    <div className="bf-signatures">
      <div className="bf-sig-parties">
        <div className="bf-sig-card">
          <p className="bf-sig-label">Cliente</p>
          <p className="bf-sig-name">{client}</p>
          {clientCif ? <p className="bf-sig-meta">NIF / CIF · {clientCif}</p> : null}
          {clientAddress ? <p className="bf-sig-meta">{clientAddress}</p> : null}
          {clientPhone ? <p className="bf-sig-meta">{clientPhone}</p> : null}
        </div>
        <div className="bf-sig-card">
          <p className="bf-sig-label">Proveedor</p>
          <p className="bf-sig-name">{provider}</p>
          <p className="bf-sig-meta">CIF · {providerCif}</p>
          <p className="bf-sig-meta">{providerAddress}</p>
          <p className="bf-sig-meta">{providerPhone}</p>
        </div>
      </div>
      <div className="bf-sig-lines">
        <div className="bf-sig-block">
          <p className="bf-sig-label">Por el cliente</p>
          <div className="bf-sig-row">
            <span>Fecha</span>
            <span className="bf-sig-line" />
          </div>
          <div className="bf-sig-row tall">
            <span>Firma</span>
            <span className="bf-sig-line" />
          </div>
        </div>
        <div className="bf-sig-block">
          <p className="bf-sig-label">Por Buffalo AI</p>
          <div className="bf-sig-row">
            <span>Fecha</span>
            <span className="bf-sig-line" />
          </div>
          <div className="bf-sig-row tall">
            <span>Firma</span>
            <span className="bf-sig-line" />
          </div>
        </div>
      </div>
    </div>
  )
}
