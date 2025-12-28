import { GetServerSideProps } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Search, Edit, Trash2, Eye, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

interface Lead {
  id: number
  estado: string
  valor: number | null
  contact: {
    id: number
    nombre: string | null
    email: string | null
  } | null
  created_at: string
}

interface LeadsPageProps {
  leads: Lead[]
  page: number
  totalPages: number
  search: string
  estado: string
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)

    const page = parseInt(context.query.page as string) || 1
    const search = (context.query.search as string) || ''
    const estado = (context.query.estado as string) || ''
    const pageSize = 10
    const skip = (page - 1) * pageSize

    const where: any = {}

    if (estado && estado !== 'all') {
      where.estado = estado
    }

    if (search) {
      where.contact = {
        OR: [
          { nombre: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          contact: {
            select: {
              id: true,
              nombre: true,
              email: true,
            },
          },
        },
      }),
      prisma.lead.count({ where }),
    ])

    const totalPages = Math.ceil(total / pageSize)

    return {
      props: {
        leads: leads.map((lead) => ({
          id: lead.id,
          estado: lead.estado,
          valor: lead.valor ? Number(lead.valor) : null,
          contact: lead.contact,
          created_at: lead.created_at.toISOString(),
        })),
        page,
        totalPages,
        search,
        estado: estado || 'all',
      },
    }
  } catch (error) {
    console.error('Leads page error:', error)
    
    // Si es error de autenticación, redirigir a login
    if (error instanceof Error && (error.message === 'No session' || error.message === 'Invalid session' || error.message === 'Expired session' || error.message === 'Invalid token')) {
      return {
        redirect: {
          destination: '/login',
          permanent: false,
        },
      }
    }

    // Para otros errores, retornar props con valores por defecto
    return {
      props: {
        leads: [],
        page: 1,
        totalPages: 1,
        search: '',
        estado: '',
      },
    }
  }
}

export default function LeadsPage({
  leads,
  page,
  totalPages,
  search: initialSearch,
  estado: initialEstado,
}: LeadsPageProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [estado, setEstado] = useState(initialEstado)
  const [loading, setLoading] = useState(false)

  // Validación defensiva
  const safeLeads = leads || []
  const safePage = page || 1
  const safeTotalPages = totalPages || 1

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    router.push({
      pathname: '/leads',
      query: { search, estado, page: 1 },
    })
  }

  const handleEstadoChange = (value: string) => {
    const estadoValue = value === 'all' ? '' : value
    setEstado(estadoValue)
    router.push({
      pathname: '/leads',
      query: { search, estado: estadoValue, page: 1 },
    })
  }

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [leadToDelete, setLeadToDelete] = useState<{ id: number; name: string } | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')

  const handleDeleteClick = (lead: Lead) => {
    const leadName = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`
    setLeadToDelete({ id: lead.id, name: leadName })
    setDeleteConfirmName('')
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!leadToDelete) return
    
    if (deleteConfirmName !== leadToDelete.name) {
      alert('El nombre no coincide. Por favor, escribe el nombre exacto para confirmar.')
      return
    }

    try {
      const res = await fetch(`/api/leads/${leadToDelete.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setDeleteDialogOpen(false)
        setLeadToDelete(null)
        setDeleteConfirmName('')
        router.reload()
      } else {
        alert('Error al eliminar lead')
      }
    } catch (error) {
      alert('Error de conexión')
    }
  }

  const estadoLabels: { [key: string]: string } = {
    frio: 'Frío',
    caliente: 'Caliente',
    cerrado: 'Cerrado',
    perdido: 'Perdido',
    nuevo: 'Nuevo',
    en_proceso: 'En Proceso',
  }

  const estadoColors: { [key: string]: string } = {
    frio: 'bg-gray-100 text-gray-800',
    caliente: 'bg-red-100 text-red-800',
    cerrado: 'bg-green-100 text-green-800',
    perdido: 'bg-red-100 text-red-800',
    nuevo: 'bg-blue-100 text-blue-800',
    en_proceso: 'bg-yellow-100 text-yellow-800',
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Filters and New Button */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Buscar por nombre de contacto..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={estado || "all"} onValueChange={handleEstadoChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="frio">Frío</SelectItem>
                  <SelectItem value="caliente">Caliente</SelectItem>
                  <SelectItem value="cerrado">Cerrado</SelectItem>
                  <SelectItem value="perdido">Perdido</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={loading} variant="outline">
                Buscar
              </Button>
              <Link href="/leads/new">
                <Button type="button">
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo Lead
                </Button>
              </Link>
            </form>
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Confirmar Eliminación
              </DialogTitle>
              <DialogDescription>
                Esta acción no se puede deshacer. Para confirmar, escribe el nombre del lead:
                <span className="font-semibold text-gray-900 block mt-2">
                  {leadToDelete?.name}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="confirm-name">Nombre del lead</Label>
              <Input
                id="confirm-name"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder="Escribe el nombre exacto"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false)
                  setLeadToDelete(null)
                  setDeleteConfirmName('')
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteConfirmName !== leadToDelete?.name}
              >
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Table */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            {safeLeads.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                No hay leads registrados
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4 font-medium">Contacto</th>
                      <th className="text-left p-4 font-medium">Estado</th>
                      <th className="text-left p-4 font-medium">Valor</th>
                      <th className="text-left p-4 font-medium">Fecha</th>
                      <th className="text-right p-4 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeLeads.map((lead) => (
                      <tr key={lead.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          {lead.contact ? (
                            <Link
                              href={`/contacts/${lead.contact.id}`}
                              className="hover:underline"
                            >
                              {lead.contact.nombre || lead.contact.email || '-'}
                            </Link>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-4">
                          <Badge
                            className={
                              estadoColors[lead.estado] ||
                              'bg-gray-100 text-gray-800'
                            }
                          >
                            {estadoLabels[lead.estado] || lead.estado}
                          </Badge>
                        </td>
                        <td className="p-4">
                          {lead.valor
                            ? `€${lead.valor.toLocaleString('es-ES', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : '-'}
                        </td>
                        <td className="p-4">
                          {new Date(lead.created_at).toLocaleDateString('es-ES')}
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <Link href={`/leads/${lead.id}`}>
                              <Button variant="ghost" size="icon">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Link href={`/leads/${lead.id}/edit`}>
                              <Button variant="ghost" size="icon">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(lead)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {safeTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-600">
                  Página {safePage} de {safeTotalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={safePage === 1}
                    onClick={() =>
                      router.push({
                        pathname: '/leads',
                        query: { search, estado, page: safePage - 1 },
                      })
                    }
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    disabled={safePage === safeTotalPages}
                    onClick={() =>
                      router.push({
                        pathname: '/leads',
                        query: { search, estado, page: safePage + 1 },
                      })
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

