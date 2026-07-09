import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw, Eye } from 'lucide-react'

interface InvoiceRow {
  id: number
  invoice_number: string
  status: string
  subtotal: number
  iva: number
  total: number
  issue_date: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

const statusLabel: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  cancelled: 'Anulada',
}

export default function DeveloperFacturasPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/developer/invoices')
      .then((r) => r.json())
      .then((d) => setRows(d.invoices || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Layout>
      <div className="w-full max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Mis facturas</h1>
            <p className="text-sm text-gray-500">Facturas a Buffalo AI (con IVA). Visibles en el panel admin.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 h-9 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Link href="/developer/facturas/nueva">
              <Button className="gap-2 rounded-xl">
                <Plus className="h-4 w-4" />
                Nueva factura
              </Button>
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400 px-6">
              Aún no has emitido facturas.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600">
                  <th className="px-4 py-3 text-left font-medium">Número</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Base</th>
                  <th className="px-4 py-3 text-right font-medium">IVA</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-left font-medium">Fecha</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                    <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{statusLabel[inv.status] || inv.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(inv.subtotal)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(inv.iva)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(inv.total)}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(inv.issue_date).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/developer/facturas/${inv.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  )
}
