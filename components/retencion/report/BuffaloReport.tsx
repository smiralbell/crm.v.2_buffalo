'use client'

import {
  Fragment,
  createContext,
  forwardRef,
  useContext,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
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
  Signatures,
  Bubble,
  Cards,
  Card,
  StyledTable,
} from './brmComponents'
import { NumBadge } from './bfBadges'
import { paletteToCssVars, stripEmojis, type BuffaloThemeName } from './buffaloTheme'
import { BUFFALO_REPORT_CSS } from './buffaloReportCss'
import { splitProposalPageChunks } from '@/lib/onboarding/proposal-brm'

export type BuffaloReportData = {
  title: string
  content: string
  audience: 'client' | 'buffalo'
  year: number
  month: number
  meta?: unknown
}

export type BuffaloDocCoverMeta = { label: string; value: string }

export type BuffaloDocCover = {
  eyebrow?: string
  subtitle?: string
  meta?: BuffaloDocCoverMeta[]
}

type Props = {
  report: BuffaloReportData
  client?: { name?: string | null; company?: string | null }
  theme?: BuffaloThemeName
  logo?: 'logo1' | 'logo2'
  className?: string
  id?: string
  /** 'proposal' centra la portada y usa meta personalizada (plantilla documentos Buffalo). */
  kind?: 'report' | 'proposal'
  cover?: BuffaloDocCover
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
  'bf-signatures': Signatures,
  'bf-bubble': Bubble,
  'bf-cards': Cards,
  'bf-card': Card,
  'bf-table': BfTableRoot,
  table: MarkdownTable,
}

const TableWrapCtx = createContext(false)

function BfTableRoot(props: Record<string, unknown> & { children?: ReactNode }) {
  return (
    <TableWrapCtx.Provider value={true}>
      <StyledTable {...props} />
    </TableWrapCtx.Provider>
  )
}

function MarkdownTable(props: Record<string, unknown> & { children?: ReactNode }) {
  const insideStyled = useContext(TableWrapCtx)
  if (insideStyled) return <table>{props.children}</table>
  return (
    <div className="bf-table-wrap default" data-brm="table">
      <table>{props.children}</table>
    </div>
  )
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
  const [srcIndex, setSrcIndex] = useState(0)
  const sources = ['/buffalo-docs/assets/logo1-trim.png', '/retencion/logo1-trim.png']
  const cls = variant === 'cover' ? 'bf-cover-logo' : 'bf-header-logo'
  if (srcIndex >= sources.length) {
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
      src={sources[srcIndex]}
      alt="Buffalo AI"
      className={cls}
      onError={() => setSrcIndex((i) => i + 1)}
    />
  )
}

function PageHeader({ title }: { title: string }) {
  return (
    <div className="bf-flow-header">
      <BrandLogo variant="header" />
      <span className="bf-header-title">{title}</span>
    </div>
  )
}

function PageFooter({
  left,
  pageLabel,
}: {
  left: string
  pageLabel: string
}) {
  return (
    <div className="bf-flow-footer">
      <span>{left}</span>
      <span>{pageLabel}</span>
    </div>
  )
}

const BuffaloReport = forwardRef<HTMLDivElement, Props>(function BuffaloReport(
  {
    report,
    client,
    theme = 'light',
    className,
    id = 'buffalo-report',
    kind = 'report',
    cover,
  },
  ref
) {
  const { sections } = useMemo(() => splitSections(report.content), [report.content])
  const styleVars = useMemo(() => paletteToCssVars(theme), [theme])

  const per = periodLabel(report.month, report.year)
  const clientName = stripEmojis(client?.company || client?.name || 'Cliente')
  const defaultEyebrow =
    report.audience === 'client'
      ? 'Informe de mantenimiento'
      : 'Informe interno de retención'
  const confidencialidad = report.audience === 'client' ? 'Cliente' : 'Uso interno'
  const docTitle = cleanTitle(report.title) || (kind === 'proposal' ? 'Propuesta' : `Informe ${per}`)
  const eyebrow = cover?.eyebrow || (kind === 'proposal' ? 'Propuesta de proyecto' : defaultEyebrow)
  const subtitle =
    cover?.subtitle ||
    (kind === 'proposal' ? `${clientName} · Buffalo AI` : `${clientName} · ${per}`)
  const metaItems: BuffaloDocCoverMeta[] =
    cover?.meta && cover.meta.length > 0
      ? cover.meta
      : kind === 'proposal'
        ? [
            { label: 'Cliente', value: clientName },
            { label: 'Proveedor', value: 'Buffalo AI' },
            { label: 'Fecha', value: per },
            { label: 'Validez', value: '30 días naturales' },
          ]
        : [
            { label: 'Cliente', value: clientName },
            { label: 'Periodo', value: per },
            { label: 'Autor', value: 'Equipo Buffalo' },
            { label: 'Confidencialidad', value: confidencialidad },
          ]

  const pad = (n: number) => String(n).padStart(2, '0')
  const isProposal = kind === 'proposal'
  const headerTitle = isProposal
    ? `Propuesta · ${clientName} × Buffalo AI`
    : docTitle
  const footerLeft = isProposal ? 'Documento confidencial' : 'Confidencial · Uso interno'

  const proposalPages = useMemo(() => {
    if (!isProposal) return [] as { sections: Section[] }[]
    const chunks = splitProposalPageChunks(report.content)
    if (chunks.length === 0) return [{ sections: [] as Section[] }]
    let counter = 0
    return chunks.map((chunk) => {
      const { sections: raw } = splitSections(chunk)
      const sections = raw.map((s) => {
        if (s.number == null) return s
        counter += 1
        return { ...s, number: counter }
      })
      return { sections }
    })
  }, [isProposal, report.content])

  const totalPages = 1 + Math.max(proposalPages.length, 1)

  const renderSection = (s: Section, key: string | number) => (
    <Fragment key={key}>
      {(s.title || s.number != null) && (
        <h2 className="bf-h2" data-block="section">
          {s.number != null && <NumBadge value={s.number} />}
          {s.title}
        </h2>
      )}
      <BuffaloMarkdown body={s.body} />
    </Fragment>
  )

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
        data-kind={kind}
      >
        {/* Portada: bloque centrado (logo + título + meta), como la plantilla Buffalo */}
        <section className="buffalo-cover">
          <div className="bf-cover-stack">
            <BrandLogo variant="cover" />
            <p className="bf-eyebrow">{eyebrow}</p>
            <h1 className="bf-h1 buffalo-heading">{docTitle}</h1>
            <div className="bf-rule" />
            {subtitle ? (
              <div className="bf-subtitle">
                {subtitle
                  .split(/\n\s*\n/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p, i) => (
                    <p key={i}>{p.replace(/\n+/g, ' ')}</p>
                  ))}
              </div>
            ) : null}
            <div className="bf-meta-grid">
              {metaItems.map((m) => (
                <div key={`${m.label}-${m.value}`}>
                  <p className="bf-meta-label">{m.label}</p>
                  <p className="bf-meta-value">{m.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {isProposal ? (
          /* Propuesta: una hoja por sección/pagebreak, siempre con header + footer */
          proposalPages.map((page, i) => {
            const pageNum = i + 2
            return (
              <section key={i} className="bf-page" data-page={pageNum}>
                <PageHeader title={headerTitle} />
                <div className="bf-page-body">
                  {page.sections.length === 0 ? (
                    <p>Sin contenido todavía.</p>
                  ) : (
                    page.sections.map((s, j) => renderSection(s, `${i}-${j}`))
                  )}
                </div>
                <PageFooter
                  left={footerLeft}
                  pageLabel={`${pad(pageNum)} / ${pad(totalPages)}`}
                />
              </section>
            )
          })
        ) : (
          <div className="bf-flow">
            <PageHeader title={headerTitle} />
            {sections.map((s, i) => renderSection(s, i))}
            <PageFooter left={footerLeft} pageLabel="Buffalo AI · agenciabuffalo.es" />
          </div>
        )}
      </div>
    </>
  )
})

export default BuffaloReport
