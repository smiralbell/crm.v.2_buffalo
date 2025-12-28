import { useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function NewPipeline() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [entityType, setEntityType] = useState<'client' | 'contact'>('contact')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    try {
      const res = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          entity_type: entityType,
        }),
      })

      if (!res.ok) {
        throw new Error('Error al crear pipeline')
      }

      const pipeline = await res.json()
      router.push(`/pipelines/${pipeline.id}`)
    } catch (error) {
      console.error('Error creating pipeline:', error)
      alert('Error al crear pipeline. Por favor, intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/pipelines">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Nuevo Pipeline</h1>
            <p className="text-gray-600 mt-1">Crea un nuevo pipeline Kanban</p>
          </div>
        </div>

        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle>Información del Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Pipeline
                </label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Ventas Q1 2025"
                  required
                />
              </div>

              <div>
                <label htmlFor="entity_type" className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Entidad
                </label>
                <Select value={entityType} onValueChange={(value: 'client' | 'contact') => setEntityType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contact">Contactos</SelectItem>
                    <SelectItem value="client">Clientes</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500 mt-2">
                  Selecciona si este pipeline gestionará contactos o clientes
                </p>
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={loading || !name.trim()}>
                  {loading ? 'Creando...' : 'Crear Pipeline'}
                </Button>
                <Link href="/pipelines">
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

