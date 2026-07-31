/** Utilidades compartidas para descargar / imprimir documentos onboarding. */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Descarga un archivo de texto (HTML, etc.) en el navegador. */
export function downloadTextFile(
  fileName: string,
  content: string,
  mime = 'text/html;charset=utf-8'
): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.html') || fileName.endsWith('.htm') ? fileName : `${fileName}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** CSS accesible desde las hojas de estilo del documento actual. */
export function collectDocumentCss(): string {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((r) => r.cssText)
          .join('\n')
      } catch {
        return ''
      }
    })
    .join('\n')
}

type OpenPrintOpts = {
  /** Espera tipografías/imágenes antes de imprimir */
  waitForReady?: (doc: Document) => Promise<void>
  /** Delay extra tras ready (ms) */
  delayMs?: number
}

/** Abre una ventana con HTML y lanza el diálogo de impresión (Guardar como PDF). */
export async function openHtmlPrintWindow(
  html: string,
  opts: OpenPrintOpts = {}
): Promise<void> {
  const win = window.open('', '_blank', 'width=920,height=1200')
  if (!win) {
    throw new Error('El navegador bloqueó la ventana. Permite las ventanas emergentes.')
  }
  win.document.open()
  win.document.write(html)
  win.document.close()

  const triggerPrint = async () => {
    try {
      if (opts.waitForReady) {
        await opts.waitForReady(win.document)
      } else if (win.document.fonts?.ready) {
        await win.document.fonts.ready
      }
    } catch {
      /* ignore */
    }
    const delay = opts.delayMs ?? 400
    if (delay > 0) await new Promise((r) => setTimeout(r, delay))
    win.focus()
    win.print()
  }

  if (win.document.readyState === 'complete') {
    void triggerPrint()
  } else {
    win.onload = () => {
      void triggerPrint()
    }
  }
}
