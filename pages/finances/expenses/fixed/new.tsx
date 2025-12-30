import { useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NewFixedExpense() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    has_iva: false,
    iva_percent: '21',
    is_active: true,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/finances/expenses/fixed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
          iva_percent: formData.has_iva ? parseFloat(formData.iva_percent) : null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al crear gasto fijo')
        setLoading(false)
        return
      }

      router.push('/finances/expenses')
    } catch (err) {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-4">
          <Link href="/finances/expenses">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Nuevo Gasto Fijo</h1>
            <p className="text-gray-600 mt-1">Gasto que se repite cada mes automáticamente</p>
          </div>
        </div>

        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Datos del Gasto Fijo</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Ej: Cuota colegial, Alquiler, Seguros..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Importe Base (€) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="has_iva"
                  checked={formData.has_iva}
                  onChange={(e) => setFormData({ ...formData, has_iva: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="has_iva" className="font-normal cursor-pointer">
                  Tiene IVA
                </Label>
              </div>

              {formData.has_iva && (
                <div className="space-y-2">
                  <Label htmlFor="iva_percent">% IVA</Label>
                  <Input
                    id="iva_percent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.iva_percent}
                    onChange={(e) => setFormData({ ...formData, iva_percent: e.target.value })}
                  />
                </div>
              )}

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="is_active" className="font-normal cursor-pointer">
                  Activo (se aplicará cada mes)
                </Label>
              </div>

              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>
              )}

              <div className="flex justify-end gap-4">
                <Link href="/finances/expenses">
                  <Button type="button" variant="outline" disabled={loading}>
                    Cancelar
                  </Button>
                </Link>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Creando...' : 'Crear Gasto Fijo'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

