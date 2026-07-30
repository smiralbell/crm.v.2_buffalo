'use client'

import type { ReactNode } from 'react'
import {
  CONTRACT_PAGE_PACKS,
  type ContractBlock,
  type ContractClause,
  type ContractServiceDoc,
} from '@/lib/onboarding/contract-annex-types'
import {
  collectDocumentCss,
  downloadTextFile,
  escapeHtml,
  openHtmlPrintWindow,
} from '@/lib/onboarding/download-doc'

function HtmlText({ html, className }: { html: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

function InnerBlocks({
  blocks,
}: {
  blocks: Array<
    | { type: 'p'; html: string }
    | { type: 'sublabel'; html: string }
    | { type: 'list'; style: 'numbered' | 'dash'; items: string[] }
  >
}) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'p') {
          return (
            <p key={i} className="body">
              <HtmlText html={b.html} />
            </p>
          )
        }
        if (b.type === 'sublabel') {
          return (
            <p key={i} className="sublabel">
              <HtmlText html={b.html} />
            </p>
          )
        }
        if (b.style === 'dash') {
          return (
            <ul key={i} className="dash">
              {b.items.map((item, j) => (
                <li key={j}>
                  — <HtmlText html={item.replace(/^—\s*/, '')} />
                </li>
              ))}
            </ul>
          )
        }
        return (
          <ol key={i} className="list">
            {b.items.map((item, j) => (
              <li key={j}>
                <HtmlText html={item} />
              </li>
            ))}
          </ol>
        )
      })}
    </>
  )
}

function Block({ block }: { block: ContractBlock }) {
  if (block.type === 'p') {
    return (
      <p className="body">
        <HtmlText html={block.html} />
      </p>
    )
  }
  if (block.type === 'amount') {
    return (
      <p className="body amount">
        <HtmlText html={block.html} />
      </p>
    )
  }
  if (block.type === 'sublabel') {
    return (
      <p className="sublabel">
        <HtmlText html={block.html} />
      </p>
    )
  }
  if (block.type === 'ins') {
    return (
      <div className="ins">
        <InnerBlocks blocks={block.blocks} />
      </div>
    )
  }
  if (block.style === 'dash') {
    return (
      <ul className="dash">
        {block.items.map((item, i) => (
          <li key={i}>
            — <HtmlText html={item.replace(/^—\s*/, '')} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ol className="list">
      {block.items.map((item, i) => (
        <li key={i}>
          <HtmlText html={item} />
        </li>
      ))}
    </ol>
  )
}

function ClauseView({
  clause,
  first,
}: {
  clause: ContractClause
  first?: boolean
}) {
  return (
    <>
      <h3 className={`clause${first ? ' is-first' : ''}`}>{clause.title}</h3>
      {clause.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </>
  )
}

function Reunidos({ doc }: { doc: ContractServiceDoc }) {
  const { client, buffalo } = doc
  return (
    <>
      <h1 className="doc-title">{doc.title}</h1>
      <p className="doc-date">{doc.place_date}</p>
      <hr className="rule" />
      <h2 className="section">Reunidos</h2>
      <p className="body">De una parte,</p>
      <p className="body">
        <b>{buffalo.legal_name}</b>, con domicilio social en {buffalo.address}, y número de
        identificación fiscal {buffalo.cif}, representada por {buffalo.representative}, en calidad
        de administradores (en adelante, <b>«Buffalo»</b>).
      </p>
      <p className="body">Y de otra parte,</p>
      <p className="body">
        <b>{client.legal_name}</b>, con CIF {client.cif} y domicilio social en {client.address},
        representada por {client.representative} (en adelante, el <b>«Cliente»</b>).
      </p>
      <div className={doc.reunidos_closing_red ? 'ins' : undefined}>
        <p className="body">
          <HtmlText html={doc.reunidos_closing} />
        </p>
      </div>

      <h2 className="section" style={{ marginTop: '8mm' }}>
        Exponen
      </h2>
      {(doc.exponen || []).map((ex, i) => (
        <div key={i} className={ex.red ? 'ins' : undefined}>
          <p className="body">
            <b>{ex.label}</b> <HtmlText html={ex.html} />
          </p>
        </div>
      ))}
      <div className={doc.exponen_closing_red ? 'ins' : undefined}>
        <p className="body">
          <HtmlText
            html={
              doc.exponen_closing ||
              'En virtud de lo anterior, las partes acuerdan las siguientes:'
            }
          />
        </p>
      </div>
    </>
  )
}

function Firmas({ doc }: { doc: ContractServiceDoc }) {
  const sig = doc.signatures
  return (
    <>
      <h2 className="section" style={{ marginTop: '9mm' }}>
        Conformidad y firmas
      </h2>
      <p className="body">
        Y en prueba de conformidad con todo lo anterior, ambas partes suscriben el presente Contrato
        por duplicado y a un solo efecto en el lugar y fecha indicados en la primera página.
      </p>
      <div className="role-label" style={{ marginTop: '10mm' }}>
        Por {doc.buffalo.legal_name}
      </div>
      <div className="signatures" style={{ marginTop: '1mm' }}>
        <div className="sig">
          <div className="sig-line">
            <div className="who">Santiago Miralbell Costa</div>
            <div className="role">Administrador</div>
            <div className="dni">CIF · {doc.buffalo.cif}</div>
          </div>
        </div>
        <div className="sig">
          <div className="sig-line">
            <div className="who">Sergi Masoliver López</div>
            <div className="role">Administrador</div>
            <div className="dni">CIF · {doc.buffalo.cif}</div>
          </div>
        </div>
      </div>
      <div className="role-label" style={{ marginTop: '10mm' }}>
        Por el Cliente
      </div>
      <div className="signatures" style={{ marginTop: '1mm' }}>
        <div className="sig">
          <div className="sig-line">
            <div className="who">{sig.client_name}</div>
            <div className="role">{sig.client_role}</div>
            <div className="dni">CIF · {sig.client_cif}</div>
          </div>
        </div>
        <div />
      </div>
      {doc.conformity_note ? (
        <p className="body conformity-note">{doc.conformity_note}</p>
      ) : null}
    </>
  )
}

function Page({
  children,
  n,
  total,
  label,
}: {
  children: ReactNode
  n: number
  total: number
  label: string
}) {
  return (
    <div className="page">
      <div className="wm">
        <div className="wm-single">
          <span>BUFFALO</span>
        </div>
      </div>
      <div className="page-inner">
        {children}
        <div className="doc-foot">
          <span>agenciabuffalo.es</span>
          <span>
            <b>{label}</b>
          </span>
          <span>
            Pág. {String(n).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
        </div>
      </div>
    </div>
  )
}

type Props = {
  doc: ContractServiceDoc
  id?: string
  className?: string
}

export default function ContractAnnexDocView({
  doc,
  id = 'buffalo-contract-annex',
  className,
}: Props) {
  const byId = new Map(doc.clauses.map((c) => [c.id, c]))
  const total = CONTRACT_PAGE_PACKS.length

  return (
    <div id={id} className={`buffalo-annex${className ? ` ${className}` : ''}`}>
      <div className="annex-workspace">
        {CONTRACT_PAGE_PACKS.map((pg, pi) => (
          <Page key={pi} n={pi + 1} total={total} label={pg.label}>
            {pg.blocks.map((key, bi) => {
              if (key === '__firmas') return <Firmas key={bi} doc={doc} />
              if (key === 'reunidos') return <Reunidos key={bi} doc={doc} />
              const clause = byId.get(key)
              if (!clause) return null
              const showClausulasHeader = key === 'primera'
              const isFirst = bi === 0
              return (
                <div key={bi}>
                  {showClausulasHeader ? <h2 className="section">Cláusulas</h2> : null}
                  <ClauseView clause={clause} first={isFirst || showClausulasHeader} />
                </div>
              )
            })}
          </Page>
        ))}
      </div>
    </div>
  )
}

function buildContractStandaloneDocument(opts: {
  rootId?: string
  fileName?: string
}): { html: string; fileBase: string } {
  const root = document.getElementById(opts.rootId || 'buffalo-contract-annex')
  if (!root) throw new Error('No se encontró el documento')

  const styles = collectDocumentCss()
  const fileBase = (opts.fileName || 'contrato-servicios').replace(/\.html?$/i, '')

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(fileBase)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 24px; background: #ededed; }
.buffalo-annex .annex-workspace { gap: 24px; }
${styles}
@media print {
  html, body { padding: 0; background: #fff; }
  .buffalo-annex .annex-workspace { gap: 0; }
  .buffalo-annex .page {
    box-shadow: none !important;
    page-break-after: always;
    break-after: page;
  }
  .buffalo-annex .page:last-child { page-break-after: auto; }
}
</style>
</head>
<body>${root.outerHTML}</body>
</html>`

  return { html, fileBase }
}

/** Abre ventana de impresión / Guardar como PDF del contrato. */
export async function exportContractAnnexPdf(opts: {
  rootId?: string
  fileName?: string
}): Promise<void> {
  const { html } = buildContractStandaloneDocument(opts)
  await openHtmlPrintWindow(html)
}

/** Descarga el contrato como HTML autónomo. */
export async function downloadContractHtml(opts: {
  rootId?: string
  fileName?: string
}): Promise<void> {
  const { html, fileBase } = buildContractStandaloneDocument(opts)
  downloadTextFile(`${fileBase}.html`, html)
}
