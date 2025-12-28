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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Search, Edit, Trash2, Eye, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

interface Contact {
  id: number
  nombre: string | null
  email: string | null
  telefono: string | null
  empresa: string | null
}

interface ContactsPageProps {
  contacts: Contact[]
  page: number
  totalPages: number
  search: string
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)

    const page = parseInt(context.query.page as string) || 1
    const search = (context.query.search as string) || ''
    const pageSize = 10
    const skip = (page - 1) * pageSize

    const where = search
      ? {
          OR: [
            { nombre: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      prisma.contact.count({ where }),
    ])

    const totalPages = Math.ceil(total / pageSize)

    return {
      props: {
        contacts: contacts.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          email: c.email,
          telefono: c.telefono,
          empresa: c.empresa,
        })),
        page,
        totalPages,
        search,
      },
    }
  } catch (error) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }
}

export default function ContactsPage({
  contacts,
  page,
  totalPages,
  search: initialSearch,
}: ContactsPageProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [loading, setLoading] = useState(false)

  // Validación defensiva
  const safeContacts = contacts || []
  const safePage = page || 1
  const safeTotalPages = totalPages || 1

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    router.push({
      pathname: '/contacts',
      query: { search, page: 1 },
    })
  }


  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [contactToDelete, setContactToDelete] = useState<{ id: number; name: string } | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')

  const handleDeleteClick = (contact: Contact) => {
    setContactToDelete({ id: contact.id, name: contact.nombre || contact.email || `Contacto #${contact.id}` })
    setDeleteConfirmName('')
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!contactToDelete) return
    
    if (deleteConfirmName !== contactToDelete.name) {
      alert('El nombre no coincide. Por favor, escribe el nombre exacto para confirmar.')
      return
    }

    try {
      const res = await fetch(`/api/contacts/${contactToDelete.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setDeleteDialogOpen(false)
        setContactToDelete(null)
        setDeleteConfirmName('')
        router.reload()
      } else {
        alert('Error al eliminar contacto')
      }
    } catch (error) {
      alert('Error de conexión')
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Search and New Button */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Buscar por nombre o email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Button type="submit" disabled={loading} variant="outline">
                Buscar
              </Button>
              <Link href="/contacts/new">
                <Button type="button">
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo Contacto
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
                Esta acción no se puede deshacer. Para confirmar, escribe el nombre del contacto:
                <span className="font-semibold text-gray-900 block mt-2">
                  {contactToDelete?.name}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="confirm-name">Nombre del contacto</Label>
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
                  setContactToDelete(null)
                  setDeleteConfirmName('')
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteConfirmName !== contactToDelete?.name}
              >
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Table */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            {safeContacts.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                No hay contactos registrados
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4 font-medium">Nombre</th>
                      <th className="text-left p-4 font-medium">Email</th>
                      <th className="text-left p-4 font-medium">Empresa</th>
                      <th className="text-left p-4 font-medium">Teléfono</th>
                      <th className="text-right p-4 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeContacts.map((contact) => (
                      <tr key={contact.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">{contact.nombre || '-'}</td>
                        <td className="p-4">{contact.email || '-'}</td>
                        <td className="p-4">{contact.empresa || '-'}</td>
                        <td className="p-4">{contact.telefono || '-'}</td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <Link href={`/contacts/${contact.id}`}>
                              <Button variant="ghost" size="icon">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Link href={`/contacts/${contact.id}/edit`}>
                              <Button variant="ghost" size="icon">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(contact)}
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
                        pathname: '/contacts',
                        query: { search, page: safePage - 1 },
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
                        pathname: '/contacts',
                        query: { search, page: safePage + 1 },
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

