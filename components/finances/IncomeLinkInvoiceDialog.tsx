import { useMemo, useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Sparkles } from 'lucide-react'
import {
  rankInvoiceLinkSuggestions,
  filterInvoicesForSearch,
  type InvoiceLinkCandidate,
} from '@/lib/finance/invoice-link-suggestions'

export interface InvoiceForLink {
  id: number
  invoice_number: string
  client_name: string
  total: number
  subtotal: number
  iva: number
  issue_date: string
  bank_transaction_id?: string | null
}

interface IncomeLinkInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  income: { id: string; amount: number; description: string; date: string } | null
  invoices: InvoiceForLink[]
  formatCurrency: (n: number) => string
  onSubmit: (invoiceId: number) => Promise<void>
  loading: boolean
  error: string | null
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function InvoiceOption({
  inv,
  selected,
  onSelect,
  formatCurrency,
  suggested,
}: {
  inv: InvoiceForLink | InvoiceLinkCandidate
  selected: boolean
  onSelect: () => void
  formatCurrency: (n: number) => string
  suggested?: boolean
}) {
  const reasons = 'match_reasons' in inv ? inv.match_reasons : []
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
        selected
          ? 'border-indigo-500 bg-indigo-50/80 ring-1 ring-indigo-500/30'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {inv.invoice_number} · {inv.client_name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatDate(inv.issue_date)} · Base {formatCurrency(inv.subtotal)} + IVA{' '}
            {formatCurrency(inv.iva)}
          </p>
          {suggested && reasons.length > 0 && (
            <p className="text-[11px] text-indigo-600 mt-1 flex items-center gap-1">
              <Sparkles className="h-3 w-3 shrink-0" />
              {reasons.join(' · ')}
            </p>
          )}
        </div>
        <span className="text-sm font-semibold tabular-nums text-emerald-700 shrink-0">
          {formatCurrency(inv.total)}
        </span>
      </div>
    </button>
  )
}

export default function IncomeLinkInvoiceDialog({
  open,
  onOpenChange,
  income,
  invoices,
  formatCurrency,
  onSubmit,
  loading,
  error,
}: IncomeLinkInvoiceDialogProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (open) {
      setSelectedId(null)
      setSearch('')
    }
  }, [open, income?.id])

  const suggestions = useMemo(() => {
    if (!income) return []
    return rankInvoiceLinkSuggestions(income, invoices).slice(0, 5)
  }, [income, invoices])

  useEffect(() => {
    if (!open || !income || selectedId != null) return
    if (suggestions.length > 0) {
      setSelectedId(suggestions[0].id)
    }
  }, [open, income, suggestions, selectedId])

  const filtered = useMemo(() => {
    const list = filterInvoicesForSearch(invoices, search)
    const suggestedIds = new Set(suggestions.map((s) => s.id))
    return list.filter((inv) => !suggestedIds.has(inv.id))
  }, [invoices, search, suggestions])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId) return
    await onSubmit(selectedId)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Relacionar ingreso con factura</DialogTitle>
        </DialogHeader>
        {income && (
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-sm">
            <p className="font-medium text-slate-900 truncate">{income.description || 'Sin concepto'}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {formatDate(income.date)} ·{' '}
              <span className="font-semibold text-emerald-700">{formatCurrency(income.amount)}</span>
            </p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 min-h-0 flex-1">
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700/90">
                Sugerencias automáticas
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {suggestions.map((inv) => (
                  <InvoiceOption
                    key={inv.id}
                    inv={inv}
                    selected={selectedId === inv.id}
                    onSelect={() => setSelectedId(inv.id)}
                    formatCurrency={formatCurrency}
                    suggested
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Buscar otra factura
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nº factura, cliente o importe..."
                className="pl-9"
              />
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">
                  {invoices.length === 0
                    ? 'No hay facturas enviadas disponibles.'
                    : 'Sin resultados — prueba otro término.'}
                </p>
              ) : (
                filtered.slice(0, 20).map((inv) => (
                  <InvoiceOption
                    key={inv.id}
                    inv={inv}
                    selected={selectedId === inv.id}
                    onSelect={() => setSelectedId(inv.id)}
                    formatCurrency={formatCurrency}
                  />
                ))
              )}
              {filtered.length > 20 && (
                <p className="text-xs text-slate-400 text-center">
                  +{filtered.length - 20} más — afina la búsqueda
                </p>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter className="mt-auto">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !selectedId}>
              {loading ? 'Guardando...' : 'Vincular factura'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
