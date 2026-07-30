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

/** Abre una ventana con HTML y lanza el diálogo de impresión (Guardar como PDF). */
export async function openHtmlPrintWindow(html: string): Promise<void> {
  const win = window.open('', '_blank', 'width=900,height=1160')
  if (!win) {
    throw new Error('El navegador bloqueó la ventana. Permite las ventanas emergentes.')
  }
  win.document.open()
  win.document.write(html)
  win.document.close()

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
