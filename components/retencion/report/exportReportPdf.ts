/**
 * Exportación del informe Buffalo a PDF mediante impresión nativa del navegador.
 *
 * En lugar de rasterizar el DOM (html2canvas → imagen gigante, sin texto), se
 * abre una ventana dedicada SOLO con el informe y sus estilos, y se lanza
 * `window.print()`. El usuario elige "Guardar como PDF": el resultado tiene
 * texto real, es ligero y respeta la tipografía y los colores de la plantilla.
 *
 * Claves:
 * - `@page { margin: 0 }`  → Chrome/Edge NO pintan su cabecera/pie (fecha, URL
 *   "about:blank", título). Los márgenes se recrean con una tabla thead/tfoot.
 * - `<table>` con thead/tfoot → header/footer de marca REPETIDOS en cada página
 *   y con su espacio reservado (evita solapes y da los márgenes verticales).
 * - `print-color-adjust: exact` → conserva los fondos de color al imprimir.
 */
import { BUFFALO_REPORT_CSS } from './buffaloReportCss'

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

/* Portada: una página completa, sin sombra */
.buffalo-cover {
  width: 8.5in !important;
  height: 11in !important;
  margin: 0 auto !important;
  box-shadow: none !important;
  page-break-after: always;
  break-after: page;
}

/* Marco de contenido: thead/tfoot VACÍOS se repiten en cada página y reservan
   su alto, creando los márgenes superior/inferior (sin líneas ni texto). El
   padding lateral del td da los márgenes izquierdo/derecho en todas las páginas. */
.print-frame { width: 100%; border-collapse: collapse; }
.print-frame td { border: none; padding: 0; vertical-align: top; }
.print-frame > tbody > tr > td { padding: 4pt 61pt; }

.run-spacer-top { height: 54pt; }
.run-spacer-bottom { height: 48pt; }

/* Flujo continuo: ancho completo, sin sombra ni padding (lo pone la tabla) */
.bf-flow { width: 100% !important; box-shadow: none !important; padding: 0 !important; }
.bf-flow > * { break-inside: avoid; page-break-inside: avoid; }
.bf-h2 { break-after: avoid; page-break-after: avoid; }
`

const FONTS_LINK =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Quita prefijos tipo "[Buffalo] " / "[cliente] " del título. */
function cleanTitle(s: string): string {
  return (s || '').replace(/^\[[^\]]+\]\s*/, '').trim()
}

/**
 * Imprime el informe a PDF vía la ventana de impresión del navegador.
 */
export async function exportBuffaloReportPdf(opts: ExportPdfOptions = {}): Promise<void> {
  const { rootId = 'buffalo-report', fileName = 'informe', docTitle = '' } = opts

  // Espera a que las fuentes estén cargadas (evita fuente fallback en el PDF)
  try {
    if (document.fonts?.ready) await document.fonts.ready
  } catch {
    /* ignore */
  }

  const root = document.getElementById(rootId)
  if (!root) throw new Error('No se encontró el informe para exportar')
  const cover = root.querySelector<HTMLElement>('.buffalo-cover')
  const flow = root.querySelector<HTMLElement>('.bf-flow')
  if (!flow) throw new Error('No se encontró el contenido del informe')

  const cleanDocTitle = cleanTitle(docTitle)
  const styleAttr = root.getAttribute('style') || ''

  const win = window.open('', '_blank', 'width=900,height=1160')
  if (!win) {
    throw new Error('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes.')
  }

  const coverHtml = cover ? cover.outerHTML : ''
  const flowInner = flow.innerHTML

  const doc = win.document
  doc.open()
  doc.write(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(fileName || cleanDocTitle || 'Informe')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${FONTS_LINK}" />
<style>${BUFFALO_REPORT_CSS}</style>
<style>${PRINT_CSS}</style>
</head>
<body style="${escapeHtml(styleAttr)}">
${coverHtml}
<table class="print-frame">
  <thead><tr><td><div class="run-spacer-top"></div></td></tr></thead>
  <tfoot><tr><td><div class="run-spacer-bottom"></div></td></tr></tfoot>
  <tbody><tr><td>
    <div class="bf-flow">${flowInner}</div>
  </td></tr></tbody>
</table>
</body>
</html>`)
  doc.close()

  // Espera a que carguen fuentes/recursos en la ventana nueva antes de imprimir
  const triggerPrint = async () => {
    try {
      if (win.document.fonts?.ready) await win.document.fonts.ready
    } catch {
      /* ignore */
    }
    win.focus()
    win.print()
  }

  if (win.document.readyState === 'complete') {
    setTimeout(() => void triggerPrint(), 350)
  } else {
    win.onload = () => setTimeout(() => void triggerPrint(), 350)
  }
}
