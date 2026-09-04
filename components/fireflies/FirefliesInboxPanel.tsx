'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MeetingDto } from '@/components/fireflies/LeadMeetingsPanel'

function fmtDate(iso: string | null) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

type LeadHit = {
  id: number
  contact?: { nombre?: string | null; email?: string | null; empresa?: string | null } | null
}

export default function FirefliesInboxPanel() {
  const [meetings, setMeetings] = useState<MeetingDto[]>([])
  const [configured, setConfigured] = useState(true)
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [webhookSecretOk, setWebhookSecretOk] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unmatchedOnly, setUnmatchedOnly] = useState(true)
  const [linkFor, setLinkFor] = useState<string | null>(null)
  const [leadQuery, setLeadQuery] = useState('')
  const [leadHits, setLeadHits] = useState<LeadHit[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = unmatchedOnly ? '?unmatched=1&limit=50' : '?limit=40'
      const res = await fetch(`/api/integrations/fireflies/meetings${q}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setMeetings(data.meetings || [])
      setConfigured(Boolean(data.configured))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [unmatchedOnly])

  useEffect(() => {
    void fetch('/api/integrations/fireflies/status')
      .then((r) => r.json())
      .then((d) => {
        if (d.webhook_url) setWebhookUrl(d.webhook_url)
        setWebhookSecretOk(Boolean(d.webhook_secret_configured))
        if (typeof d.api_configured === 'boolean') setConfigured(d.api_configured)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function syncNow() {
    setSyncing(true)
    setMessage(null)
    try {
      const res = await fetch('/api/integrations/fireflies/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 25 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error sync')
      setMessage(`${data.synced} sincronizadas`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error sync')
    } finally {
      setSyncing(false)
    }
  }

  async function searchLeads(q: string) {
    setLeadQuery(q)
    if (q.trim().length < 2) {
      setLeadHits([])
      return
    }
    setSearching(true)
    try {
      const res = await fetch(
        `/api/leads?search=${encodeURIComponent(q.trim())}&pageSize=8&page=1`
      )
      const data = await res.json()
      if (res.ok) {
        setLeadHits(Array.isArray(data.leads) ? data.leads : [])
      }
    } finally {
      setSearching(false)
    }
  }

  async function link(meetingId: string, leadId: number) {
    setBusyId(meetingId)
    try {
      const res = await fetch(`/api/integrations/fireflies/meetings/${meetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link', lead_id: leadId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setLinkFor(null)
      setLeadQuery('')
      setLeadHits([])
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  async function ignore(meetingId: string) {
    setBusyId(meetingId)
    try {
      const res = await fetch(`/api/integrations/fireflies/meetings/${meetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ignore' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error')
      }
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  const emails = (m: MeetingDto) =>
    m.participants
      .map((p) => p.email)
      .filter((e): e is string => Boolean(e))
      .slice(0, 3)

  return (
    <div className="mx-auto w-full max-w-xl px-1">
      <header className="text-center pt-4 pb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reuniones</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Fireflies las envía al terminar la transcripción.
        </p>
      </header>

      <div className="flex items-center justify-center gap-1 mb-8">
        <div className="inline-flex rounded-full border border-border bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setUnmatchedOnly(true)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
              unmatchedOnly
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Pendientes
          </button>
          <button
            type="button"
            onClick={() => setUnmatchedOnly(false)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
              !unmatchedOnly
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Todas
          </button>
        </div>
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={syncing || !configured}
          title="Sincronizar"
          className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {!configured && (
        <p className="text-center text-sm text-amber-800 mb-6">Falta FIREFLIES_API_KEY en el servidor.</p>
      )}
      {message && (
        <p className="text-center text-xs text-muted-foreground mb-4">{message}</p>
      )}
      {error && <p className="text-center text-sm text-red-600 mb-4">{error}</p>}

      {loading && (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}

      {!loading && !error && meetings.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-16">
          {unmatchedOnly ? 'Nada pendiente de vincular.' : 'Aún no hay reuniones.'}
        </p>
      )}

      {!loading && meetings.length > 0 && (
        <ul className="divide-y divide-border/80">
          {meetings.map((m) => (
            <li key={m.id} className="py-6">
              <div className="text-center">
                <p className="text-sm font-medium text-foreground leading-snug">
                  {m.title || 'Sin título'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmtDate(m.started_at)}
                  {m.lead_id ? (
                    <>
                      {' · '}
                      <Link href={`/leads/${m.lead_id}`} className="hover:text-foreground">
                        Lead
                      </Link>
                    </>
                  ) : m.contact_id ? (
                    <>
                      {' · '}
                      <Link href={`/contacts/${m.contact_id}`} className="hover:text-foreground">
                        Contacto
                      </Link>
                    </>
                  ) : (
                    ' · Sin vincular'
                  )}
                </p>
                {emails(m).length > 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground/80 tracking-tight">
                    {emails(m).join('  ·  ')}
                  </p>
                )}
                {m.summary_overview && (
                  <p className="mt-3 text-sm text-muted-foreground line-clamp-2 max-w-md mx-auto leading-relaxed">
                    {m.summary_overview}
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                {m.transcript_url && (
                  <a
                    href={m.transcript_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir
                  </a>
                )}
                {!m.lead_id && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setLinkFor(linkFor === m.id ? null : m.id)
                      setLeadQuery('')
                      setLeadHits([])
                    }}
                  >
                    <Link2 className="h-3 w-3" />
                    Vincular
                  </button>
                )}
                {!m.lead_id && (
                  <button
                    type="button"
                    disabled={busyId === m.id}
                    className="text-muted-foreground/70 hover:text-foreground disabled:opacity-40"
                    onClick={() => void ignore(m.id)}
                  >
                    Ignorar
                  </button>
                )}
              </div>

              {linkFor === m.id && (
                <div className="mt-4 max-w-sm mx-auto space-y-2">
                  <div className="flex items-center gap-2">
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Nombre o email del lead"
                      value={leadQuery}
                      onChange={(e) => void searchLeads(e.target.value)}
                      className="h-9 rounded-xl"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8"
                      onClick={() => setLinkFor(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {searching && (
                    <p className="text-center text-xs text-muted-foreground">Buscando…</p>
                  )}
                  {leadHits.length > 0 && (
                    <ul className="rounded-xl border border-border overflow-hidden text-left">
                      {leadHits.map((lead) => {
                        const name =
                          lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`
                        return (
                          <li key={lead.id} className="border-b border-border last:border-0">
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => void link(m.id, lead.id)}
                              className="w-full px-3 py-2.5 text-sm hover:bg-muted/50"
                            >
                              <span className="font-medium">{name}</span>
                              {lead.contact?.empresa && (
                                <span className="text-muted-foreground"> · {lead.contact.empresa}</span>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 pb-8 text-center">
        <button
          type="button"
          onClick={() => setShowSetup((v) => !v)}
          className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
        >
          {showSetup ? 'Ocultar configuración' : 'Configuración webhook'}
        </button>
        {showSetup && webhookUrl && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] text-muted-foreground break-all font-mono">{webhookUrl}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  void navigator.clipboard.writeText(webhookUrl)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                <Copy className="h-3 w-3" />
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <a
                href="https://app.fireflies.ai/integrations/api/webhook"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Fireflies
              </a>
            </div>
            {!webhookSecretOk && (
              <p className="text-[11px] text-amber-700">Falta FIREFLIES_WEBHOOK_SECRET.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
