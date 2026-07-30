/**
 * Exportación del informe Buffalo a PDF / HTML.
 *
 * PDF: ventana de impresión nativa (`window.print()` → Guardar como PDF).
 * HTML: descarga un .html autónomo con estilos y tipografías.
 */
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

/** CSS específico de impresión para la ventana dedicada. */
const PRINT_CSS = `
@page { size: letter; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body {
  margin: 0; padding: 0; background: #ffffff;
  font-family: 'Inter', sans-serif; color: var(--bf-text);
}

.buffalo-cover {
  width: 8.5in !important;
  height: 11in !important;
  margin: 0 auto !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  page-break-after: always;
  break-after: page;
}

.bf-page {
  width: 8.5in !important;
  min-height: 11in !important;
  margin: 0 auto !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  page-break-after: always;
  break-after: page;
}
.bf-page:last-child {
  page-break-after: auto;
  break-after: auto;
}

.print-frame { width: 100%; border-collapse: collapse; }
.print-frame td { border: none; padding: 0; vertical-align: top; }
.print-frame > tbody > tr > td { padding: 4pt 61pt; }

.run-spacer-top { height: 54pt; }
.run-spacer-bottom { height: 48pt; }

.bf-flow { width: 100% !important; box-shadow: none !important; padding: 0 !important; min-height: auto !important; }
.bf-flow > * { break-inside: avoid; page-break-inside: avoid; }
.bf-h2 { break-after: avoid; page-break-after: avoid; }
`

const SCREEN_CSS = `
html, body {
  margin: 0; padding: 24px; background: #f4f4f5;
  font-family: 'Inter', sans-serif; color: var(--bf-text);
}
.buffalo-cover, .bf-page {
  margin: 0 auto 24px !important;
}
.bf-flow {
  margin: 0 auto;
  max-width: 8.5in;
  background: #fff;
  box-shadow: 0 18px 40px -10px rgba(0,0,0,.12);
}
@media print {
${PRINT_CSS}
}
`

const FONTS_LINK =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap'

function cleanTitle(s: string): string {
  return (s || '').replace(/^\[[^\]]+\]\s*/, '').trim()
}

function buildBuffaloReportDocument(opts: ExportPdfOptions = {}): {
  html: string
  fileBase: string
} {
  const { rootId = 'buffalo-report', fileName = 'informe', docTitle = '' } = opts

  const root = document.getElementById(rootId)
  if (!root) throw new Error('No se encontró el informe para exportar')
  const cover = root.querySelector<HTMLElement>('.buffalo-cover')
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.bf-page'))
  const flow = root.querySelector<HTMLElement>('.bf-flow')
  if (!flow && pages.length === 0) throw new Error('No se encontró el contenido del informe')

  const cleanDocTitle = cleanTitle(docTitle)
  const styleAttr = root.getAttribute('style') || ''
  const kindAttr = root.getAttribute('data-kind') || 'report'
  const fileBase = (fileName || cleanDocTitle || 'informe').replace(/\.html?$/i, '')

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
<style>${SCREEN_CSS}</style>
</head>
<body style="${escapeHtml(styleAttr)}" data-kind="${escapeHtml(kindAttr)}">
${coverHtml}
${bodyHtml}
</body>
</html>`

  return { html, fileBase }
}

/** Imprime el informe a PDF vía la ventana de impresión del navegador. */
export async function exportBuffaloReportPdf(opts: ExportPdfOptions = {}): Promise<void> {
  try {
    if (document.fonts?.ready) await document.fonts.ready
  } catch {
    /* ignore */
  }
  const { html } = buildBuffaloReportDocument(opts)
  await openHtmlPrintWindow(html)
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
