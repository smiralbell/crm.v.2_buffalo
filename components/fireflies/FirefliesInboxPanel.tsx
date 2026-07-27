'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Video,
  X,
} from 'lucide-react'
import type { MeetingDto } from '@/components/fireflies/LeadMeetingsPanel'

function fmtDate(iso: string | null) {
  if (!iso) return 'Sin fecha'
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
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
      setMessage(`Sincronizadas ${data.synced} · vinculadas ${data.matched}`)
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

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Video className="h-6 w-6" />
            Fireflies · Reuniones
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Transcripciones y resúmenes entrantes. Vincula las que no se emparejaron solas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={unmatchedOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUnmatchedOnly(true)}
          >
            Sin lead
          </Button>
          <Button
            variant={!unmatchedOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUnmatchedOnly(false)}
          >
            Recientes
          </Button>
          <Button size="sm" onClick={() => void syncNow()} disabled={syncing || !configured}>
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Sincronizar
          </Button>
        </div>
      </div>

      {!configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Falta <code className="font-mono text-xs">FIREFLIES_API_KEY</code> en el servidor.
          El webhook no podrá descargar transcripciones hasta configurarla.
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700">
          {message}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      )}
      {!loading && error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && meetings.length === 0 && (
        <p className="text-sm text-gray-400 py-10 text-center">
          {unmatchedOnly
            ? 'No hay reuniones pendientes de vincular.'
            : 'Aún no hay reuniones importadas de Fireflies.'}
        </p>
      )}

      {!loading && meetings.length > 0 && (
        <ul className="space-y-3">
          {meetings.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {m.title || 'Reunión sin título'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{fmtDate(m.started_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {m.lead_id ? (
                    <Link href={`/leads/${m.lead_id}`}>
                      <Badge className="bg-green-50 text-green-700 border border-green-200 hover:bg-green-100">
                        Lead #{m.lead_id}
                      </Badge>
                    </Link>
                  ) : (
                    <Badge className="bg-amber-50 text-amber-800 border border-amber-200">
                      Sin lead
                    </Badge>
                  )}
                </div>
              </div>

              {m.summary_overview && (
                <p className="text-sm text-gray-600 line-clamp-3">{m.summary_overview}</p>
              )}

              <div className="flex flex-wrap gap-1.5">
                {m.participants
                  .filter((p) => p.email)
                  .slice(0, 6)
                  .map((p) => (
                    <Badge key={p.email!} variant="secondary" className="text-xs font-normal">
                      {p.email}
                    </Badge>
                  ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {m.transcript_url && (
                  <a href={m.transcript_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Fireflies
                    </Button>
                  </a>
                )}
                {!m.lead_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setLinkFor(linkFor === m.id ? null : m.id)
                      setLeadQuery('')
                      setLeadHits([])
                    }}
                  >
                    <Link2 className="h-3.5 w-3.5 mr-1.5" />
                    Vincular a lead
                  </Button>
                )}
                {!m.lead_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-gray-500"
                    disabled={busyId === m.id}
                    onClick={() => void ignore(m.id)}
                  >
                    Ignorar
                  </Button>
                )}
              </div>

              {linkFor === m.id && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-gray-400 shrink-0" />
                    <Input
                      placeholder="Buscar lead por nombre o email…"
                      value={leadQuery}
                      onChange={(e) => void searchLeads(e.target.value)}
                      className="h-9 bg-white"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setLinkFor(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {searching && (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
                    </p>
                  )}
                  {leadHits.length > 0 && (
                    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white overflow-hidden">
                      {leadHits.map((lead) => {
                        const name =
                          lead.contact?.nombre ||
                          lead.contact?.email ||
                          `Lead #${lead.id}`
                        return (
                          <li key={lead.id}>
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => void link(m.id, lead.id)}
                              className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50"
                            >
                              <span className="font-medium text-gray-900">{name}</span>
                              {lead.contact?.empresa && (
                                <span className="text-gray-500"> · {lead.contact.empresa}</span>
                              )}
                              <span className="text-xs text-gray-400 ml-2">#{lead.id}</span>
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
    </div>
  )
}
