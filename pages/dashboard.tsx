import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import StatsCard from '@/components/Dashboard/StatsCard'
import Charts from '@/components/Dashboard/Charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'

interface DashboardProps {
  stats: {
    totalContacts: number
    totalLeads: number
    leadsByStatus: Array<{ estado: string; cantidad: number }>
    totalValue: number
    recentActivity: Array<{
      id: number
      type: 'contact' | 'lead'
      name: string
      createdAt: string
    }>
    leadsByMonth: Array<{ mes: string; cantidad: number }>
  }
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)

    // Obtener estadísticas
    const totalContacts = await prisma.contact.count()
    const totalLeads = await prisma.lead.count()

    // Leads por estado
    const leadsByStatusRaw = await prisma.lead.groupBy({
      by: ['estado'],
      _count: { estado: true },
    })
    const leadsByStatus = leadsByStatusRaw
      .filter((item) => item.estado) // Filtrar nulls
      .map((item) => ({
        estado: item.estado || 'sin_estado',
        cantidad: item._count.estado,
      }))

    // Valor total de leads
    const totalValueResult = await prisma.lead.aggregate({
      _sum: { valor: true },
    })
    const totalValue = totalValueResult._sum.valor || 0

    // Actividad reciente (últimos 10 leads y contactos)
    const recentLeads = await prisma.lead.findMany({
      take: 5,
      orderBy: { created_at: 'desc' },
      include: { contact: true },
    })

    const recentContacts = await prisma.contact.findMany({
      take: 5,
      orderBy: { created_at: 'desc' },
    })

    const recentActivity = [
      ...recentLeads.map((lead) => ({
        id: lead.id,
        type: 'lead' as const,
        name: lead.contact?.nombre || `Lead #${lead.id}`,
        createdAt: lead.created_at.toISOString(),
      })),
      ...recentContacts.map((contact) => ({
        id: contact.id,
        type: 'contact' as const,
        name: contact.nombre || contact.email || `Contacto #${contact.id}`,
        createdAt: contact.created_at.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)

    // Leads por mes (últimos 6 meses)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const leadsByMonthRaw = await prisma.lead.findMany({
      where: {
        created_at: {
          gte: sixMonthsAgo,
        },
      },
      select: {
        created_at: true,
      },
    })

    const monthMap: { [key: string]: number } = {}
    leadsByMonthRaw.forEach((lead) => {
      const month = format(new Date(lead.created_at), 'MMM yyyy')
      monthMap[month] = (monthMap[month] || 0) + 1
    })

    const leadsByMonth = Object.entries(monthMap)
      .map(([mes, cantidad]) => ({ mes, cantidad }))
      .sort((a, b) => {
        const dateA = new Date(a.mes)
        const dateB = new Date(b.mes)
        return dateA.getTime() - dateB.getTime()
      })

    return {
      props: {
        stats: {
          totalContacts,
          totalLeads,
          leadsByStatus,
          totalValue: Number(totalValue),
          recentActivity,
          leadsByMonth,
        },
      },
    }
  } catch (error) {
    console.error('Dashboard error:', error)
    
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
        stats: {
          totalContacts: 0,
          totalLeads: 0,
          leadsByStatus: [],
          totalValue: 0,
          recentActivity: [],
          leadsByMonth: [],
        },
      },
    }
  }
}

export default function Dashboard({ stats }: DashboardProps) {
  // Validación defensiva
  if (!stats) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Cargando estadísticas...</p>
        </div>
      </Layout>
    )
  }

  const estadoLabels: { [key: string]: string } = {
    frio: 'Frío',
    caliente: 'Caliente',
    cerrado: 'Cerrado',
    perdido: 'Perdido',
    nuevo: 'Nuevo',
    en_proceso: 'En Proceso',
  }

  // Asegurar que leadsByStatus existe y es un array
  const leadsByStatus = stats.leadsByStatus || []
  const leadsByStatusFormatted = leadsByStatus.map((item) => ({
    ...item,
    estado: estadoLabels[item.estado] || item.estado,
  }))

  // Asegurar que leadsByMonth existe
  const leadsByMonth = stats.leadsByMonth || []
  const recentActivity = stats.recentActivity || []

  return (
    <Layout>
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Contactos"
            value={stats.totalContacts}
            description="Contactos registrados"
          />
          <StatsCard
            title="Total Leads"
            value={stats.totalLeads}
            description="Leads en el sistema"
          />
          <StatsCard
            title="Valor Total"
            value={`€${stats.totalValue.toLocaleString('es-ES', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
            description="Suma de valores de leads"
          />
          <StatsCard
            title="Leads Cerrados"
            value={
              leadsByStatus.find((s) => s.estado === 'cerrado' || s.estado === 'Cerrado')?.cantidad || 0
            }
            description="Leads ganados"
          />
        </div>

        {/* Charts */}
        <Charts
          leadsByStatus={leadsByStatusFormatted}
          leadsByMonth={leadsByMonth}
        />

        {/* Recent Activity */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No hay actividad reciente</p>
              ) : (
                recentActivity.map((activity) => (
                  <div
                    key={`${activity.type}-${activity.id}`}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${
                          activity.type === 'lead' ? 'bg-blue-500' : 'bg-emerald-500'
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{activity.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {activity.type === 'lead' ? 'Lead' : 'Contacto'}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 font-medium">
                      {format(new Date(activity.createdAt), 'dd MMM')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

