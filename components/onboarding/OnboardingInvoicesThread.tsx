'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Receipt } from 'lucide-react'

type Inv = {
  id: number
  invoice_number: string
  total: number
  status: string
  issue_date: string
}

const statusLabel: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  cancelled: 'Cancelada',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n)

type Props = {
  leadId: number
  className?: string
}

export default function OnboardingInvoicesThread({ leadId, className }: Props) {
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState<Inv[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/invoices?lead_id=${leadId}&page=1`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setInvoices(d.invoices || [])
      })
      .catch(() => {
        if (!cancelled) setInvoices([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [leadId])

  return (
    <section
      className={
        className ||
        'rounded-2xl border border-gray-200 bg-white px-5 py-5 sm:px-6 sm:py-6'
      }
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-gray-400" />
            Facturas de este onboarding
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Creadas en Facturas Buffalo y vinculadas a este proyecto
          </p>
        </div>
        <a
          href={`/invoices/new?lead=${leadId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
        >
          Nueva factura
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : invoices.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          Aún no hay facturas vinculadas a este onboarding.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-gray-50/80"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 tabular-nums">
                  {inv.invoice_number}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {statusLabel[inv.status] || inv.status} · {fmt(inv.total)}
                </p>
              </div>
              <a
                href={`/invoices/${inv.id}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Abrir
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
