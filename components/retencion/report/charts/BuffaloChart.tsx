import type { ReactNode } from 'react'
import { stripEmojis } from '../buffaloTheme'

/**
 * Gráficos SVG puros (sin canvas) para el informe Buffalo. Imprimen nítidos con
 * Chrome print. Colores derivados de la paleta activa (variables --bf-*).
 * Tipos: line · area · bar · barcompare · donut · pie. Fallback: tabla.
 */

const CHART_COLORS = [
  'var(--bf-accent)',
  '#0d211b',
  '#7fc8b0',
  '#c98a1e',
  '#5a7d70',
  '#a7d8c8',
  '#335566',
  '#c0492f',
]

type ChartData = { columns: string[]; rows: string[][] }

type Props = Record<string, unknown> & { children?: ReactNode }

/* -------- parsing -------- */

function parseEsNumber(raw: string): number {
  const t = (raw || '').trim().replace(/\s/g, '')
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'))
  if (/^-?\d+,\d+$/.test(t)) return Number(t.replace(',', '.'))
  const n = Number(t.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function readData(props: Props): ChartData | null {
  const raw = props['data-chart']
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw) as ChartData
    if (!Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)) return null
    return parsed
  } catch {
    return null
  }
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

function fmt(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

/* -------- fallback table -------- */

function FallbackTable({ data }: { data: ChartData }) {
  return (
    <table>
      <thead>
        <tr>
          {data.columns.map((c, i) => (
            <th key={i}>{stripEmojis(c)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{stripEmojis(c)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* -------- line / area -------- */

function LineArea({ data, area }: { data: ChartData; area: boolean }) {
  const W = 560
  const H = 210
  const pad = { t: 14, r: 16, b: 28, l: 38 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const cats = data.rows.map((r) => stripEmojis(r[0] ?? ''))
  const seriesNames = data.columns.slice(1)
  const series = seriesNames.map((_, j) => data.rows.map((r) => parseEsNumber(r[j + 1] ?? '0')))
  const n = cats.length
  const maxV = niceMax(Math.max(1, ...series.flat()))
  const xAt = (i: number) => (n <= 1 ? pad.l + iw / 2 : pad.l + (i / (n - 1)) * iw)
  const yAt = (v: number) => pad.t + (1 - v / maxV) * ih

  const gridY = [0, 0.25, 0.5, 0.75, 1]
  const xEvery = Math.max(1, Math.ceil(n / 12))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block' }}>
      {gridY.map((g, i) => {
        const y = pad.t + g * ih
        const val = maxV * (1 - g)
        return (
          <g key={i}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="var(--bf-border)" strokeWidth={1} />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize={9} fill="var(--bf-muted)">
              {fmt(val)}
            </text>
          </g>
        )
      })}
      {series.map((vals, si) => {
        const color = CHART_COLORS[si % CHART_COLORS.length]
        const pts = vals.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ')
        const areaPath = `M ${xAt(0)},${yAt(0)} L ${vals
          .map((v, i) => `${xAt(i)},${yAt(v)}`)
          .join(' L ')} L ${xAt(n - 1)},${yAt(0)} Z`
        return (
          <g key={si}>
            {area && si === 0 && <path d={areaPath} fill="var(--bf-accent)" fillOpacity={0.12} />}
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
            {vals.map((v, i) => (
              <circle key={i} cx={xAt(i)} cy={yAt(v)} r={2} fill={color} />
            ))}
          </g>
        )
      })}
      {cats.map((c, i) =>
        i % xEvery === 0 ? (
          <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--bf-muted)">
            {c}
          </text>
        ) : null
      )}
    </svg>
  )
}

/* -------- bar / barcompare -------- */

function Bars({ data, compare }: { data: ChartData; compare: boolean }) {
  const W = 560
  const H = 220
  const pad = { t: 18, r: 16, b: 34, l: 38 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const cats = data.rows.map((r) => stripEmojis(r[0] ?? ''))
  const seriesNames = data.columns.slice(1)
  const series = seriesNames.map((_, j) => data.rows.map((r) => parseEsNumber(r[j + 1] ?? '0')))
  const nSeries = compare ? Math.min(series.length, 2) : 1
  const n = cats.length
  const maxV = niceMax(Math.max(1, ...series.slice(0, nSeries).flat()))
  const band = iw / Math.max(1, n)
  const groupW = band * 0.7
  const barW = groupW / nSeries
  const yAt = (v: number) => pad.t + (1 - v / maxV) * ih
  const colorFor = (si: number) =>
    compare && si === 1 ? 'var(--bf-muted)' : CHART_COLORS[si % CHART_COLORS.length]
  const xEvery = Math.max(1, Math.ceil(n / 14))

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => {
          const y = pad.t + g * ih
          return (
            <line key={i} x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="var(--bf-border)" strokeWidth={1} />
          )
        })}
        {cats.map((c, i) => {
          const gx = pad.l + i * band + (band - groupW) / 2
          return (
            <g key={i}>
              {Array.from({ length: nSeries }).map((_, si) => {
                const v = series[si]?.[i] ?? 0
                const h = (v / maxV) * ih
                const x = gx + si * barW
                const y = pad.t + ih - h
                return (
                  <g key={si}>
                    <rect x={x} y={y} width={Math.max(1, barW - 2)} height={Math.max(0, h)} rx={3} fill={colorFor(si)} />
                    {nSeries === 1 && (
                      <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={9} fill="var(--bf-muted)">
                        {fmt(v)}
                      </text>
                    )}
                  </g>
                )
              })}
              {i % xEvery === 0 && (
                <text x={gx + groupW / 2} y={H - 12} textAnchor="middle" fontSize={9} fill="var(--bf-muted)">
                  {c.length > 10 ? `${c.slice(0, 9)}…` : c}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {compare && (
        <div className="bf-chart-legend">
          {seriesNames.slice(0, 2).map((s, si) => (
            <span key={si} className="bf-chart-legend-item">
              <span className="bf-chart-swatch" style={{ background: colorFor(si) }} />
              {stripEmojis(s)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* -------- donut / pie -------- */

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  const a = ((angle - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function arcPath(cx: number, cy: number, r: number, rInner: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, r, end)
  const [x2, y2] = polar(cx, cy, r, start)
  const large = end - start <= 180 ? 0 : 1
  if (rInner > 0) {
    const [x3, y3] = polar(cx, cy, rInner, start)
    const [x4, y4] = polar(cx, cy, rInner, end)
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 1 ${x4} ${y4} Z`
  }
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2} Z`
}

function DonutPie({ data, hole }: { data: ChartData; hole: boolean }) {
  const raw = data.rows.map((r) => ({
    label: stripEmojis(r[0] ?? ''),
    value: parseEsNumber(r[1] ?? '0'),
  }))
  // Máx 8 categorías, resto agrupado en "Otros"
  const sorted = [...raw].sort((a, b) => b.value - a.value)
  let items = sorted
  if (sorted.length > 8) {
    const top = sorted.slice(0, 7)
    const rest = sorted.slice(7).reduce((a, s) => a + s.value, 0)
    items = [...top, { label: 'Otros', value: rest }]
  }
  const total = items.reduce((a, s) => a + s.value, 0) || 1
  const cx = 100
  const cy = 100
  const r = 82
  const rInner = hole ? 50 : 0

  let angle = 0
  const segs = items.map((it, i) => {
    const sweep = (it.value / total) * 360
    const path = arcPath(cx, cy, r, rInner, angle, angle + Math.max(0.01, sweep))
    angle += sweep
    return { path, color: CHART_COLORS[i % CHART_COLORS.length], ...it }
  })

  return (
    <div className="bf-chart-donut">
      <svg viewBox="0 0 200 200" width="200" height="200" role="img" style={{ flexShrink: 0 }}>
        {segs.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="var(--bf-bg)" strokeWidth={1} />
        ))}
        {hole && (
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--bf-heading)">
            {fmt(total)}
          </text>
        )}
      </svg>
      <div className="bf-chart-legend bf-chart-legend-col">
        {segs.map((s, i) => (
          <span key={i} className="bf-chart-legend-item">
            <span className="bf-chart-swatch" style={{ background: s.color }} />
            {s.label} — {fmt(s.value)} ({fmt((s.value / total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  )
}

/* -------- main -------- */

export function BuffaloChart(props: Props) {
  const type = String(props.type || 'bar').toLowerCase()
  const title = props.title ? stripEmojis(String(props.title)) : ''
  const data = readData(props)

  let body: ReactNode
  if (!data || data.rows.length === 0) {
    body = data ? <FallbackTable data={data} /> : <p className="bf-chart-empty">Sin datos para el gráfico.</p>
  } else if (type === 'line') body = <LineArea data={data} area={false} />
  else if (type === 'area') body = <LineArea data={data} area />
  else if (type === 'bar') body = <Bars data={data} compare={false} />
  else if (type === 'barcompare') body = <Bars data={data} compare />
  else if (type === 'donut') body = <DonutPie data={data} hole />
  else if (type === 'pie') body = <DonutPie data={data} hole={false} />
  else body = <FallbackTable data={data} />

  return (
    <figure className="bf-chart">
      {title && <figcaption className="bf-chart-title">{title}</figcaption>}
      {body}
    </figure>
  )
}

export default BuffaloChart
