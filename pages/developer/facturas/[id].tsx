import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function DeveloperFacturaDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const [invoice, setInvoice] = useState<{
    id: number
    invoice_number: string
    status: string
    subtotal: number
    iva: number
    total: number
    issue_date: string
    services: { description: string; quantity: number; price: number; tax: number; total: number }[]
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id || typeof id !== 'string') return
    fetch(`/api/developer/invoices/${id}`)
      .then((r) => r.json())
      .then((d) => setInvoice(d.invoice || null))
      .catch(() => setInvoice(null))
      .finally(() => setLoading(false))
  }, [id])

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

  return (
    <Layout>
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <Link
          href="/developer/facturas"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Mis facturas
        </Link>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : !invoice ? (
          <p className="text-sm text-gray-400 text-center py-12">Factura no encontrada.</p>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Factura</p>
                <h1 className="text-xl font-bold font-mono text-gray-900">{invoice.invoice_number}</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {new Date(invoice.issue_date).toLocaleDateString('es-ES')} · Cliente: Agencia Buffalo
                </p>
              </div>
              <Badge variant="secondary">{invoice.status}</Badge>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="py-2 text-left font-medium">Concepto</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.services || []).map((s, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2.5 text-gray-800">
                      {s.description}
                      <span className="block text-xs text-gray-400">
                        {s.quantity} × {fmt(s.price)} + {s.tax}% IVA
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium">{fmt(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t pt-4 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Base</span>
                <span>{fmt(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>IVA</span>
                <span>{fmt(invoice.iva)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 text-lg pt-1">
                <span>Total con IVA</span>
                <span>{fmt(invoice.total)}</span>
              </div>
            </div>

            <p className="text-xs text-gray-400 border-t pt-4">
              Esta factura aparece en el panel admin de Facturas con la etiqueta Developer.
            </p>
          </div>
        )}
      </div>
    </Layout>
  )
}
