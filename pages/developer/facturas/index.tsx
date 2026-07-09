import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw, Eye, Trash2, FileText, Upload, Loader2 } from 'lucide-react'

interface InvoiceRow {
  id: number
  invoice_number: string
  status: string
  subtotal: number
  iva: number
  total: number
  issue_date: string
  has_pdf: boolean
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
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    fetch('/api/developer/invoices')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.hint || d.error || 'Error al cargar')
        setRows(d.invoices || [])
      })
      .catch((e: Error) => {
        setRows([])
        setError(e.message)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (inv: InvoiceRow) => {
    if (!confirm(`¿Eliminar la factura ${inv.invoice_number}?`)) return
    setDeletingId(inv.id)
    try {
      const res = await fetch(`/api/developer/invoices/${inv.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.hint || data.error || 'No se pudo eliminar')
        return
      }
      load()
    } finally {
      setDeletingId(null)
    }
  }

  const uploadPdf = async (inv: InvoiceRow, file: File) => {
    setUploadingId(inv.id)
    try {
      const formData = new FormData()
      formData.append('pdf', file)
      const res = await fetch(`/api/developer/invoices/${inv.id}/pdf`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.hint || data.error || 'Error al subir PDF')
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al subir PDF')
    } finally {
      setUploadingId(null)
    }
  }

  return (
    <Layout>
      <div className="w-full max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Mis facturas</h1>
            <p className="text-sm text-gray-500">
              Importes + PDF adjunto. Visibles en el panel admin de facturas.
            </p>
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

        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>
          ) : rows.length === 0 && !error ? (
            <div className="py-16 text-center text-sm text-gray-400 px-6">
              Aún no has emitido facturas.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 text-left font-medium">Número</th>
                    <th className="px-4 py-3 text-left font-medium">Estado</th>
                    <th className="px-4 py-3 text-left font-medium">PDF</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 text-left font-medium">Fecha</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{statusLabel[inv.status] || inv.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {inv.has_pdf ? (
                          <a
                            href={`/api/developer/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Ver PDF
                          </a>
                        ) : (
                          <span className="text-xs text-amber-600">Sin PDF</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {fmt(inv.total)}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(inv.issue_date).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {!inv.has_pdf && (
                            <>
                              <input
                                ref={(el) => {
                                  fileRefs.current[inv.id] = el
                                }}
                                type="file"
                                accept="application/pdf,.pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) uploadPdf(inv, f)
                                  e.target.value = ''
                                }}
                              />
                              <button
                                type="button"
                                disabled={uploadingId === inv.id}
                                onClick={() => fileRefs.current[inv.id]?.click()}
                                className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
                              >
                                {uploadingId === inv.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Upload className="h-3.5 w-3.5" />
                                )}
                                Subir PDF
                              </button>
                            </>
                          )}
                          <Link
                            href={`/developer/facturas/${inv.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:underline"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Ver
                          </Link>
                          <button
                            type="button"
                            disabled={deletingId === inv.id}
                            onClick={() => handleDelete(inv)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {deletingId === inv.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
