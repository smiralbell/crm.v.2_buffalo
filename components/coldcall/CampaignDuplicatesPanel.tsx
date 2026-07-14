'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { stageLabel } from '@/lib/coldcall/lead-table'
import type { DuplicateCleanupStrategy, DuplicateGroup } from '@/lib/coldcall/duplicates'
import { formatPhoneForDisplay } from '@/lib/coldcall/whatsapp'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react'

interface CampaignDuplicatesPanelProps {
  campaignId?: number
  campaignName?: string
  onCleaned?: () => void
}

export default function CampaignDuplicatesPanel({
  campaignId,
  campaignName,
  onCleaned,
}: CampaignDuplicatesPanelProps) {
  const [loading, setLoading] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [summary, setSummary] = useState<{ groups: number; prospects: number; removable: number } | null>(
    null
  )
  const [strategy, setStrategy] = useState<DuplicateCleanupStrategy>(
    campaignId ? 'keep_in_campaign' : 'keep_most_calls'
  )
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [keepByGroup, setKeepByGroup] = useState<Record<string, number>>({})
  const [message, setMessage] = useState('')
  const [scanned, setScanned] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setMessage('')
    const params = campaignId ? `?campaignId=${campaignId}` : ''
    fetch(`/api/coldcall/duplicates${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setGroups(d.groups || [])
        setSummary(d.summary || null)
        const initialKeep: Record<string, number> = {}
        for (const g of d.groups || []) {
          initialKeep[g.match_key] = g.prospects[0]?.id
        }
        setKeepByGroup(initialKeep)
        setScanned(true)
      })
      .catch((e) => setMessage(e instanceof Error ? e.message : 'Error al buscar'))
      .finally(() => setLoading(false))
  }, [campaignId])

  useEffect(() => {
    load()
  }, [load])

  const toggleGroup = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const deleteIds = groups.flatMap((g) => {
    const keeper = keepByGroup[g.match_key] ?? g.prospects[0]?.id
    return g.prospects.filter((p) => p.id !== keeper).map((p) => p.id)
  })

  const runCleanup = async (dryRun: boolean) => {
    setCleaning(true)
    setMessage('')
    try {
      const keep_ids = groups.map((g) => keepByGroup[g.match_key]).filter(Boolean)
      const res = await fetch('/api/coldcall/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          strategy,
          keep_ids,
          dry_run: dryRun,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al limpiar')

      if (dryRun) {
        setMessage(
          `Vista previa: se eliminarían ${data.delete_ids?.length ?? 0} prospectos duplicados.`
        )
        return
      }

      setMessage(`Eliminados ${data.deleted} duplicados.`)
      onCleaned?.()
      load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error al limpiar')
    } finally {
      setCleaning(false)
    }
  }

  const applyStrategy = () => {
    const next: Record<string, number> = {}
    for (const g of groups) {
      if (strategy === 'keep_in_campaign' && campaignId) {
        const inCamp = g.prospects.filter((p) => p.campaign_id === campaignId)
        const pool = inCamp.length ? inCamp : g.prospects
        const sorted = [...pool].sort(
          (a, b) => b.call_count - a.call_count || a.created_at.localeCompare(b.created_at)
        )
        next[g.match_key] = sorted[0].id
      } else if (strategy === 'keep_most_calls') {
        const sorted = [...g.prospects].sort(
          (a, b) => b.call_count - a.call_count || a.created_at.localeCompare(b.created_at)
        )
        next[g.match_key] = sorted[0].id
      } else {
        const sorted = [...g.prospects].sort((a, b) => a.created_at.localeCompare(b.created_at))
        next[g.match_key] = sorted[0].id
      }
    }
    setKeepByGroup(next)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-100 p-2 text-amber-800">
            <Copy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Duplicados entre campañas</h1>
            <p className="text-sm text-gray-600 mt-1">
              Detecta el mismo contacto importado en varias campañas (por email, LinkedIn, teléfono o
              nombre+empresa). Puedes quedarte con uno y eliminar el resto.
              {campaignName ? (
                <>
                  {' '}
                  Filtrando campaña <strong>{campaignName}</strong>.
                </>
              ) : null}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl gap-2"
          onClick={load}
          disabled={loading || cleaning}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Volver a buscar
        </Button>
        {!campaignId && (
          <Button type="button" variant="ghost" className="rounded-xl" asChild>
            <Link href="/comercial/campanas">Ir a campañas</Link>
          </Button>
        )}
      </div>

      {summary && scanned && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong>{summary.groups}</strong> grupos duplicados · <strong>{summary.prospects}</strong>{' '}
          prospectos implicados · se pueden eliminar <strong>{summary.removable}</strong>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-14 text-center text-sm text-gray-500">
          {scanned
            ? 'No hay duplicados entre campañas en tu alcance.'
            : 'Pulsa buscar para analizar duplicados.'}
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
            <p className="text-sm font-medium text-gray-900">Regla automática</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  {
                    id: 'keep_in_campaign' as const,
                    label: campaignId ? 'Mantener de esta campaña' : 'Mantener de campaña indicada',
                    disabled: !campaignId,
                  },
                  {
                    id: 'keep_most_calls' as const,
                    label: 'Mantener el que más llamadas tiene',
                    disabled: false,
                  },
                  { id: 'keep_oldest' as const, label: 'Mantener el más antiguo', disabled: false },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={'disabled' in opt ? opt.disabled : false}
                  onClick={() => setStrategy(opt.id)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold border transition-colors ${
                    strategy === opt.id
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 disabled:opacity-40'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={applyStrategy}>
                Aplicar regla a todos
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {groups.map((group) => {
              const open = expanded[group.match_key] ?? true
              return (
                <div
                  key={group.match_key}
                  className="rounded-2xl border border-gray-200 bg-white overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.match_key)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{group.prospects[0]?.nombre}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {group.match_type === 'phone' ? 'Mismo teléfono' : 'Misma clave'} ·{' '}
                        {group.prospects.length} copias en {new Set(group.prospects.map((p) => p.campaign_id)).size}{' '}
                        campañas
                      </p>
                    </div>
                    {open ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </button>

                  {open && (
                    <div className="border-t border-gray-100 divide-y divide-gray-100">
                      {group.prospects.map((p) => {
                        const selected = keepByGroup[group.match_key] === p.id
                        return (
                          <label
                            key={p.id}
                            className={`flex items-start gap-3 px-4 py-3 cursor-pointer ${
                              selected ? 'bg-emerald-50/60' : 'hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`keep-${group.match_key}`}
                              checked={selected}
                              onChange={() =>
                                setKeepByGroup((prev) => ({ ...prev, [group.match_key]: p.id }))
                              }
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-sm text-gray-900">{p.campaign_name}</span>
                                {selected && (
                                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]">
                                    Mantener
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-[10px] font-normal">
                                  {stageLabel(p.stage)}
                                </Badge>
                                <span className="text-[11px] text-gray-400">
                                  {p.call_count} llamadas
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mt-1">
                                {p.empresa || 'Sin empresa'}
                                {p.telefono
                                  ? ` · ${formatPhoneForDisplay(p.telefono) || p.telefono}`
                                  : ''}
                                {p.email ? ` · ${p.email}` : ''}
                              </p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 space-y-3">
            <p className="text-sm text-red-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Se eliminarán <strong>{deleteIds.length}</strong> prospectos duplicados (soft delete). El
              que marques como &ldquo;Mantener&rdquo; en cada grupo se conserva.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={cleaning || deleteIds.length === 0}
                onClick={() => runCleanup(true)}
              >
                Vista previa
              </Button>
              <Button
                type="button"
                className="rounded-xl gap-2 bg-red-700 hover:bg-red-800"
                disabled={cleaning || deleteIds.length === 0}
                onClick={() => {
                  if (
                    !confirm(
                      `¿Eliminar ${deleteIds.length} duplicados? Esta acción no se puede deshacer fácilmente.`
                    )
                  ) {
                    return
                  }
                  runCleanup(false)
                }}
              >
                {cleaning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Eliminar duplicados
              </Button>
            </div>
          </div>
        </>
      )}

      {message && (
        <p
          className={`text-sm ${
            message.includes('Error') || message.includes('eliminarían 0') ? 'text-gray-600' : 'text-emerald-700'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  )
}
