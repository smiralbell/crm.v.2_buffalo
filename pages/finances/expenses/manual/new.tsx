import { useState } from 'react'
import { useRouter } from 'next/router'
import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface NewExpenseProps {
  concepts: string[]
}

export const getServerSideProps: GetServerSideProps<NewExpenseProps> = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  const result = await query<{ description: string | null }>(
    `SELECT DISTINCT description
       FROM bank_transactions
       WHERE amount < 0
         AND description IS NOT NULL
         AND description <> ''
       ORDER BY description ASC
       LIMIT 500`
  )

  const concepts = result.rows
    .map((row) => row.description || '')
    .filter((d) => d && d.trim().length > 0)

  return {
    props: {
      concepts,
    },
  }
}

export default function NewExpense({ concepts }: NewExpenseProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    base_amount: '',
    iva_percent: '21',
    irpf_amount: '0',
  })
  const [file, setFile] = useState<File | null>(null)
  const [showConceptSuggestions, setShowConceptSuggestions] = useState(false)

  const filteredConcepts = formData.name
    ? concepts
        .filter((c) => c.toLowerCase().includes(formData.name.toLowerCase()))
        .slice(0, 10)
    : concepts.slice(0, 10)

  const calculateTotal = () => {
    const base = parseFloat(formData.base_amount) || 0
    const ivaPercent = parseFloat(formData.iva_percent) || 0
    const iva = base * (ivaPercent / 100)
    const irpf = parseFloat(formData.irpf_amount) || 0
    return base + iva - irpf
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!file) {
      setError('Debes adjuntar la factura del gasto (archivo).')
      setLoading(false)
      return
    }

    const baseAmount = parseFloat(formData.base_amount) || 0
    const ivaPercent = parseFloat(formData.iva_percent) || 0
    const ivaAmount = baseAmount * (ivaPercent / 100)
    const irpfAmount = parseFloat(formData.irpf_amount) || 0
    const totalAmount = baseAmount + ivaAmount - irpfAmount

    try {
      // 1) Registrar el gasto manual en nuestra BD
      const res = await fetch('/api/finances/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          date_start: formData.date,
          date_end: formData.date,
          base_amount: baseAmount,
          iva_amount: ivaAmount,
          irpf_amount: irpfAmount,
          total_amount: totalAmount,
          tags: [],
          person_name: null,
          project: null,
          client_name: null,
          notes: null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al crear gasto')
        setLoading(false)
        return
      }

      const expenseId = data.expense?.id ?? data.id

      const uploadData = new FormData()
      uploadData.append('file', file)
      uploadData.append('file_name', file.name || `gasto_${expenseId}.pdf`)

      const uploadRes = await fetch(`/api/finances/expenses/${expenseId}/send-to-drive`, {
        method: 'POST',
        body: uploadData,
      })

      if (!uploadRes.ok) {
        const uploadError = await uploadRes.json().catch(() => ({}))
        await fetch(`/api/finances/expenses/${expenseId}`, { method: 'DELETE' }).catch(() => null)
        setError(uploadError.error || 'No se pudo subir la factura del gasto a Google Drive.')
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
      <div className="min-h-[calc(100vh-80px)] flex flex-col items-center pt-8">
        <div className="w-full max-w-xl space-y-6">
          <div className="flex items-center gap-4">
            <Link href="/finances/expenses">
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Datos del gasto</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Concepto *</Label>
                    <div className="relative">
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => {
                          const value = e.target.value
                          setFormData({ ...formData, name: value })
                          setShowConceptSuggestions(true)
                        }}
                        onFocus={() => setShowConceptSuggestions(true)}
                        required
                        placeholder="Ej: SUSCRIPCIÓN SOFTWARE, ALQUILER..."
                      />
                      {showConceptSuggestions && filteredConcepts.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                          {filteredConcepts.map((concept) => (
                            <button
                              type="button"
                              key={concept}
                              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                              onMouseDown={(e) => {
                                e.preventDefault()
                                setFormData({ ...formData, name: concept })
                                setShowConceptSuggestions(false)
                              }}
                            >
                              {concept}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                    <Label htmlFor="irpf_amount">IRPF (€)</Label>
                    <Input
                      id="irpf_amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.irpf_amount}
                      onChange={(e) => setFormData({ ...formData, irpf_amount: e.target.value })}
                    />
                    <p className="text-xs text-gray-400">Por defecto 0</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Total</Label>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-medium">
                      €{calculateTotal().toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invoice_file">Factura adjunta (archivo)</Label>
                  <Input
                    id="invoice_file"
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) => {
                      const selected = e.target.files?.[0] || null
                      setFile(selected)
                    }}
                  />
                  <p className="text-xs text-gray-500">
                    Sube el PDF o imagen de la factura de este gasto. Se enviará automáticamente al
                    sistema externo.
                  </p>
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
      </div>
    </Layout>
  )
}

