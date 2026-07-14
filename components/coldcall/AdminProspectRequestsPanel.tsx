import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2, Loader2, Upload } from 'lucide-react'
import type { ProspectRequestRow } from '@/lib/coldcall/prospect-requests'

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function AdminProspectRequestsPanel({ reloadToken = 0 }: { reloadToken?: number }) {
  const [requests, setRequests] = useState<ProspectRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/coldcall/prospect-requests')
      .then((r) => r.json())
      .then((d) => setRequests(d.requests || []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load, reloadToken])

  const resolve = async (id: number) => {
    setResolvingId(id)
    try {
      const res = await fetch('/api/coldcall/prospect-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al marcar')
      setRequests((prev) => prev.filter((r) => r.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setResolvingId(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 flex items-center gap-2 text-sm text-amber-900">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando solicitudes de BBDD…
      </div>
    )
  }

  if (requests.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-700" />
          <div>
            <p className="text-sm font-semibold text-amber-950">Solicitudes de nueva BBDD</p>
            <p className="text-xs text-amber-800">Los comerciales piden más prospectos para llamar</p>
          </div>
        </div>
        <Badge className="bg-amber-200 text-amber-950 hover:bg-amber-200">
          {requests.length} pendiente{requests.length === 1 ? '' : 's'}
        </Badge>
      </div>

      <div className="space-y-2">
        {requests.map((req) => (
          <div
            key={req.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-200 bg-white px-3 py-3"
          >
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-medium text-gray-900">{req.message}</p>
              <p className="text-xs text-gray-600">
                <strong>{req.requester_name || req.requester_email || 'Comercial'}</strong>
                {req.campaign_name ? (
                  <>
                    {' '}
                    · campaña <strong>{req.campaign_name}</strong>
                  </>
                ) : null}
                {' '}
                · {formatWhen(req.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {req.campaign_id && (
                <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" asChild>
                  <Link href={`/coldcalling/campanas/${req.campaign_id}`}>
                    <Upload className="h-3.5 w-3.5" />
                    Subir CSV
                  </Link>
                </Button>
              )}
              <Button
                size="sm"
                className="gap-1.5 rounded-lg"
                disabled={resolvingId === req.id}
                onClick={() => resolve(req.id)}
              >
                {resolvingId === req.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Resuelto
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
