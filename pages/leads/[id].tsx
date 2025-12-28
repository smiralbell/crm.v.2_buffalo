import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { ArrowLeft, Edit } from 'lucide-react'

interface LeadDetailProps {
  lead: {
    id: number
    estado: string
    valor: number | null
    notas: string | null
    created_at: string
    updated_at: string
    contact: {
      id: number
      nombre: string | null
      email: string | null
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
          },
        },
      },
    })

    if (!lead) {
      return {
        notFound: true,
      }
    }

    return {
      props: {
        lead: {
          ...lead,
          valor: lead.valor ? Number(lead.valor) : null,
          created_at: lead.created_at.toISOString(),
          updated_at: lead.updated_at.toISOString(),
        },
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

export default function LeadDetail({ lead }: LeadDetailProps) {
  const router = useRouter()

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/leads">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Lead #{lead.id}</h1>
              <p className="text-gray-600 mt-1">Detalle del lead</p>
            </div>
          </div>
          <Link href={`/leads/${lead.id}/edit`}>
            <Button>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Información del Lead */}
          <Card>
            <CardHeader>
              <CardTitle>Información del Lead</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Estado</p>
                <div className="mt-1">
                  <Badge
                    className={
                      estadoColors[lead.estado] || 'bg-gray-100 text-gray-800'
                    }
                  >
                    {estadoLabels[lead.estado] || lead.estado}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Valor</p>
                <p className="mt-1">
                  {lead.valor
                    ? `€${lead.valor.toLocaleString('es-ES', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Notas</p>
                <p className="mt-1 whitespace-pre-wrap">
                  {lead.notas || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Fecha de Creación</p>
                <p className="mt-1">
                  {new Date(lead.created_at).toLocaleString('es-ES')}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Última Actualización</p>
                <p className="mt-1">
                  {new Date(lead.updated_at).toLocaleString('es-ES')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Contacto Asociado */}
          <Card>
            <CardHeader>
              <CardTitle>Contacto Asociado</CardTitle>
            </CardHeader>
            <CardContent>
              {lead.contact ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Nombre</p>
                    <Link
                      href={`/contacts/${lead.contact.id}`}
                      className="mt-1 block hover:underline"
                    >
                      {lead.contact.nombre || '-'}
                    </Link>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Email</p>
                    <p className="mt-1">{lead.contact.email || '-'}</p>
                  </div>
                  <Link href={`/contacts/${lead.contact.id}`}>
                    <Button variant="outline" className="w-full">
                      Ver Contacto Completo
                    </Button>
                  </Link>
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">
                  No hay contacto asociado
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  )
}

