import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'

interface ServiceLine {
  description: string
  quantity: number
  price: number
  tax: number
}

export default function NuevaFacturaDeveloperPage() {
  const router = useRouter()
  const [nextNumber, setNextNumber] = useState('')
  const [lines, setLines] = useState<ServiceLine[]>([
    { description: 'Desarrollo y mantenimiento', quantity: 1, price: 0, tax: 21 },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/developer/invoices')
      .then((r) => r.json())
      .then((d) => setNextNumber(d.next_invoice_number || ''))
      .catch(() => {})
  }, [])

  const lineTotal = (l: ServiceLine) => l.quantity * l.price * (1 + l.tax / 100)
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.price, 0)
  const iva = lines.reduce((s, l) => s + l.quantity * l.price * (l.tax / 100), 0)
  const total = subtotal + iva

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

  const updateLine = (idx: number, patch: Partial<ServiceLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const submit = async (status: 'draft' | 'sent') => {
    setSaving(true)
    setError('')
    try {
      const services = lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        price: l.price,
        tax: l.tax,
        total: Math.round(l.quantity * l.price * (1 + l.tax / 100) * 100) / 100,
      }))
      const res = await fetch('/api/developer/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          services,
          subtotal: Math.round(subtotal * 100) / 100,
          iva: Math.round(iva * 100) / 100,
          total: Math.round(total * 100) / 100,
          status,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.hint || data.error || 'Error al guardar')
      router.push(`/developer/facturas/${data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
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

        <div>
          <h1 className="text-lg font-semibold text-gray-900">Nueva factura</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cliente: Agencia Buffalo · {nextNumber && `Nº ${nextNumber}`}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
          {lines.map((line, idx) => (
            <div key={idx} className="grid gap-3 border-b border-gray-100 pb-4 last:border-0">
              <div>
                <Label className="text-xs">Concepto</Label>
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(idx, { description: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Cantidad</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Precio (sin IVA)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={line.price}
                    onChange={(e) => updateLine(idx, { price: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">IVA %</Label>
                  <Input
                    type="number"
                    value={line.tax}
                    onChange={(e) => updateLine(idx, { tax: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Línea: {fmt(lineTotal(line))}</span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setLines((p) => [...p, { description: '', quantity: 1, price: 0, tax: 21 }])
            }
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir línea
          </button>

          <div className="pt-4 border-t border-gray-100 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Base imponible</span>
              <span>{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>IVA</span>
              <span>{fmt(iva)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 text-base pt-1">
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={saving || total <= 0}
            onClick={() => submit('draft')}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar borrador'}
          </Button>
          <Button
            className="rounded-xl"
            disabled={saving || total <= 0}
            onClick={() => submit('sent')}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Emitir factura'}
          </Button>
        </div>
      </div>
    </Layout>
  )
}
