import { useMemo, useState } from 'react'
import { ArrowRightLeft, Check, Copy, KeyRound, Save, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Lo que el panel de un cliente necesita para los tickets: variables listas
 * para pegar, webhook de tickets y callback de respuestas. Se usa en
 * Retención → pestaña Tickets → Conexión. Las incidencias van aparte, en la
 * pestaña Incidencias.
 */

export interface TicketProjectConfig {
  id: string
  name: string
  config_ref: string | null
  ticket_callback_url: string | null
  ticket_callback_token: string | null
  ticket_count: number
}

export interface TicketConnection {
  tickets_webhook_url: string
  tickets_webhook_token: string
}

function useCopy(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (key: string, text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(key)
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
      })
      .catch(() => {})
  }
  return [copied, copy]
}

function CopyField({
  label,
  value,
  hint,
  copied,
  onCopy,
}: {
  label: string
  value: string
  hint?: React.ReactNode
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div>
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <code
          className="min-w-0 flex-1 select-all truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800"
          title={value}
        >
          {value || '—'}
        </code>
        <button
          type="button"
          onClick={onCopy}
          disabled={!value}
          aria-label={`Copiar ${label}`}
          className="shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

function Block({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Ticket
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export default function TicketConnectionDetails({
  project,
  conn,
  onSaved,
}: {
  project: TicketProjectConfig
  conn: TicketConnection
  /** Tras guardar el callback */
  onSaved?: () => void
}) {
  const [draftUrl, setDraftUrl] = useState(project.ticket_callback_url || '')
  const [draftToken, setDraftToken] = useState(project.ticket_callback_token || '')
  const [savedUrl, setSavedUrl] = useState(project.ticket_callback_url || '')
  const [savedToken, setSavedToken] = useState(project.ticket_callback_token || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [copied, copy] = useCopy()

  const envBlock = useMemo(
    () =>
      [
        `BUFFALO_TICKETS_WEBHOOK_URL=${conn.tickets_webhook_url}`,
        `BUFFALO_TICKETS_WEBHOOK_TOKEN=${conn.tickets_webhook_token}`,
        `BUFFALO_PROJECT_REF=${project.config_ref || project.id}`,
        `BUFFALO_CALLBACK_TOKEN=${draftToken}`,
      ].join('\n'),
    [conn, project, draftToken]
  )

  const dirty = draftUrl !== savedUrl || draftToken !== savedToken

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/tickets/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          ticket_callback_url: draftUrl,
          ticket_callback_token: draftToken,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setSavedUrl(draftUrl)
      setSavedToken(draftToken)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Block icon={KeyRound} title="Variables para el panel del cliente" subtitle="Pégalas en el .env o en EasyPanel de su panel.">
        <pre className="overflow-x-auto rounded-xl bg-gray-950 px-4 py-3 font-mono text-xs leading-relaxed text-gray-100">
          {envBlock}
        </pre>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400">
            {draftToken
              ? 'BUFFALO_CALLBACK_TOKEN es el token de callback de abajo.'
              : 'Aún no hay token de callback: escríbelo abajo y guarda.'}
          </p>
          <Button size="sm" variant="outline" className="shrink-0 rounded-xl" onClick={() => copy('env', envBlock)}>
            {copied === 'env' ? <Check className="mr-1.5 h-4 w-4 text-emerald-600" /> : <Copy className="mr-1.5 h-4 w-4" />}
            Copiar todo
          </Button>
        </div>
      </Block>

      <Block icon={Ticket} title="Tickets · del panel del cliente al CRM" subtitle="Cuando el cliente abre un ticket, su panel lo manda aquí.">
        <CopyField
          label="Endpoint"
          value={conn.tickets_webhook_url}
          copied={copied === 'turl'}
          onCopy={() => copy('turl', conn.tickets_webhook_url)}
        />
        <CopyField
          label="Token (Authorization: Bearer)"
          value={conn.tickets_webhook_token}
          copied={copied === 'ttok'}
          onCopy={() => copy('ttok', conn.tickets_webhook_token)}
          hint={
            <>
              El mismo para todos los clientes. Viene de <code className="text-[10px]">TICKETS_WEBHOOK_TOKEN</code>.
            </>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <CopyField
            label="project_ref"
            value={project.config_ref || ''}
            copied={copied === 'ref'}
            onCopy={() => copy('ref', project.config_ref || '')}
            hint={project.config_ref ? undefined : 'Sin referencia: usa project_id.'}
          />
          <CopyField label="project_id" value={project.id} copied={copied === 'pid'} onCopy={() => copy('pid', project.id)} />
        </div>
      </Block>

      <Block
        icon={ArrowRightLeft}
        title="Respuestas · del CRM al panel del cliente"
        subtitle="Cuando respondéis o cambiáis el estado de un ticket, el CRM avisa a esta URL."
      >
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">URL de callback</span>
          <input
            type="url"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="https://dashboard.cliente.com/api/webhooks/buffalo-tickets"
            className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Token de callback (BUFFALO_CALLBACK_TOKEN)
          </span>
          <input
            type="text"
            value={draftToken}
            onChange={(e) => setDraftToken(e.target.value)}
            placeholder="Distinto para cada cliente"
            className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 font-mono text-sm"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving || !dirty} className="rounded-xl">
            {saved ? (
              <>
                <Check className="mr-2 h-4 w-4" /> Guardado
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" /> Guardar
              </>
            )}
          </Button>
        </div>
      </Block>
    </div>
  )
}
