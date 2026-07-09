import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, FileText, Loader2, Trash2, Upload } from 'lucide-react'

export default function DeveloperFacturaDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const fileRef = useRef<HTMLInputElement>(null)
  const [invoice, setInvoice] = useState<{
    id: number
    invoice_number: string
    status: string
    subtotal: number
    iva: number
    total: number
    issue_date: string
    has_pdf: boolean
    services: { description: string; quantity: number; price: number; tax: number; total: number }[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    if (!router.isReady || !id || typeof id !== 'string') return
    setLoading(true)
    setLoadError('')
    fetch(`/api/developer/invoices/${id}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.hint || d.error || 'Error al cargar')
        setInvoice(d.invoice || null)
      })
      .catch((e: Error) => {
        setInvoice(null)
        setLoadError(e.message)
      })
      .finally(() => setLoading(false))
  }, [router.isReady, id])

  useEffect(() => {
    load()
  }, [load])

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

  const uploadPdf = async (file: File) => {
    if (!invoice) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('pdf', file)
      const res = await fetch(`/api/developer/invoices/${invoice.id}/pdf`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.hint || data.error || 'Error al subir')
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al subir PDF')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!invoice) return
    if (!confirm(`¿Eliminar la factura ${invoice.invoice_number}?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/developer/invoices/${invoice.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.hint || data.error || 'No se pudo eliminar')
        return
      }
      router.push('/developer/facturas')
    } finally {
      setDeleting(false)
    }
  }

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
        ) : loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
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

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-gray-500">Documento PDF</p>
                  {invoice.has_pdf ? (
                    <a
                      href={`/api/developer/invoices/${invoice.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:underline mt-1"
                    >
                      <FileText className="h-4 w-4" />
                      Ver / descargar PDF
                    </a>
                  ) : (
                    <p className="text-sm text-amber-700 mt-1 font-medium">Falta adjuntar el PDF</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadPdf(f)
                      e.target.value = ''
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-xl"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {invoice.has_pdf ? 'Reemplazar PDF' : 'Subir PDF'}
                  </Button>
                </div>
              </div>
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

            <div className="border-t pt-4 flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="gap-2 rounded-xl text-red-600 border-red-200 hover:bg-red-50"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Eliminar factura
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
