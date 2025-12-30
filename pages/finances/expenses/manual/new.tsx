import { useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NewExpense() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    base_amount: '',
    iva_percent: '21',
    person_name: '',
    project: '',
    client_name: '',
    notes: '',
  })

  const calculateTotal = () => {
    const base = parseFloat(formData.base_amount) || 0
    const ivaPercent = parseFloat(formData.iva_percent) || 0
    const iva = base * (ivaPercent / 100)
    return base + iva
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const baseAmount = parseFloat(formData.base_amount) || 0
    const ivaPercent = parseFloat(formData.iva_percent) || 0
    const ivaAmount = baseAmount * (ivaPercent / 100)
    const totalAmount = baseAmount + ivaAmount

    try {
      const res = await fetch('/api/finances/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          date: formData.date,
          base_amount: baseAmount,
          iva_amount: ivaAmount,
          total_amount: totalAmount,
          person_name: formData.person_name || null,
          project: formData.project || null,
          client_name: formData.client_name || null,
          notes: formData.notes || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al crear gasto')
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
            <h1 className="text-2xl font-semibold text-gray-900">Nuevo Gasto Variable</h1>
            <p className="text-sm text-gray-500 mt-1">Gasto puntual con fecha específica (freelancers, proveedores, etc.)</p>
          </div>
        </div>

        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Datos del Gasto</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Ej: Desarrollo web, Diseño..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Fecha *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="base_amount">Base (€) *</Label>
                  <Input
                    id="base_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.base_amount}
                    onChange={(e) => setFormData({ ...formData, base_amount: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="iva_percent">IVA %</Label>
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
                <div className="space-y-2">
                  <Label>Total</Label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-medium">
                    €{calculateTotal().toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="person_name">Persona/Proveedor</Label>
                  <Input
                    id="person_name"
                    value={formData.person_name}
                    onChange={(e) => setFormData({ ...formData, person_name: e.target.value })}
                    placeholder="Nombre del freelancer o proveedor"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client_name">Cliente</Label>
                  <Input
                    id="client_name"
                    value={formData.client_name}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                    placeholder="Cliente asociado (opcional)"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project">Proyecto</Label>
                <Input
                  id="project"
                  value={formData.project}
                  onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                  placeholder="Proyecto asociado (opcional)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  placeholder="Notas adicionales..."
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>
              )}

              <div className="flex justify-end gap-3">
                <Link href="/finances/expenses">
                  <Button type="button" variant="outline" disabled={loading}>
                    Cancelar
                  </Button>
                </Link>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Creando...' : 'Crear Gasto'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

