'use client'

import { useEffect, useState } from 'react'
import { Loader2, Pencil, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { currentPeriod } from '@/lib/leads/analytics.types'

type CostChannelKey = 'meta' | 'google' | 'email' | 'cold_calling'
type CostKind = 'setup' | 'monthly' | 'commission'

const COST_CHANNEL_LABELS: Record<CostChannelKey, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  email: 'Email marketing',
  cold_calling: 'Cold calling',
}

type CostLine = {
  channel: CostChannelKey
  cost_kind: CostKind
  label: string
  spend_eur: number
  source: string
  bank_eur: number
  metrics_eur: number
  manual_eur: number | null
  bank_items?: Array<{ description: string; amount: number; date: string }>
}

type CostChannel = {
  channel: CostChannelKey
  label: string
  lead_channel: string
  model: string
  total_eur: number
  source: string
  lines: CostLine[]
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  bank: 'Banco',
  marketing_metrics: 'Metrics',
  default_email: 'Estimado 500 €',
  none: 'Sin coste',
  mixed: 'Mixto',
}

function lineDraftKey(channel: string, kind: string) {
  return `${channel}:${kind}`
}

/** Formulario embebible (Marketing / Finanzas / Dashboard) — sincronizado vía API */
export function ChannelCostsForm({
  period,
  filterChannel,
  onSaved,
  compact,
}: {
  period: string
  filterChannel?: CostChannelKey | null
  onSaved?: () => void
  compact?: boolean
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<CostChannel[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const qs = [
    `period=${encodeURIComponent(period)}`,
    filterChannel ? `channel=${encodeURIComponent(filterChannel)}` : '',
  ]
    .filter(Boolean)
    .join('&')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/leads/channel-costs?${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      const channels: CostChannel[] = json.channels || []
      setRows(channels)
      const next: Record<string, string> = {}
      for (const ch of channels) {
        for (const line of ch.lines) {
          next[lineDraftKey(ch.channel, line.cost_kind)] =
            line.manual_eur != null
              ? String(line.manual_eur)
              : line.spend_eur > 0
                ? String(line.spend_eur)
                : ''
        }
      }
      setDrafts(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, filterChannel])

  const saveLine = async (channel: CostChannelKey, cost_kind: CostKind) => {
    const key = lineDraftKey(channel, cost_kind)
    setSaving(key)
    setError('')
    try {
      const spend_eur = Number(String(drafts[key] || '0').replace(',', '.'))
      const res = await fetch(`/api/leads/channel-costs?period=${encodeURIComponent(period)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, cost_kind, spend_eur }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      setRows(json.channels || [])
      onSaved?.()
      window.dispatchEvent(new CustomEvent('buffalo:channel-costs-updated', { detail: { period } }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(null)
    }
  }

  const clearChannel = async (channel: CostChannelKey) => {
    setSaving(channel)
    setError('')
    try {
      const res = await fetch(`/api/leads/channel-costs?period=${encodeURIComponent(period)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, clear: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      setRows(json.channels || [])
      onSaved?.()
      window.dispatchEvent(new CustomEvent('buffalo:channel-costs-updated', { detail: { period } }))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(null)
    }
  }

  useEffect(() => {
    const onSync = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { period?: string } | undefined
      if (!detail?.period || detail.period === period) void load()
    }
    window.addEventListener('buffalo:channel-costs-updated', onSync)
    return () => window.removeEventListener('buffalo:channel-costs-updated', onSync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, filterChannel])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {rows.map((r) => (
        <div
          key={r.channel}
          className="rounded-xl border border-gray-100 bg-gray-50/80 px-3.5 py-3"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">{r.label}</p>
              <p className="text-[11px] text-gray-500">{r.model}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900">
                {r.total_eur.toLocaleString('es-ES')} €
              </p>
              <p className="text-[10px] text-gray-400">{SOURCE_LABEL[r.source] || r.source}</p>
            </div>
          </div>
          <div className="space-y-3">
            {r.lines.map((line) => {
              const key = lineDraftKey(r.channel, line.cost_kind)
              const autoBank = line.source === 'bank' && line.manual_eur == null
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-24 shrink-0">
                      {line.label}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className={`h-9 rounded-lg max-w-[140px] ${
                        autoBank ? 'border-emerald-200 bg-emerald-50/50' : ''
                      }`}
                      value={drafts[key] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      placeholder="0"
                    />
                    <span className="text-xs text-gray-500">€</span>
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 rounded-lg gap-1"
                      disabled={saving === key}
                      onClick={() => void saveLine(r.channel, line.cost_kind)}
                    >
                      {saving === key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {autoBank ? 'Fijar' : 'Guardar'}
                    </Button>
                    {line.manual_eur != null ? (
                      <span className="text-[10px] font-medium text-emerald-700">manual</span>
                    ) : autoBank ? (
                      <span className="text-[10px] font-medium text-emerald-700">
                        auto banco
                      </span>
                    ) : null}
                  </div>
                  {line.bank_eur > 0 && (
                    <div className="pl-[6.5rem] space-y-0.5">
                      <p className="text-[10px] text-emerald-800">
                        Detectado en banco: {line.bank_eur.toLocaleString('es-ES')} €
                        {line.manual_eur != null ? ' (override manual activo)' : ' → ya aplicado'}
                      </p>
                      {(line.bank_items || []).slice(0, 3).map((it, i) => (
                        <p key={i} className="text-[10px] text-gray-400 truncate font-mono">
                          {it.date} · {it.description} · {it.amount.toLocaleString('es-ES')} €
                        </p>
                      ))}
                      {(line.bank_items || []).length > 3 && (
                        <p className="text-[10px] text-gray-400">
                          +{(line.bank_items || []).length - 3} más
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {r.lines.some((l) => l.manual_eur != null) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2 h-8 rounded-lg gap-1 text-gray-500 px-0"
              disabled={saving === r.channel}
              onClick={() => void clearChannel(r.channel)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Quitar overrides de {r.label}
            </Button>
          )}
        </div>
      ))}
      <p className="text-[11px] text-gray-400 leading-snug">
        Si el banco trae conceptos tipo <span className="font-mono">MKT META MENSUAL</span>,{' '}
        <span className="font-mono">MKT GOOGLE SETUP</span>,{' '}
        <span className="font-mono">MKT EMAIL MENSUAL</span> o{' '}
        <span className="font-mono">MKT COLDCALL COMISION…</span>, el importe se coloca solo en el
        campo correspondiente. Solo pulsa “Fijar/Guardar” si quieres un override manual.
      </p>
    </div>
  )
}

export default function ChannelCostsEditor({
  period,
  periodLabel,
  onSaved,
  filterChannel,
  triggerLabel = 'Costes manuales',
  dialogTitle,
}: {
  period?: string
  periodLabel?: string
  onSaved?: () => void
  filterChannel?: CostChannelKey | null
  triggerLabel?: string
  dialogTitle?: string
}) {
  const [open, setOpen] = useState(false)
  const [localPeriod, setLocalPeriod] = useState(period || currentPeriod())

  useEffect(() => {
    if (period) setLocalPeriod(period)
  }, [period])

  const title =
    dialogTitle ||
    (filterChannel ? `Costes ${COST_CHANNEL_LABELS[filterChannel]}` : 'Costes por canal')

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 rounded-xl gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {periodLabel || localPeriod} · setup y mensualidad (o comisión). Prioridad sobre banco.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <ChannelCostsForm
              period={localPeriod}
              filterChannel={filterChannel}
              onSaved={onSaved}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
