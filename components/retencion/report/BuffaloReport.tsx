'use client'

import { Fragment, forwardRef, useMemo, useState, type ComponentType } from 'react'
import Head from 'next/head'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkDirective from 'remark-directive'
import { remarkBuffaloDirectives } from './remarkBuffaloDirectives'
import {
  KpiGrid,
  KpiCard,
  Callout,
  Highlight,
  Roi,
  Checklist,
  ChecklistItem,
  BuffaloChart,
} from './brmComponents'
import { paletteToCssVars, stripEmojis, type BuffaloThemeName } from './buffaloTheme'
import { BUFFALO_REPORT_CSS } from './buffaloReportCss'

export type BuffaloReportData = {
  title: string
  content: string
  audience: 'client' | 'buffalo'
  year: number
  month: number
  meta?: unknown
}

type Props = {
  report: BuffaloReportData
  client?: { name?: string | null; company?: string | null }
  theme?: BuffaloThemeName
  logo?: 'logo1' | 'logo2'
  className?: string
  id?: string
}

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function periodLabel(month: number, year: number): string {
  const name = MONTHS_ES[Math.min(Math.max(month - 1, 0), 11)]
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`
}

/** Quita prefijos tipo "[Buffalo] " / "[cliente] " y emojis del título. */
function cleanTitle(title: string): string {
  return stripEmojis((title || '').replace(/^\[[^\]]+\]\s*/, '')).trim()
}

type Section = { title: string; body: string; number: number | null }

/** Divide el markdown en secciones por cada `## ` (h2). */
function splitSections(content: string): { sections: Section[]; hasDirectives: boolean } {
  const src = (content || '').replace(/\r\n/g, '\n')
  const hasDirectives = /^:::/m.test(src)
  const lines = src.split('\n')
  const chunks: { title: string | null; lines: string[] }[] = []
  let current: { title: string | null; lines: string[] } | null = null

  for (const line of lines) {
    const m = /^##(?!#)\s+(.*)$/.exec(line)
    if (m) {
      if (current) chunks.push(current)
      current = { title: m[1].trim(), lines: [] }
    } else {
      if (!current) current = { title: null, lines: [] }
      current.lines.push(line)
    }
  }
  if (current) chunks.push(current)

  let counter = 0
  const sections: Section[] = chunks
    .filter((c) => c.title !== null || c.lines.join('').trim().length > 0)
    .map((c) => {
      const hasTitle = c.title !== null
      const number = hasTitle ? ++counter : null
      const title = stripEmojis((c.title || '').replace(/^\s*\d+\s*[.)]\s*/, ''))
      return { title, body: c.lines.join('\n').trim(), number }
    })

  if (sections.length === 0) {
    sections.push({ title: '', body: src.trim(), number: null })
  }
  return { sections, hasDirectives }
}

const MD_COMPONENTS: Record<string, ComponentType<Record<string, unknown>>> = {
  'bf-kpi-grid': KpiGrid,
  'bf-kpi': KpiCard,
  'bf-callout': Callout,
  'bf-highlight': Highlight,
  'bf-roi': Roi,
  'bf-checklist': Checklist,
  'bf-checklist-item': ChecklistItem,
  'bf-chart': BuffaloChart,
}

function BuffaloMarkdown({ body }: { body: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkDirective, remarkBuffaloDirectives]}
      components={MD_COMPONENTS as never}
    >
      {body}
    </ReactMarkdown>
  )
}

function BrandLogo({ variant }: { variant: 'cover' | 'header' }) {
  const [failed, setFailed] = useState(false)
  const cls = variant === 'cover' ? 'bf-cover-logo' : 'bf-header-logo'
  if (failed) {
    return (
      <span
        className="buffalo-heading"
        style={{
          fontWeight: 700,
          letterSpacing: '0.04em',
          fontSize: variant === 'cover' ? 20 : 12,
          color: 'var(--bf-heading)',
        }}
      >
        BUFFALO<span style={{ color: 'var(--bf-accent)' }}> AI</span>
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/retencion/logo1-trim.png"
      alt="Buffalo AI"
      className={cls}
      onError={() => setFailed(true)}
    />
  )
}

const BuffaloReport = forwardRef<HTMLDivElement, Props>(function BuffaloReport(
  { report, client, theme = 'light', className, id = 'buffalo-report' },
  ref
) {
  const { sections } = useMemo(() => splitSections(report.content), [report.content])
  const styleVars = useMemo(() => paletteToCssVars(theme), [theme])

  const per = periodLabel(report.month, report.year)
  const clientName = stripEmojis(client?.company || client?.name || 'Cliente')
  const eyebrow =
    report.audience === 'client'
      ? 'Informe de mantenimiento'
      : 'Informe interno de retención'
  const confidencialidad = report.audience === 'client' ? 'Cliente' : 'Uso interno'
  const docTitle = cleanTitle(report.title) || `Informe ${per}`

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: BUFFALO_REPORT_CSS }} />

      <div
        ref={ref}
        id={id}
        className={`buffalo-doc ${className || ''}`.trim()}
        style={styleVars}
        data-theme={theme}
      >
        {/* Portada: una página completa, centrada */}
        <section className="buffalo-cover">
          <BrandLogo variant="cover" />
          <p className="bf-eyebrow">{eyebrow}</p>
          <h1 className="bf-h1 buffalo-heading">{docTitle}</h1>
          <div className="bf-rule" />
          <p className="bf-subtitle">
            {clientName} · {per}
          </p>
          <div className="bf-meta-grid">
            <div>
              <p className="bf-meta-label">Cliente</p>
              <p className="bf-meta-value">{clientName}</p>
            </div>
            <div>
              <p className="bf-meta-label">Periodo</p>
              <p className="bf-meta-value">{per}</p>
            </div>
            <div>
              <p className="bf-meta-label">Autor</p>
              <p className="bf-meta-value">Equipo Buffalo</p>
            </div>
            <div>
              <p className="bf-meta-label">Confidencialidad</p>
              <p className="bf-meta-value">{confidencialidad}</p>
            </div>
          </div>
        </section>

        {/* Contenido: flujo continuo (sin salto por sección, sin altura fija).
            El header/footer de marca se dibuja como texto vectorial al exportar. */}
        <div className="bf-flow">
          {sections.map((s, i) => (
            <Fragment key={i}>
              {(s.title || s.number != null) && (
                <h2 className="bf-h2" data-block="section">
                  {s.number != null && <span className="bf-numbadge">{pad(s.number)}</span>}
                  {s.title}
                </h2>
              )}
              <BuffaloMarkdown body={s.body} />
            </Fragment>
          ))}
        </div>
      </div>
    </>
  )
})

export default BuffaloReport
