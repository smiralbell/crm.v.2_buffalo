/**
 * Exportación del informe Buffalo a PDF / HTML.
 *
 * PDF (propuestas): descarga real hoja a hoja (html2canvas + jsPDF),
 * preservando portada + cada .bf-page con header/footer.
 * Fallback: ventana de impresión del navegador.
 */
import type { jsPDF } from 'jspdf'
import { BUFFALO_REPORT_CSS } from './buffaloReportCss'
import {
  downloadTextFile,
  escapeHtml,
  openHtmlPrintWindow,
} from '@/lib/onboarding/download-doc'

export type ExportPdfOptions = {
  rootId?: string
  fileName?: string
  audience?: 'client' | 'buffalo'
  docTitle?: string
}

/** CSS de impresión: A4 (propuestas ES) / Letter (informes legacy). */
function buildPrintCss(pageSize: 'A4' | 'letter'): string {
  const w = pageSize === 'A4' ? '210mm' : '8.5in'
  const h = pageSize === 'A4' ? '297mm' : '11in'
  return `
@page { size: ${pageSize}; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
html, body {
  margin: 0; padding: 0; background: #ffffff !important;
  font-family: 'Inter', 'Segoe UI', sans-serif; color: var(--bf-text);
}

.buffalo-doc {
  gap: 0 !important;
  align-items: stretch !important;
  width: ${w} !important;
  max-width: ${w} !important;
}

.buffalo-cover {
  width: ${w} !important;
  height: ${h} !important;
  min-height: ${h} !important;
  max-height: ${h} !important;
  margin: 0 !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  page-break-after: always;
  break-after: page;
  overflow: hidden !important;
}

.bf-page {
  width: ${w} !important;
  min-height: ${h} !important;
  height: ${h} !important;
  max-height: ${h} !important;
  margin: 0 !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  page-break-after: always;
  break-after: page;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}
.bf-page:last-child {
  page-break-after: auto;
  break-after: auto;
}
.bf-page-body { flex: 1 1 auto; min-height: 0; overflow: hidden; }
.bf-flow-header, .bf-flow-footer { flex: 0 0 auto; }

.print-frame { width: 100%; border-collapse: collapse; }
.print-frame td { border: none; padding: 0; vertical-align: top; }
.print-frame > tbody > tr > td { padding: 12mm 18mm; }

.run-spacer-top { height: 14mm; }
.run-spacer-bottom { height: 12mm; }

.bf-flow { width: 100% !important; box-shadow: none !important; padding: 0 !important; min-height: auto !important; border-radius: 0 !important; }
.bf-h2 { break-after: avoid; page-break-after: avoid; }

.bf-table-wrap, .bf-card, .bf-bubble, .bf-callout, .bf-kpi, .bf-sig-card {
  box-shadow: none !important;
}

img { max-width: 100% !important; height: auto !important; }
`
}

const SCREEN_CSS_BASE = `
html, body {
  margin: 0; padding: 24px; background: #f4f4f5;
  font-family: 'Inter', 'Segoe UI', sans-serif; color: var(--bf-text);
}
.buffalo-cover, .bf-page {
  margin: 0 auto 24px !important;
}
.bf-flow {
  margin: 0 auto;
  max-width: 210mm;
  background: #fff;
  box-shadow: 0 18px 40px -10px rgba(0,0,0,.12);
}
`

const FONTS_LINK =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap'

function cleanTitle(s: string): string {
  return (s || '').replace(/^\[[^\]]+\]\s*/, '').trim()
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForPrintReady(doc: Document): Promise<void> {
  try {
    if (doc.fonts?.ready) await doc.fonts.ready
  } catch {
    /* ignore */
  }
  const imgs = Array.from(doc.images || [])
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve()
          img.onload = () => resolve()
          img.onerror = () => resolve()
          setTimeout(() => resolve(), 2000)
        })
    )
  )
  await wait(450)
}

function collectSheets(root: HTMLElement): HTMLElement[] {
  const cover = root.querySelector<HTMLElement>('.buffalo-cover')
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.bf-page'))
  const flow = root.querySelector<HTMLElement>('.bf-flow')
  const sheets: HTMLElement[] = []
  if (cover) sheets.push(cover)
  if (pages.length > 0) sheets.push(...pages)
  else if (flow) sheets.push(flow)
  return sheets
}

function buildBuffaloReportDocument(opts: ExportPdfOptions = {}): {
  html: string
  fileBase: string
  pageSize: 'A4' | 'letter'
} {
  const { rootId = 'buffalo-report', fileName = 'informe', docTitle = '' } = opts

  const root = document.getElementById(rootId)
  if (!root) throw new Error('No se encontró el informe para exportar')
  const sheets = collectSheets(root)
  if (sheets.length === 0) throw new Error('No se encontró el contenido del informe')

  const cleanDocTitle = cleanTitle(docTitle)
  const styleAttr = root.getAttribute('style') || ''
  const kindAttr = root.getAttribute('data-kind') || 'report'
  const themeAttr = root.getAttribute('data-theme') || ''
  const fileBase = (fileName || cleanDocTitle || 'informe').replace(/\.html?$/i, '')
  const pageSize: 'A4' | 'letter' = kindAttr === 'proposal' ? 'A4' : 'letter'
  const printCss = buildPrintCss(pageSize)

  const pageVars =
    pageSize === 'A4'
      ? '--bf-page-w:210mm;--bf-page-h:297mm;'
      : '--bf-page-w:8.5in;--bf-page-h:11in;'
  const mergedStyle = `${pageVars}${styleAttr}`

  const cover = root.querySelector<HTMLElement>('.buffalo-cover')
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.bf-page'))
  const flow = root.querySelector<HTMLElement>('.bf-flow')
  const coverHtml = cover ? cover.outerHTML : ''
  const bodyHtml =
    pages.length > 0
      ? pages.map((p) => p.outerHTML).join('\n')
      : `<table class="print-frame">
  <thead><tr><td><div class="run-spacer-top"></div></td></tr></thead>
  <tfoot><tr><td><div class="run-spacer-bottom"></div></td></tr></tfoot>
  <tbody><tr><td>
    <div class="bf-flow">${flow!.innerHTML}</div>
  </td></tr></tbody>
</table>`

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(fileBase || cleanDocTitle || 'Informe')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${FONTS_LINK}" />
<style>${BUFFALO_REPORT_CSS}</style>
<style>
${SCREEN_CSS_BASE}
@media print {
${printCss}
}
</style>
</head>
<body class="buffalo-doc" style="${escapeHtml(mergedStyle)}" data-kind="${escapeHtml(kindAttr)}"${
    themeAttr ? ` data-theme="${escapeHtml(themeAttr)}"` : ''
  }>
${coverHtml}
${bodyHtml}
</body>
</html>`

  return { html, fileBase, pageSize }
}

/** Añade un canvas al PDF; si es más alto que la página, lo parte en trozos. */
function addCanvasToPdf(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  pageW: number,
  pageH: number,
  startNewPage: boolean
) {
  const imgW = pageW
  const imgH = (canvas.height * pageW) / canvas.width
  const pxPerMm = canvas.width / pageW
  const toPng = (c: HTMLCanvasElement) => c.toDataURL('image/png')

  if (imgH <= pageH + 0.8) {
    if (startNewPage) pdf.addPage()
    pdf.addImage(toPng(canvas), 'PNG', 0, 0, imgW, imgH)
    return
  }

  let y = 0
  let first = true
  const pageHeightPx = Math.floor(pageH * pxPerMm)
  while (y < canvas.height - 1) {
    if (startNewPage || !first) pdf.addPage()
    first = false
    startNewPage = true
    const sliceH = Math.min(pageHeightPx, canvas.height - y)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceH
    const ctx = pageCanvas.getContext('2d')
    if (!ctx) break
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
    const sliceHmm = sliceH / pxPerMm
    pdf.addImage(toPng(pageCanvas), 'PNG', 0, 0, pageW, sliceHmm)
    y += sliceH
  }
}

/**
 * Descarga PDF real: una página A4 por hoja visual (portada + .bf-page).
 */
async function downloadPdfFromSheets(
  root: HTMLElement,
  fileBase: string,
  pageSize: 'A4' | 'letter'
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const sheets = collectSheets(root)
  if (sheets.length === 0) throw new Error('No hay hojas para exportar')

  const prevClass = root.className
  root.classList.remove('proposal-preview-soft')

  const format = pageSize === 'A4' ? 'a4' : 'letter'
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  // jsPDF crea la 1ª página vacía; la rellenamos con la portada
  let isFirst = true

  try {
    for (const el of sheets) {
      const prev = {
        width: el.style.width,
        minHeight: el.style.minHeight,
        boxShadow: el.style.boxShadow,
        borderRadius: el.style.borderRadius,
      }
      el.style.width = pageSize === 'A4' ? '210mm' : '8.5in'
      el.style.minHeight = pageSize === 'A4' ? '297mm' : '11in'
      el.style.boxShadow = 'none'
      el.style.borderRadius = '0'

      // Esperar tipografías (números / badges) antes de capturar
      try {
        if (document.fonts?.ready) await document.fonts.ready
      } catch {
        /* ignore */
      }
      await wait(80)

      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (_doc, cloned) => {
          const node = cloned as HTMLElement
          node.style.boxShadow = 'none'
          node.style.borderRadius = '0'
          node.style.transform = 'none'
          node.style.setProperty('-webkit-font-smoothing', 'antialiased')
          node.style.setProperty('text-rendering', 'geometricPrecision')
          // Badges / números: evitar recortes por letter-spacing o overflow
          node.querySelectorAll<HTMLElement>('.bf-numbadge, .bf-kpi-value, .bf-meta-value').forEach((n) => {
            n.style.letterSpacing = '0.02em'
            n.style.overflow = 'visible'
            n.style.whiteSpace = 'nowrap'
          })
          node.querySelectorAll<HTMLElement>('.bf-page-body, .bf-cover-stack').forEach((n) => {
            n.style.overflow = 'visible'
          })
        },
      })

      el.style.width = prev.width
      el.style.minHeight = prev.minHeight
      el.style.boxShadow = prev.boxShadow
      el.style.borderRadius = prev.borderRadius

      addCanvasToPdf(pdf, canvas, pageW, pageH, !isFirst)
      isFirst = false
    }
  } finally {
    root.className = prevClass
  }

  pdf.save(`${fileBase}.pdf`)
}

/** Exporta a PDF: descarga .pdf (propuestas) o fallback a impresión. */
export async function exportBuffaloReportPdf(opts: ExportPdfOptions = {}): Promise<void> {
  try {
    if (document.fonts?.ready) await document.fonts.ready
  } catch {
    /* ignore */
  }

  const rootId = opts.rootId || 'buffalo-report'
  const root = document.getElementById(rootId)
  if (!root) throw new Error('No se encontró el informe para exportar')

  const kindAttr = root.getAttribute('data-kind') || 'report'
  const pageSize: 'A4' | 'letter' = kindAttr === 'proposal' ? 'A4' : 'letter'
  const fileBase = (opts.fileName || cleanTitle(opts.docTitle || '') || 'informe').replace(
    /\.pdf$/i,
    ''
  )

  // Propuestas / docs con .bf-page → PDF hoja a hoja (descarga real)
  const hasPages = root.querySelectorAll('.bf-page').length > 0
  if (hasPages || kindAttr === 'proposal') {
    try {
      await downloadPdfFromSheets(root, fileBase, pageSize)
      return
    } catch (e) {
      console.warn('[exportBuffaloReportPdf] fallback a impresión', e)
    }
  }

  const { html } = buildBuffaloReportDocument(opts)
  await openHtmlPrintWindow(html, { waitForReady: waitForPrintReady, delayMs: 200 })
}

/** Descarga el informe como HTML autónomo. */
export async function downloadBuffaloReportHtml(opts: ExportPdfOptions = {}): Promise<void> {
  try {
    if (document.fonts?.ready) await document.fonts.ready
  } catch {
    /* ignore */
  }
  const { html, fileBase } = buildBuffaloReportDocument(opts)
  downloadTextFile(`${fileBase}.html`, html)
}
