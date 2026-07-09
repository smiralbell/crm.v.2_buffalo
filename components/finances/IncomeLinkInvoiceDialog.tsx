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
import { Textarea } from '@/components/ui/textarea'
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
  onSubmit: (invoiceId: number, options?: { noInvoiceNote?: string }) => Promise<void>
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
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
        selected
          ? 'border-indigo-500 bg-indigo-50/80 ring-1 ring-indigo-500/30'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate flex items-center gap-1.5">
            {suggested && <Sparkles className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
            {inv.invoice_number} · {inv.client_name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatDate(inv.issue_date)} · {formatCurrency(inv.total)}
          </p>
        </div>
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
  const [hasInvoicePdf, setHasInvoicePdf] = useState(true)
  const [noInvoiceNote, setNoInvoiceNote] = useState('')

  useEffect(() => {
    if (open) {
      setSelectedId(null)
      setSearch('')
      setHasInvoicePdf(true)
      setNoInvoiceNote('')
    }
  }, [open, income?.id])

  const suggestions = useMemo(() => {
    if (!income) return []
    return rankInvoiceLinkSuggestions(income, invoices).slice(0, 5)
  }, [income, invoices])

  const displayList = useMemo(() => {
    if (search.trim()) {
      return filterInvoicesForSearch(invoices, search).slice(0, 12)
    }
    return suggestions
  }, [search, invoices, suggestions])

  useEffect(() => {
    if (!open || !income || selectedId != null) return
    if (displayList.length > 0) {
      setSelectedId(displayList[0].id)
    }
  }, [open, income, displayList, selectedId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId) return
    await onSubmit(selectedId, hasInvoicePdf ? undefined : { noInvoiceNote: noInvoiceNote.trim() })
  }

  const suggestedIds = new Set(suggestions.map((s) => s.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle>Vincular factura emitida</DialogTitle>
        </DialogHeader>

        {income && (
          <div className="shrink-0 mx-6 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-sm">
            <p className="font-medium text-slate-900 truncate">{income.description || 'Sin concepto'}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {formatDate(income.date)} ·{' '}
              <span className="font-semibold text-emerald-700">{formatCurrency(income.amount)}</span>
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar factura..."
                  className="pl-9"
                />
              </div>
              {!search.trim() && suggestions.length > 0 && (
                <p className="text-xs text-indigo-600">Sugerencias según importe y fecha</p>
              )}
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {displayList.length === 0 ? (
                  <p className="text-sm text-slate-500 py-3 text-center">
                    {invoices.length === 0
                      ? 'No hay facturas disponibles.'
                      : 'Sin resultados.'}
                  </p>
                ) : (
                  displayList.map((inv) => (
                    <InvoiceOption
                      key={inv.id}
                      inv={inv}
                      selected={selectedId === inv.id}
                      onSelect={() => setSelectedId(inv.id)}
                      formatCurrency={formatCurrency}
                      suggested={!search.trim() && suggestedIds.has(inv.id)}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors ${
                    hasInvoicePdf
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setHasInvoicePdf(true)}
                >
                  Tengo factura
                </button>
                <button
                  type="button"
                  className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors ${
                    !hasInvoicePdf
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setHasInvoicePdf(false)}
                >
                  No tengo factura
                </button>
              </div>
              {!hasInvoicePdf && (
                <Textarea
                  id="no_invoice_note"
                  value={noInvoiceNote}
                  onChange={(e) => setNoInvoiceNote(e.target.value)}
                  placeholder="Nota opcional para el PDF..."
                  rows={2}
                />
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4 mt-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !selectedId}>
              {loading ? 'Guardando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
