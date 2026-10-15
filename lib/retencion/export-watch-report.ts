import { escapeHtml, openHtmlPrintWindow } from '@/lib/onboarding/download-doc'

export function downloadMarkdown(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.md') ? fileName : `${fileName}.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function copyText(content: string): Promise<void> {
  await navigator.clipboard.writeText(content)
}

function markdownLiteToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const parts: string[] = []
  let buf: string[] = []
  const flush = () => {
    if (!buf.length) return
    parts.push(`<p>${escapeHtml(buf.join(' ')).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`)
    buf = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) {
      flush()
      continue
    }
    if (line.startsWith('# ')) {
      flush()
      parts.push(`<h1>${escapeHtml(line.slice(2))}</h1>`)
      continue
    }
    if (line.startsWith('## ')) {
      flush()
      parts.push(`<h2>${escapeHtml(line.slice(3))}</h2>`)
      continue
    }
    if (line.startsWith('### ')) {
      flush()
      parts.push(`<h3>${escapeHtml(line.slice(4))}</h3>`)
      continue
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flush()
      parts.push(`<li>${escapeHtml(line.slice(2)).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</li>`)
      continue
    }
    buf.push(line.trim())
  }
  flush()
  return parts.join('\n')
}

export async function exportWatchReportPdf(title: string, markdown: string): Promise<void> {
  const body = markdownLiteToHtml(markdown)
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: Inter, Segoe UI, sans-serif; color: #111827; font-size: 13px; line-height: 1.55; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    h2 { font-size: 16px; margin: 22px 0 8px; }
    h3 { font-size: 14px; margin: 16px 0 6px; }
    p, li { margin: 0 0 8px; }
    li { margin-left: 18px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`
  await openHtmlPrintWindow(html, { delayMs: 250 })
}
