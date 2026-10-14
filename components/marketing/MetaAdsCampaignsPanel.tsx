'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { monthDateBounds } from '@/lib/integrations/meta/ads-parse'
import type { MetaAdsCampaignListRow } from '@/lib/integrations/meta/ads-list'
import type { MetaAdsAccessReport } from '@/lib/integrations/meta/ads-access'
import { ChevronDown, ChevronUp, Download, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

type Payload = {
  since: string
  until: string
  campaigns: MetaAdsCampaignListRow[]
  summary: {
    campaigns: number
    spend: number | null
    impressions: number | null
    link_clicks: number | null
    landing_page_views: number | null
    leads_meta: number | null
    crm_leads: number
    cpc: number | null
    cost_per_lead: number | null
    reach: number | null
    reach_available: boolean
  }
  access: MetaAdsAccessReport
  sync: { ad_account_id: string; last_synced_at: string | null; last_error: string | null }[]
}

const statusClass: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-800 border-amber-200',
  CAMPAIGN_PAUSED: 'bg-amber-50 text-amber-800 border-amber-200',
  ARCHIVED: 'bg-gray-100 text-gray-600 border-gray-200',
  DELETED: 'bg-red-50 text-red-700 border-red-200',
  WITH_ISSUES: 'bg-red-50 text-red-700 border-red-200',
}

function money(n: number | null, currency?: string | null) {
  if (n == null) return null
  return n.toLocaleString('es-ES', {
    style: 'currency',
    currency: currency === 'USD' ? 'USD' : 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function int(n: number | null) {
  if (n == null) return null
  return n.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}

function Cell({
  value,
  title,
}: {
  value: string | null
  title?: string
}) {
  if (value == null) {
    return (
      <span className="text-gray-400" title={title || 'Meta no envió este dato'}>
        No disponible
      </span>
    )
  }
  return <span title={title}>{value}</span>
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string
  value: string | null
  hint?: string
}) {
  return (
    <Card className="shadow-sm border-gray-200/80">
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-semibold text-gray-900 mt-0.5 leading-tight">
          {value ?? <span className="text-gray-400 text-lg font-medium">No disponible</span>}
        </p>
        {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function fmtDay(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function MetaAdsCampaignsPanel({ period }: { period: string }) {
  const month = useMemo(() => monthDateBounds(period), [period])
  const [since, setSince] = useState(month.since)
  const [until, setUntil] = useState(month.until)
  const [applied, setApplied] = useState(month)
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [importSince, setImportSince] = useState(month.since)
  const [importUntil, setImportUntil] = useState(month.until)

  useEffect(() => {
    setSince(month.since)
    setUntil(month.until)
    setApplied(month)
    setImportSince(month.since)
    setImportUntil(month.until)
  }, [month.since, month.until])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ since: applied.since, until: applied.until })
      const res = await fetch(`/api/marketing/meta-campaigns?${qs}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'No se pudieron cargar las campañas')
        return
      }
      setData(json)
    } finally {
      setLoading(false)
    }
  }, [applied.since, applied.until])

  useEffect(() => {
    void load()
  }, [load])

  const postSync = async (action: 'sync' | 'import') => {
    setSyncing(true)
    setError(null)
    try {
      const body =
        action === 'import'
          ? { action, since: importSince, until: importUntil }
          : { action: 'sync', since: applied.since, until: applied.until }
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
      if (action === 'import') {
        setSince(importSince)
        setUntil(importUntil)
        setApplied({ since: importSince, until: importUntil })
        return
      }
      await load()
    } finally {
      setSyncing(false)
    }
  }

  const access = data?.access
  const currency = data?.campaigns.find((c) => c.currency)?.currency || 'EUR'
  const lastSync = data?.sync?.[0]?.last_synced_at
    ? new Date(data.sync[0].last_synced_at).toLocaleString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-500">
            Desde
            <Input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="mt-1 h-9 w-[150px] rounded-xl"
            />
          </label>
          <label className="text-xs text-gray-500">
            Hasta
            <Input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="mt-1 h-9 w-[150px] rounded-xl"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl h-9"
            onClick={() => setApplied({ since, until })}
          >
            Aplicar fechas
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-500">
            Histórico desde
            <Input
              type="date"
              value={importSince}
              onChange={(e) => setImportSince(e.target.value)}
              className="mt-1 h-9 w-[150px] rounded-xl"
            />
          </label>
          <label className="text-xs text-gray-500">
            hasta
            <Input
              type="date"
              value={importUntil}
              onChange={(e) => setImportUntil(e.target.value)}
              className="mt-1 h-9 w-[150px] rounded-xl"
            />
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
            Importar histórico
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl h-9"
            disabled={syncing || loading}
            onClick={() => void postSync('sync')}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', (syncing || loading) && 'animate-spin')} />
            Sincronizar
          </Button>
        </div>
      </div>

      {lastSync && (
        <p className="text-[11px] text-gray-400">
          Última sync: {lastSync}
          {data?.sync?.[0]?.last_error ? ` · ${data.sync[0].last_error}` : ''}
        </p>
      )}

      {access && (!access.ready || access.missing.length > 0) && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="py-4 space-y-2 text-sm text-amber-950">
            <p className="font-medium">Faltan credenciales de Marketing API</p>
            {access.missing.length > 0 && (
              <ul className="list-disc pl-5 text-xs space-y-1">
                {access.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
            {access.warnings.map((w) => (
              <p key={w} className="text-xs text-amber-800">
                {w}
              </p>
            ))}
            {access.token_present && (
              <p className="text-xs text-amber-800">
                Token presente ({access.token_source}
                {access.token_kind ? `, ${access.token_kind}` : ''}
                {access.ads_read == null ? '' : access.ads_read ? ', ads_read sí' : ', ads_read no'}). No se muestra el secreto.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Kpi label="Campañas" value={int(data?.summary.campaigns ?? null)} />
        <Kpi label="Gasto" value={money(data?.summary.spend ?? null, currency)} />
        <Kpi label="Impresiones" value={int(data?.summary.impressions ?? null)} />
        <Kpi
          label="Alcance"
          value={data?.summary.reach_available ? int(data.summary.reach) : null}
          hint="Único del periodo; no se suma entre campañas"
        />
        <Kpi label="Clics enlace" value={int(data?.summary.link_clicks ?? null)} hint="No son visitas a destino" />
        <Kpi label="Visitas destino" value={int(data?.summary.landing_page_views ?? null)} />
        <Kpi
          label="Leads CRM"
          value={int(data?.summary.crm_leads ?? null)}
          hint={data?.summary.leads_meta != null ? `Meta: ${int(data.summary.leads_meta)}` : undefined}
        />
      </div>

      {loading ? (
        <Card className="border-gray-200/80">
          <CardContent className="py-12 flex justify-center text-sm text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Cargando campañas de Meta…
          </CardContent>
        </Card>
      ) : !data?.campaigns.length ? (
        <Card className="border-gray-200/80">
          <CardContent className="py-10 text-center text-sm text-gray-500">
            Aún no hay campañas sincronizadas. Cuando el token tenga ads_read, pulsa Sincronizar o espera al cron horario.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="p-3">Campaña</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Presupuesto</th>
                  <th className="p-3 text-right">Gasto</th>
                  <th className="p-3 text-right">Impresiones</th>
                  <th className="p-3 text-right">Alcance</th>
                  <th className="p-3 text-right">Clics enlace</th>
                  <th className="p-3 text-right">Visitas destino</th>
                  <th className="p-3 text-right">Leads Meta</th>
                  <th className="p-3 text-right">Leads CRM</th>
                  <th className="p-3 text-right">CPC</th>
                  <th className="p-3 text-right">Coste/lead</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.campaigns.map((row) => {
                  const open = expandedId === row.id
                  const budget = row.daily_budget != null
                    ? `${money(row.daily_budget, row.currency)}/día`
                    : row.lifetime_budget != null
                      ? `${money(row.lifetime_budget, row.currency)} total`
                      : null
                  return (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-gray-50/60 align-top">
                        <td className="p-3 min-w-[180px]">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => setExpandedId(open ? null : row.id)}
                          >
                            <p className="font-medium text-gray-900 flex items-center gap-1">
                              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              {row.name}
                            </p>
                          </button>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5 pl-5">{row.id}</p>
                          {(row.start_time || row.stop_time) && (
                            <p className="text-[10px] text-gray-400 pl-5">
                              {row.start_time ? fmtDay(row.start_time.slice(0, 10)) : '—'}
                              {' → '}
                              {row.stop_time ? fmtDay(row.stop_time.slice(0, 10)) : 'activa'}
                            </p>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {row.status ? (
                            <Badge
                              variant="outline"
                              className={cn('text-[10px]', statusClass[row.status] || 'bg-gray-50 text-gray-700')}
                            >
                              {row.status}
                            </Badge>
                          ) : (
                            <Cell value={null} />
                          )}
                        </td>
                        <td className="p-3 text-right text-xs whitespace-nowrap">
                          <Cell value={budget} />
                        </td>
                        <td className="p-3 text-right text-xs whitespace-nowrap">
                          <Cell value={money(row.spend, row.currency)} />
                        </td>
                        <td className="p-3 text-right text-xs">
                          <Cell value={int(row.impressions)} />
                        </td>
                        <td className="p-3 text-right text-xs">
                          <Cell
                            value={row.reach_available ? int(row.reach) : null}
                            title="Alcance único del periodo seleccionado (no se suman los días)"
                          />
                        </td>
                        <td className="p-3 text-right text-xs">
                          <Cell value={int(row.link_clicks)} title="Clics en enlaces, no visitas a la landing" />
                        </td>
                        <td className="p-3 text-right text-xs">
                          <Cell value={int(row.landing_page_views)} title="Landing page views" />
                        </td>
                        <td className="p-3 text-right text-xs">
                          <Cell value={int(row.leads_meta)} />
                        </td>
                        <td className="p-3 text-right text-xs">
                          {row.crm_leads > 0 ? (
                            <Link
                              href="/marketing?tab=meta&meta=leads"
                              className="text-blue-600 hover:underline font-medium"
                            >
                              {int(row.crm_leads)}
                            </Link>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="p-3 text-right text-xs whitespace-nowrap">
                          <Cell value={money(row.cpc, row.currency)} title="Gasto / clics en enlace del periodo" />
                        </td>
                        <td className="p-3 text-right text-xs whitespace-nowrap">
                          <Cell
                            value={money(row.cost_per_lead, row.currency)}
                            title="Gasto / leads Meta del periodo"
                          />
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-gray-50/70">
                          <td colSpan={12} className="p-4">
                            {row.days.length === 0 ? (
                              <p className="text-xs text-gray-500">
                                Sin estadísticas diarias en este rango. Importa el histórico o espera a la sync.
                              </p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500 text-left">
                                    <th className="py-1 pr-3">Día</th>
                                    <th className="py-1 pr-3 text-right">Gasto</th>
                                    <th className="py-1 pr-3 text-right">Impresiones</th>
                                    <th className="py-1 pr-3 text-right">Alcance (día)</th>
                                    <th className="py-1 pr-3 text-right">Clics</th>
                                    <th className="py-1 pr-3 text-right">Visitas</th>
                                    <th className="py-1 pr-3 text-right">Leads</th>
                                    <th className="py-1 text-right">CPC</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.days.map((d) => (
                                    <tr key={d.date} className="border-t border-gray-100">
                                      <td className="py-1 pr-3">{fmtDay(d.date)}</td>
                                      <td className="py-1 pr-3 text-right">{money(d.spend, row.currency) ?? '—'}</td>
                                      <td className="py-1 pr-3 text-right">{int(d.impressions) ?? '—'}</td>
                                      <td className="py-1 pr-3 text-right">{int(d.reach) ?? '—'}</td>
                                      <td className="py-1 pr-3 text-right">{int(d.link_clicks) ?? '—'}</td>
                                      <td className="py-1 pr-3 text-right">{int(d.landing_page_views) ?? '—'}</td>
                                      <td className="py-1 pr-3 text-right">{int(d.leads_meta) ?? '—'}</td>
                                      <td className="py-1 text-right">{money(d.cpc, row.currency) ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
