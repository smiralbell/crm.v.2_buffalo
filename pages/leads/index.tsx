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
import NewLeadDialog from '@/components/NewLeadDialog'
import EditLeadDialog from '@/components/EditLeadDialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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

/** Contacto sin lead — aparece marcado en la lista de Leads */
interface ContactOnlyRow {
  id: number
  nombre: string | null
  email: string | null
  created_at: string
}

type ListRow =
  | { kind: 'lead'; lead: Lead }
  | { kind: 'contact'; contact: ContactOnlyRow }

interface LeadsPageProps {
  leads: Lead[]
  contactsOnly: ContactOnlyRow[]
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

    const showContactsOnly = !estado || estado === 'all' || estado === 'contacto'

    const contactWhere: Record<string, unknown> = {
      leads: { none: {} },
    }
    if (search) {
      contactWhere.OR = [
        { nombre: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ]
    }

    const [leads, totalLeads, contactsOnly] = await Promise.all([
      estado === 'contacto'
        ? Promise.resolve([])
        : prisma.lead.findMany({
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
      estado === 'contacto' ? Promise.resolve(0) : prisma.lead.count({ where }),
      showContactsOnly
        ? prisma.contact.findMany({
            where: contactWhere,
            take: 50,
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              nombre: true,
              email: true,
              created_at: true,
            },
          })
        : Promise.resolve([]),
    ])

    const totalPages = Math.max(1, Math.ceil(totalLeads / pageSize))

    return {
      props: {
        leads: leads.map((lead) => ({
          id: lead.id,
          estado: lead.estado,
          valor: lead.valor ? Number(lead.valor) : null,
          contact: lead.contact,
          created_at: lead.created_at.toISOString(),
        })),
        contactsOnly: contactsOnly.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          email: c.email,
          created_at: c.created_at.toISOString(),
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
        contactsOnly: [],
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
  contactsOnly,
  page,
  totalPages,
  search: initialSearch,
  estado: initialEstado,
}: LeadsPageProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [estado, setEstado] = useState(initialEstado)
  const [loading, setLoading] = useState(false)
  const [newDialogMode, setNewDialogMode] = useState<'lead' | 'contact'>('lead')

  // Validación defensiva
  const safeLeads = leads || []
  const safeContactsOnly = contactsOnly || []
  const safePage = page || 1
  const safeTotalPages = totalPages || 1

  const listRows: ListRow[] = [
    ...safeLeads.map((lead) => ({ kind: 'lead' as const, lead })),
    ...((!estado || estado === 'all' || estado === 'contacto')
      ? safeContactsOnly.map((contact) => ({ kind: 'contact' as const, contact }))
      : []),
  ]

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
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [editLeadId, setEditLeadId] = useState<number | null>(null)

  const openCreate = (mode: 'lead' | 'contact') => {
    setNewDialogMode(mode)
    setNewLeadOpen(true)
  }
  const [leadToDelete, setLeadToDelete] = useState<{
    id: number
    name: string
    kind: 'lead' | 'contact'
  } | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')

  const namesMatch = (a: string, b: string) =>
    a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es')

  const handleDeleteLeadClick = (lead: Lead) => {
    const leadName = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`
    setLeadToDelete({ id: lead.id, name: leadName, kind: 'lead' })
    setDeleteConfirmName('')
    setDeleteDialogOpen(true)
  }

  const handleDeleteContactClick = (c: ContactOnlyRow) => {
    const name = c.nombre || c.email || `Contacto #${c.id}`
    setLeadToDelete({ id: c.id, name, kind: 'contact' })
    setDeleteConfirmName('')
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!leadToDelete) return

    if (!namesMatch(deleteConfirmName, leadToDelete.name)) {
      alert('El nombre no coincide. Por favor, escribe el nombre exacto para confirmar.')
      return
    }

    try {
      const url =
        leadToDelete.kind === 'contact'
          ? `/api/contacts/${leadToDelete.id}`
          : `/api/leads/${leadToDelete.id}?alsoContact=1`
      const res = await fetch(url, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))

      if (res.ok) {
        setDeleteDialogOpen(false)
        setLeadToDelete(null)
        setDeleteConfirmName('')
        router.reload()
      } else {
        alert(data.error || `Error al eliminar ${leadToDelete.kind === 'contact' ? 'contacto' : 'lead'}`)
      }
    } catch {
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
    frio: 'bg-muted text-muted-foreground',
    caliente: 'bg-red-500/15 text-red-700 dark:text-red-300',
    cerrado: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    perdido: 'bg-red-500/15 text-red-700 dark:text-red-300',
    nuevo: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    en_proceso: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  }

  return (
    <Layout>
      <div className="space-y-5">
        <Card>
          <CardContent className="pt-5">
            <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1 min-w-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre o email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 rounded-xl"
                  />
                </div>
              </div>
              <Select value={estado || 'all'} onValueChange={handleEstadoChange}>
                <SelectTrigger className="w-full sm:w-[180px] rounded-xl">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="contacto">Solo contactos</SelectItem>
                  <SelectItem value="frio">Frío</SelectItem>
                  <SelectItem value="caliente">Caliente</SelectItem>
                  <SelectItem value="cerrado">Cerrado</SelectItem>
                  <SelectItem value="perdido">Perdido</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={loading} variant="outline" className="rounded-xl flex-1 sm:flex-initial">
                  Buscar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openCreate('contact')}
                  className="rounded-xl flex-1 sm:flex-initial shrink-0"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo contacto
                </Button>
                <Button
                  type="button"
                  onClick={() => openCreate('lead')}
                  className="rounded-xl flex-1 sm:flex-initial shrink-0"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo Lead
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <NewLeadDialog
          open={newLeadOpen}
          onOpenChange={setNewLeadOpen}
          defaultMode={newDialogMode}
          lockMode
        />
        <EditLeadDialog
          open={editLeadId != null}
          leadId={editLeadId}
          onOpenChange={(open) => {
            if (!open) setEditLeadId(null)
          }}
          onSaved={() => router.reload()}
        />

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Confirmar eliminación
              </DialogTitle>
              <DialogDescription>
                Esta acción no se puede deshacer
                {leadToDelete?.kind === 'lead'
                  ? ' (se eliminará también el contacto asociado).'
                  : '.'}{' '}
                Escribe el nombre:
                <span className="font-semibold text-foreground block mt-2">
                  {leadToDelete?.name}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="confirm-name">
                {leadToDelete?.kind === 'contact' ? 'Nombre del contacto' : 'Nombre del lead'}
              </Label>
              <Input
                id="confirm-name"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder="Escribe el nombre exacto"
                autoFocus
                className="rounded-xl"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-xl"
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
                className="rounded-xl"
                onClick={handleDeleteConfirm}
                disabled={
                  !leadToDelete || !namesMatch(deleteConfirmName, leadToDelete.name)
                }
              >
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {listRows.length === 0 ? (
              <p className="text-center text-muted-foreground py-16 text-sm">
                No hay leads ni contactos registrados
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contacto</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo / Estado</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Valor</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Fecha</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map((row) => {
                      if (row.kind === 'contact') {
                        const c = row.contact
                        return (
                          <tr
                            key={`contact-${c.id}`}
                            className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                          >
                            <td className="px-4 py-3.5">
                              <Link
                                href={`/contacts/${c.id}`}
                                className="font-medium text-foreground hover:underline"
                              >
                                {c.nombre || c.email || `Contacto #${c.id}`}
                              </Link>
                              {c.email && c.nombre && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]">
                                  {c.email}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <Badge className="rounded-full font-medium border-0 bg-sky-500/15 text-sky-800 dark:text-sky-300">
                                Solo contacto
                              </Badge>
                            </td>
                            <td className="px-4 py-3.5 text-muted-foreground hidden sm:table-cell">—</td>
                            <td className="px-4 py-3.5 text-muted-foreground hidden md:table-cell">
                              {new Date(c.created_at).toLocaleDateString('es-ES')}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex justify-end gap-0.5">
                                <Link href={`/contacts/${c.id}`}>
                                  <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <Link href={`/contacts/${c.id}/edit`}>
                                  <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-xl h-8 w-8"
                                  onClick={() => handleDeleteContactClick(c)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      const lead = row.lead
                      return (
                      <tr
                        key={`lead-${lead.id}`}
                        className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-4 py-3.5">
                          <Link
                            href={`/leads/${lead.id}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {lead.contact?.nombre ||
                              lead.contact?.email ||
                              `Lead #${lead.id}`}
                          </Link>
                          {lead.contact?.email && lead.contact?.nombre && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]">
                              {lead.contact.email}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge className="rounded-full font-medium border-0 bg-violet-500/15 text-violet-800 dark:text-violet-300">
                              Lead
                            </Badge>
                            <Badge
                              className={cn(
                                'rounded-full font-medium border-0',
                                estadoColors[lead.estado] || 'bg-muted text-muted-foreground'
                              )}
                            >
                              {estadoLabels[lead.estado] || lead.estado}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-foreground/80 hidden sm:table-cell">
                          {lead.valor
                            ? `€${lead.valor.toLocaleString('es-ES', {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              })}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground hidden md:table-cell">
                          {new Date(lead.created_at).toLocaleDateString('es-ES')}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex justify-end gap-0.5">
                            <Link href={`/leads/${lead.id}`}>
                              <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-xl h-8 w-8"
                              onClick={() => setEditLeadId(lead.id)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-xl h-8 w-8"
                              onClick={() => handleDeleteLeadClick(lead)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {safeTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Página {safePage} de {safeTotalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="rounded-xl"
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
                    className="rounded-xl"
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

