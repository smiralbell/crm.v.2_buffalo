import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { ArrowLeft, Edit, Euro, User, ClipboardList, StickyNote, FileText } from 'lucide-react'
import EditLeadDialog from '@/components/EditLeadDialog'
import LeadMeetingsPanel from '@/components/fireflies/LeadMeetingsPanel'

interface LeadDetailProps {
  lead: {
    id: number
    estado: string
    valor: number | null
    notas: string | null
    configuracion: string | null
    prioridad: string | null
    origen_principal: string | null
    created_at: string
    updated_at: string
    contact: {
      id: number
      nombre: string | null
      email: string | null
      empresa: string | null
      telefono: string | null
      ciudad: string | null
    } | null
  }
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)

    const id = parseInt(context.params?.id as string)

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true,
            nombre: true,
            email: true,
            empresa: true,
            telefono: true,
            ciudad: true,
          },
        },
      },
    })

    if (!lead) return { notFound: true }

    if (lead.configuracion) {
      return {
        redirect: {
          destination: `/onboarding/proyectos/${lead.id}`,
          permanent: false,
        },
      }
    }

    return {
      props: {
        lead: {
          id: lead.id,
          estado: lead.estado ?? 'frio',
          valor: lead.valor ? Number(lead.valor) : null,
          notas: lead.notas ?? null,
          configuracion: lead.configuracion ?? null,
          prioridad: lead.prioridad ?? null,
          origen_principal: lead.origen_principal ?? null,
          created_at: lead.created_at.toISOString(),
          updated_at: lead.updated_at.toISOString(),
          contact: lead.contact,
        },
      },
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
}

const estadoLabels: Record<string, string> = {
  frio: 'Frío', caliente: 'Caliente', cerrado: 'Cerrado',
  perdido: 'Perdido', nuevo: 'Nuevo', en_proceso: 'En Proceso',
}
const estadoColors: Record<string, string> = {
  frio: 'bg-blue-50 text-blue-700 border-blue-200',
  caliente: 'bg-orange-50 text-orange-700 border-orange-200',
  cerrado: 'bg-green-50 text-green-700 border-green-200',
  perdido: 'bg-red-50 text-red-700 border-red-200',
  nuevo: 'bg-purple-50 text-purple-700 border-purple-200',
  en_proceso: 'bg-yellow-50 text-yellow-700 border-yellow-200',
}
const prioridadColors: Record<string, string> = {
  alta: 'bg-red-50 text-red-700',
  media: 'bg-yellow-50 text-yellow-700',
  baja: 'bg-gray-50 text-gray-600',
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500 shrink-0 w-32">{label}</span>
      <span className="text-sm text-gray-900 text-right">{value}</span>
    </div>
  )
}

export default function LeadDetail({ lead }: LeadDetailProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const displayName = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`

  const configureUrl = `/onboarding/configure?lead=${lead.id}&nombre=${encodeURIComponent(lead.contact?.nombre || '')}&empresa=${encodeURIComponent(lead.contact?.empresa || '')}&email=${encodeURIComponent(lead.contact?.email || '')}&ciudad=${encodeURIComponent(lead.contact?.ciudad || '')}`
  const hasConfig = !!lead.configuracion

  return (
    <Layout>
      <div className="space-y-5 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/leads">
              <Button variant="ghost" size="icon" className="shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{displayName}</h1>
              {lead.contact?.empresa && (
                <p className="text-sm text-gray-500 truncate">{lead.contact.empresa}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
            <Link href={configureUrl} className="flex-1 sm:flex-initial">
              {hasConfig ? (
                <Button variant="default" size="sm" className="w-full bg-gray-900 hover:bg-gray-700 text-white">
                  <FileText className="mr-2 h-4 w-4" />
                  Ver propuesta · contrato
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="w-full">
                  Configurar proyecto
                </Button>
              )}
            </Link>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="flex-1 sm:flex-initial">
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          </div>
        </div>

        <EditLeadDialog
          open={editOpen}
          leadId={lead.id}
          onOpenChange={setEditOpen}
          onSaved={() => router.reload()}
        />

        {/* Valor highlight — only show if set */}
        {lead.valor != null && (
          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white">
              <Euro className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Ingreso de venta</p>
              <p className="text-2xl font-bold text-gray-900">
                {lead.valor.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
                <span className="ml-1.5 text-xs font-normal text-gray-400">sin IVA</span>
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge className={`border text-xs ${estadoColors[lead.estado] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                {estadoLabels[lead.estado] || lead.estado}
              </Badge>
              {lead.prioridad && (
                <Badge className={`text-xs ${prioridadColors[lead.prioridad] || 'bg-gray-100 text-gray-600'}`}>
                  {lead.prioridad.charAt(0).toUpperCase() + lead.prioridad.slice(1)}
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Contact card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <User className="h-4 w-4" />
                Datos del contacto
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lead.contact ? (
                <div>
                  <Row label="Nombre" value={lead.contact.nombre} />
                  <Row label="Empresa" value={lead.contact.empresa} />
                  <Row label="Email" value={lead.contact.email ? (
                    <a href={`mailto:${lead.contact.email}`} className="hover:underline text-blue-600">
                      {lead.contact.email}
                    </a>
                  ) : null} />
                  <Row label="Teléfono" value={lead.contact.telefono ? (
                    <a href={`tel:${lead.contact.telefono}`} className="hover:underline">
                      {lead.contact.telefono}
                    </a>
                  ) : null} />
                  <Row label="Ciudad" value={lead.contact.ciudad} />
                </div>
              ) : (
                <p className="text-sm text-gray-400 py-4 text-center">Sin contacto asociado</p>
              )}
            </CardContent>
          </Card>

          {/* Lead meta */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <ClipboardList className="h-4 w-4" />
                Datos del lead
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Row label="Estado" value={
                <Badge className={`border text-xs ${estadoColors[lead.estado] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                  {estadoLabels[lead.estado] || lead.estado}
                </Badge>
              } />
              <Row label="Ingreso venta" value={lead.valor != null ? (
                <span className="font-semibold">
                  {lead.valor.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
                </span>
              ) : null} />
              {lead.valor != null && (
                <Row label="Con IVA (21%)" value={
                  <span className="text-gray-500">
                    {(lead.valor * 1.21).toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
                  </span>
                } />
              )}
              <Row label="Prioridad" value={lead.prioridad ? (
                <Badge className={`text-xs ${prioridadColors[lead.prioridad] || ''}`}>
                  {lead.prioridad.charAt(0).toUpperCase() + lead.prioridad.slice(1)}
                </Badge>
              ) : null} />
              <Row label="Origen" value={lead.origen_principal} />
              <Row label="Creado" value={new Date(lead.created_at).toLocaleDateString('es-ES')} />
              <Row label="Actualizado" value={new Date(lead.updated_at).toLocaleDateString('es-ES')} />
            </CardContent>
          </Card>
        </div>

        <LeadMeetingsPanel leadId={lead.id} />

        {/* Notes — project summary from configurator */}
        {lead.notas && (
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <StickyNote className="h-4 w-4" />
                  Resumen del proyecto
                </CardTitle>
                {hasConfig && (
                  <Link
                    href={configureUrl}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors border border-gray-200 hover:border-gray-400 rounded-lg px-3 py-1.5"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Ver propuesta · contrato
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                {lead.notas}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* No valor yet — prompt to configure */}
        {lead.valor == null && (
          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-400 mb-3">Todavía no hay ningún coste de proyecto configurado</p>
            <Link href={configureUrl}>
              <Button variant="outline" size="sm">
                Configurar proyecto
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Layout>
  )
}
