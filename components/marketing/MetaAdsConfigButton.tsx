'use client'

import { useEffect, useMemo, useState } from 'react'
import { Settings2, Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { monthDateBounds } from '@/lib/integrations/meta/ads-parse'
import type { MetaAdsAccessReport } from '@/lib/integrations/meta/ads-access'
import { cn } from '@/lib/utils'

export default function MetaAdsConfigButton({
  period,
  onRangeApplied,
  onSynced,
}: {
  period: string
  onRangeApplied?: (since: string, until: string) => void
  onSynced?: () => void
}) {
  const month = useMemo(() => monthDateBounds(period), [period])
  const [open, setOpen] = useState(false)
  const [since, setSince] = useState(month.since)
  const [until, setUntil] = useState(month.until)
  const [importSince, setImportSince] = useState(month.since)
  const [importUntil, setImportUntil] = useState(month.until)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [access, setAccess] = useState<MetaAdsAccessReport | null>(null)

  useEffect(() => {
    setSince(month.since)
    setUntil(month.until)
    setImportSince(month.since)
    setImportUntil(month.until)
  }, [month.since, month.until])

  useEffect(() => {
    if (!open) return
    void (async () => {
      const qs = new URLSearchParams({ since: month.since, until: month.until })
      const res = await fetch(`/api/marketing/meta-campaigns?${qs}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return
      setAccess(json.access || null)
      const sync = json.sync?.[0]
      setLastSync(
        sync?.last_synced_at
          ? new Date(sync.last_synced_at).toLocaleString('es-ES', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })
          : null
      )
      setLastError(sync?.last_error || null)
    })()
  }, [open, month.since, month.until])

  const postSync = async (action: 'sync' | 'import') => {
    setSyncing(true)
    setError(null)
    try {
      const body =
        action === 'import'
          ? { action, since: importSince, until: importUntil }
          : { action: 'sync', since, until }
      const res = await fetch('/api/marketing/meta-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Error al sincronizar')
        return
      }
      if (action === 'import') onRangeApplied?.(importSince, importUntil)
      else onRangeApplied?.(since, until)
      onSynced?.()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 rounded-xl gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="h-3.5 w-3.5" />
        Config. campañas
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configuración de campañas</DialogTitle>
            <DialogDescription>
              Fechas, sincronización con Meta e importación de histórico.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 text-sm">
            {lastSync && (
              <p className="text-xs text-gray-500">
                Última sync: {lastSync}
                {lastError ? ` · ${lastError}` : ''}
              </p>
            )}

            {access && (!access.ready || access.missing.length > 0) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-1.5 text-amber-950">
                <p className="font-medium text-xs">Faltan credenciales de Marketing API</p>
                <ul className="list-disc pl-4 text-xs space-y-0.5">
                  {access.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                {access.warnings.map((w) => (
                  <p key={w} className="text-xs text-amber-800">
                    {w}
                  </p>
                ))}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Periodo del dashboard</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-gray-500">
                  Desde
                  <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="mt-1 h-9 w-[150px] rounded-xl" />
                </label>
                <label className="text-xs text-gray-500">
                  Hasta
                  <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="mt-1 h-9 w-[150px] rounded-xl" />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl h-9"
                  onClick={() => {
                    onRangeApplied?.(since, until)
                    setOpen(false)
                  }}
                >
                  Aplicar
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Importar histórico</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-gray-500">
                  Desde
                  <Input type="date" value={importSince} onChange={(e) => setImportSince(e.target.value)} className="mt-1 h-9 w-[150px] rounded-xl" />
                </label>
                <label className="text-xs text-gray-500">
                  Hasta
                  <Input type="date" value={importUntil} onChange={(e) => setImportUntil(e.target.value)} className="mt-1 h-9 w-[150px] rounded-xl" />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl h-9"
                  disabled={syncing}
                  onClick={() => void postSync('import')}
                >
                  <Download className={cn('h-3.5 w-3.5 mr-1', syncing && 'animate-pulse')} />
                  Importar
                </Button>
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <Button
              type="button"
              className="rounded-xl w-full"
              disabled={syncing}
              onClick={() => void postSync('sync')}
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', syncing && 'animate-spin')} />
              Sincronizar ahora
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
