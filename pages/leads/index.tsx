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
  totalCount: number
  search: string
  /** all | leads | contacto */
  tipo: string
  /** all | frio | caliente | cerrado | perdido | … */
  estado: string
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)

    const page = parseInt(context.query.page as string) || 1
    const search = (context.query.search as string) || ''
    const tipoRaw = (context.query.tipo as string) || 'all'
    const tipo = ['all', 'leads', 'contacto'].includes(tipoRaw) ? tipoRaw : 'all'
    const estadoRaw = (context.query.estado as string) || 'all'
    const estado = [
      'all',
      'frio',
      'caliente',
      'cerrado',
      'perdido',
      'nuevo',
      'en_proceso',
      'reunion',
      'propuesta',
    ].includes(estadoRaw)
      ? estadoRaw
      : 'all'
    const pageSize = 10
    const skip = (page - 1) * pageSize

    const where: Record<string, unknown> = {}

    if (estado !== 'all') {
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

    const showLeads = tipo === 'all' || tipo === 'leads'
    const showContactsOnly = tipo === 'all' || tipo === 'contacto'
    // Contactos sin lead solo tienen sentido si no filtramos por estado de lead
    const includeContacts = showContactsOnly && (tipo === 'contacto' || estado === 'all')

    const contactWhere: Record<string, unknown> = {
      leads: { none: {} },
    }
    if (search) {
      contactWhere.OR = [
        { nombre: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ]
    }

    const [totalLeads, totalContactsOnly] = await Promise.all([
      showLeads ? prisma.lead.count({ where }) : Promise.resolve(0),
      includeContacts ? prisma.contact.count({ where: contactWhere }) : Promise.resolve(0),
    ])

    // Lista unificada: leads + contactos sin lead, ordenados por fecha (desc).
    // Paginar sobre el total combinado evita páginas de más y contactos repetidos.
    const totalForPages =
      tipo === 'contacto' ? totalContactsOnly : tipo === 'leads' ? totalLeads : totalLeads + totalContactsOnly
    const totalPages = Math.max(1, Math.ceil(totalForPages / pageSize))
    const safePage = Math.min(Math.max(1, page), totalPages)
    const safeSkip = (safePage - 1) * pageSize

    let leads: Array<{
      id: number
      estado: string | null
      valor: unknown
      created_at: Date
      contact: { id: number; nombre: string | null; email: string | null } | null
    }> = []
    let contactsOnly: {
      id: number
      nombre: string | null
      email: string | null
      created_at: Date
    }[] = []

    if (tipo === 'contacto') {
      contactsOnly = await prisma.contact.findMany({
        where: contactWhere,
        skip: safeSkip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        select: { id: true, nombre: true, email: true, created_at: true },
      })
    } else if (tipo === 'leads') {
      leads = await prisma.lead.findMany({
        where,
        skip: safeSkip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          contact: { select: { id: true, nombre: true, email: true } },
        },
      })
    } else {
      // tipo === 'all': slice de la lista combinada (leads primero por created_at, luego contactos)
      // Aproximación eficiente: si el offset cae dentro de leads, rellenar con contactos;
      // si ya pasamos todos los leads, solo contactos.
      if (safeSkip < totalLeads) {
        const leadTake = Math.min(pageSize, totalLeads - safeSkip)
        leads = await prisma.lead.findMany({
          where,
          skip: safeSkip,
          take: leadTake,
          orderBy: { created_at: 'desc' },
          include: {
            contact: { select: { id: true, nombre: true, email: true } },
          },
        })
        const remaining = pageSize - leads.length
        if (remaining > 0 && includeContacts && totalContactsOnly > 0) {
          contactsOnly = await prisma.contact.findMany({
            where: contactWhere,
            skip: 0,
            take: remaining,
            orderBy: { created_at: 'desc' },
            select: { id: true, nombre: true, email: true, created_at: true },
          })
        }
      } else if (includeContacts) {
        const contactSkip = safeSkip - totalLeads
        contactsOnly = await prisma.contact.findMany({
          where: contactWhere,
          skip: contactSkip,
          take: pageSize,
          orderBy: { created_at: 'desc' },
          select: { id: true, nombre: true, email: true, created_at: true },
        })
      }
    }

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
        page: safePage,
        totalPages,
        totalCount: totalForPages,
        search,
        tipo,
        estado,
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
        totalCount: 0,
        search: '',
        tipo: 'all',
        estado: 'all',
      },
    }
  }
}

export default function LeadsPage({
  leads,
  contactsOnly,
  page,
  totalPages,
  totalCount,
  search: initialSearch,
  tipo: initialTipo,
  estado: initialEstado,
}: LeadsPageProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [tipo, setTipo] = useState(initialTipo || 'all')
  const [estado, setEstado] = useState(initialEstado || 'all')
  const [loading, setLoading] = useState(false)
  const [newDialogMode, setNewDialogMode] = useState<'lead' | 'contact'>('lead')

  // Validación defensiva
  const safeLeads = leads || []
  const safeContactsOnly = contactsOnly || []
  const safePage = page || 1
  const safeTotalPages = totalPages || 1
  const safeTotalCount = totalCount ?? safeLeads.length + safeContactsOnly.length
  const pageSize = 10
  const rangeFrom = safeTotalCount === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeTo = Math.min(safePage * pageSize, safeTotalCount)

  const listRows: ListRow[] = [
    ...(tipo === 'contacto' ? [] : safeLeads.map((lead) => ({ kind: 'lead' as const, lead }))),
    ...(tipo === 'leads'
      ? []
      : safeContactsOnly.map((contact) => ({ kind: 'contact' as const, contact }))),
  ]

  const pushFilters = (next: { search?: string; tipo?: string; estado?: string; page?: number }) => {
    const qTipo = next.tipo ?? tipo
    const qEstado = next.estado ?? estado
    router.push({
      pathname: '/leads',
      query: {
        search: next.search ?? search,
        tipo: qTipo === 'all' ? undefined : qTipo,
        estado: qEstado === 'all' ? undefined : qEstado,
        page: next.page ?? 1,
      },
    })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    pushFilters({ search, page: 1 })
  }

  const handleTipoChange = (value: string) => {
    setTipo(value)
    pushFilters({ tipo: value, page: 1 })
  }

  const handleEstadoChange = (value: string) => {
    setEstado(value)
    pushFilters({ estado: value, page: 1 })
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
    reunion: 'Reunión',
    propuesta: 'Propuesta',
  }

  const estadoColors: { [key: string]: string } = {
    frio: 'bg-muted text-muted-foreground',
    caliente: 'bg-red-500/15 text-red-700 dark:text-red-300',
    cerrado: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    perdido: 'bg-red-500/15 text-red-700 dark:text-red-300',
    nuevo: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    en_proceso: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
    reunion: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    propuesta: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
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
              <Select value={tipo || 'all'} onValueChange={handleTipoChange}>
                <SelectTrigger className="w-full sm:w-[160px] rounded-xl">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="contacto">Contactos</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={estado || 'all'}
                onValueChange={handleEstadoChange}
                disabled={tipo === 'contacto'}
              >
                <SelectTrigger className="w-full sm:w-[160px] rounded-xl">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="frio">Frío</SelectItem>
                  <SelectItem value="caliente">Caliente</SelectItem>
                  <SelectItem value="nuevo">Nuevo</SelectItem>
                  <SelectItem value="en_proceso">En proceso</SelectItem>
                  <SelectItem value="reunion">Reunión</SelectItem>
                  <SelectItem value="propuesta">Propuesta</SelectItem>
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
                            role="link"
                            tabIndex={0}
                            onClick={() => router.push(`/contacts/${c.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                router.push(`/contacts/${c.id}`)
                              }
                            }}
                            className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-3.5">
                              <span className="font-medium text-foreground">
                                {c.nombre || c.email || `Contacto #${c.id}`}
                              </span>
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
                            <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
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
                        role="link"
                        tabIndex={0}
                        onClick={() => router.push(`/leads/${lead.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            router.push(`/leads/${lead.id}`)
                          }
                        }}
                        className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3.5">
                          <span className="font-medium text-foreground">
                            {lead.contact?.nombre ||
                              lead.contact?.email ||
                              `Lead #${lead.id}`}
                          </span>
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
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
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

            {(safeTotalPages > 1 || safeTotalCount > 0) && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  {safeTotalCount === 0
                    ? 'Sin resultados'
                    : `${rangeFrom}–${rangeTo} de ${safeTotalCount}`}
                  {safeTotalPages > 1 ? ` · Página ${safePage} de ${safeTotalPages}` : ''}
                </p>
                {safeTotalPages > 1 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={safePage === 1}
                    onClick={() =>
                      router.push({
                        pathname: '/leads',
                        query: {
                          search,
                          tipo: tipo === 'all' ? undefined : tipo,
                          estado: estado === 'all' ? undefined : estado,
                          page: safePage - 1,
                        },
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
                        query: {
                          search,
                          tipo: tipo === 'all' ? undefined : tipo,
                          estado: estado === 'all' ? undefined : estado,
                          page: safePage + 1,
                        },
                      })
                    }
                  >
                    Siguiente
                  </Button>
                </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

