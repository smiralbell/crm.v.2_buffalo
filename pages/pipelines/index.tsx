import { useState } from 'react'
import { useRouter } from 'next/router'
import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'
import Link from 'next/link'

interface Pipeline {
  id: string
  name: string
  entity_type: 'client' | 'contact'
  created_at: string
  _count?: { cards: number }
}

interface PipelinesPageProps {
  pipelines: Pipeline[]
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }

  try {
    const pipelines = await prisma.pipelineKanban.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: {
            cards: { where: { deleted_at: null } },
          },
        },
      },
    })

    return {
      props: {
        pipelines: pipelines.map((p) => ({
          id: p.id,
          name: p.name,
          entity_type: p.entity_type,
          created_at: p.created_at.toISOString(),
          _count: { cards: p._count.cards },
        })),
      },
    }
  } catch (error) {
    console.error('Error fetching pipelines:', error)
    return { props: { pipelines: [] } }
  }
}

export default function PipelinesPage({ pipelines }: PipelinesPageProps) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [entityType, setEntityType] = useState<'client' | 'contact'>('contact')
  const [loading, setLoading] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    try {
      const res = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), entity_type: entityType }),
      })
      if (!res.ok) throw new Error('Error al crear pipeline')
      const pipeline = await res.json()
      setCreateOpen(false)
      setName('')
      router.push(`/pipelines/${pipeline.id}`)
    } catch {
      alert('Error al crear pipeline. Por favor, intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pipelines.map((pipeline) => (
            <Link key={pipeline.id} href={`/pipelines/${pipeline.id}`}>
              <Card className="border border-gray-200/80 hover:shadow-sm transition-shadow cursor-pointer h-full">
                <CardContent className="pt-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-3">{pipeline.name}</h3>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-500">
                      Tipo: <span className="font-medium text-gray-700">{pipeline.entity_type === 'contact' ? 'Contactos' : 'Clientes'}</span>
                    </p>
                    <p className="text-sm text-gray-500">
                      Tarjetas: <span className="font-medium text-gray-700">{pipeline._count?.cards || 0}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white p-6 text-center transition-all hover:border-gray-400 hover:bg-gray-50/50"
          >
            <Plus className="mb-2 h-6 w-6 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">Nuevo pipeline</span>
            <span className="mt-1 text-xs text-gray-400">Clic para crear</span>
          </button>
        </div>

        {pipelines.length === 0 && (
          <p className="text-center text-sm text-gray-400">
            Aún no hay pipelines. Crea el primero con la caja de arriba.
          </p>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Nuevo pipeline</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="p-name" className="mb-2 block text-sm font-medium text-gray-700">
                  Nombre
                </label>
                <Input
                  id="p-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Ventas Q2"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Tipo de entidad</label>
                <Select value={entityType} onValueChange={(v: 'client' | 'contact') => setEntityType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contact">Contactos</SelectItem>
                    <SelectItem value="client">Clientes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading || !name.trim()}>
                  {loading ? 'Creando...' : 'Crear pipeline'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}
