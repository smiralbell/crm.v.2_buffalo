import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft, Edit } from 'lucide-react'

interface ContactDetailProps {
  contact: {
    id: number
    nombre: string | null
    email: string | null
    telefono: string | null
    empresa: string | null
    instagram_user: string | null
    direccion_fiscal: string | null
    ciudad: string | null
    codigo_postal: string | null
    pais: string | null
    cif: string | null
    dni: string | null
    iban: string | null
    created_at: string
    updated_at: string
  }
  leads: Array<{
    id: number
    estado: string
    valor: number | null
    created_at: string
  }>
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)

    const id = parseInt(context.params?.id as string)

    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        leads: {
          orderBy: { created_at: 'desc' },
        },
      },
    })

    if (!contact) {
      return {
        notFound: true,
      }
    }

    return {
      props: {
        contact: {
          id: contact.id,
          nombre: contact.nombre,
          email: contact.email,
          telefono: contact.telefono,
          empresa: contact.empresa,
          instagram_user: contact.instagram_user,
          direccion_fiscal: contact.direccion_fiscal,
          ciudad: contact.ciudad,
          codigo_postal: contact.codigo_postal,
          pais: contact.pais,
          cif: contact.cif,
          dni: contact.dni,
          iban: contact.iban,
          created_at: contact.created_at.toISOString(),
          updated_at: contact.updated_at.toISOString(),
        },
        leads: contact.leads.map((lead) => ({
          id: lead.id,
          estado: lead.estado,
          valor: lead.valor ? Number(lead.valor) : null,
          created_at: lead.created_at.toISOString(),
        })),
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

export default function ContactDetail({ contact, leads }: ContactDetailProps) {
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
            <Link href="/contacts">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {contact.nombre || 'Contacto sin nombre'}
              </h1>
              <p className="text-gray-600 mt-1">Detalle del contacto</p>
            </div>
          </div>
          <Link href={`/contacts/${contact.id}/edit`}>
            <Button>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Información Básica */}
          <Card>
            <CardHeader>
              <CardTitle>Información Básica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Nombre</p>
                <p className="mt-1">{contact.nombre || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Email</p>
                <p className="mt-1">{contact.email || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Teléfono</p>
                <p className="mt-1">{contact.telefono || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Empresa</p>
                <p className="mt-1">{contact.empresa || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Instagram</p>
                <p className="mt-1">{contact.instagram_user || '-'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Información Fiscal */}
          <Card>
            <CardHeader>
              <CardTitle>Información Fiscal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Dirección Fiscal</p>
                <p className="mt-1">{contact.direccion_fiscal || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Ciudad</p>
                <p className="mt-1">{contact.ciudad || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Código Postal</p>
                <p className="mt-1">{contact.codigo_postal || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">País</p>
                <p className="mt-1">{contact.pais || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">CIF</p>
                <p className="mt-1">{contact.cif || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">DNI</p>
                <p className="mt-1">{contact.dni || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">IBAN</p>
                <p className="mt-1">{contact.iban || '-'}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Leads Asociados */}
        <Card>
          <CardHeader>
            <CardTitle>Leads Asociados ({leads.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                No hay leads asociados a este contacto
              </p>
            ) : (
              <div className="space-y-3">
                {leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-4">
                      <Link href={`/leads/${lead.id}`}>
                        <p className="font-medium hover:underline">
                          Lead #{lead.id}
                        </p>
                      </Link>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          estadoColors[lead.estado] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {estadoLabels[lead.estado] || lead.estado}
                      </span>
                      {lead.valor && (
                        <p className="text-sm text-gray-600">
                          €{lead.valor.toLocaleString('es-ES', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      )}
                    </div>
                    <Link href={`/leads/${lead.id}`}>
                      <Button variant="ghost" size="sm">
                        Ver
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

