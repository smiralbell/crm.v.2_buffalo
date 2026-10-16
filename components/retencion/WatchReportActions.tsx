import { useState } from 'react'
import { Copy, FileDown, FileText } from 'lucide-react'
import styles from './WatchSystemMap.module.css'
import {
  copyText,
  downloadMarkdown,
  exportWatchReportPdf,
} from '@/lib/retencion/export-watch-report'

export default function WatchReportActions({
  markdown,
  title,
  disabled,
}: {
  markdown: string
  title: string
  disabled?: boolean
}) {
  const [msg, setMsg] = useState('')
  if (!markdown.trim()) return null
  return (
    <div className="space-y-1.5">
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.hudBtn}
          disabled={disabled}
          onClick={async () => {
            try {
              await copyText(markdown)
              setMsg('Copiado')
            } catch {
              setMsg('No se pudo copiar')
            }
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copiar
        </button>
        <button
          type="button"
          className={styles.hudBtn}
          disabled={disabled}
          onClick={() => downloadMarkdown(`${title}.md`, markdown)}
        >
          <FileText className="h-3.5 w-3.5" />
          Markdown
        </button>
        <button
          type="button"
          className={styles.hudBtn}
          disabled={disabled}
          onClick={() => void exportWatchReportPdf(title, markdown)}
        >
          <FileDown className="h-3.5 w-3.5" />
          PDF
        </button>
      </div>
      {msg && <p className="text-xs text-emerald-700">{msg}</p>}
    </div>
  )
}
