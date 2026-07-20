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
    const user = await requireAuth(context)
    if (user.role === 'comercial') {
      return { redirect: { destination: '/comercial/pipeline', permanent: false } }
    }
    if (user.role !== 'admin') {
      return { redirect: { destination: '/dashboard', permanent: false } }
    }
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
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 text-muted-foreground hover:border-foreground/25 hover:bg-card hover:text-foreground transition-all"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-medium">Nuevo pipeline</span>
          </button>
          {pipelines.map((pipeline) => (
            <Link key={pipeline.id} href={`/pipelines/${pipeline.id}`}>
              <Card className="hover:shadow-sm hover:border-foreground/15 transition-all cursor-pointer h-full">
                <CardContent className="pt-6">
                  <h3 className="text-base font-semibold text-foreground mb-3">{pipeline.name}</h3>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Tipo:{' '}
                      <span className="font-medium text-foreground/80">
                        {pipeline.entity_type === 'contact' ? 'Contactos' : 'Clientes'}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Tarjetas:{' '}
                      <span className="font-medium text-foreground/80">
                        {pipeline._count?.cards || 0}
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex min-h-[140px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card/50 p-6 text-center transition-all hover:border-foreground/30 hover:bg-muted/40"
          >
            <Plus className="mb-2 h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground/80">Nuevo pipeline</span>
            <span className="mt-1 text-xs text-muted-foreground">Clic para crear</span>
          </button>
        </div>

        {pipelines.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
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
                <label htmlFor="p-name" className="mb-2 block text-sm font-medium text-foreground">
                  Nombre
                </label>
                <Input
                  id="p-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Ventas Q2"
                  autoFocus
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Tipo de entidad</label>
                <Select value={entityType} onValueChange={(v: 'client' | 'contact') => setEntityType(v)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contact">Contactos</SelectItem>
                    <SelectItem value="client">Clientes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="rounded-xl" disabled={loading || !name.trim()}>
                  {loading ? 'Creando…' : 'Crear pipeline'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}
