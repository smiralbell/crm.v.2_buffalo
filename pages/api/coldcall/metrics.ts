import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuthAPI(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd   = new Date(todayStart.getTime() + 86400000)

  const [
    llamasHoy,
    interesadosHoy,
    reunionesHoy,
    totalProspectos,
    porEstado,
    zonas,
    sectores,
    totalLlamadas,
  ] = await Promise.all([
    prisma.coldCallCall.count({ where: { fecha: { gte: todayStart, lt: todayEnd } } }),
    prisma.coldCallCall.count({ where: { fecha: { gte: todayStart, lt: todayEnd }, resultado: 'interesado' } }),
    prisma.coldCallCall.count({ where: { fecha: { gte: todayStart, lt: todayEnd }, resultado: 'reunion_agendada' } }),
    prisma.coldCallProspect.count({ where: { deleted_at: null } }),
    // Funnel viene de porEstado (estado actual del prospecto, no de llamadas individuales)
    prisma.coldCallProspect.groupBy({
      by: ['estado'],
      where: { deleted_at: null },
      _count: { id: true },
    }),
    prisma.coldCallProspect.groupBy({
      by: ['zona'],
      where: { deleted_at: null, zona: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    }),
    prisma.coldCallProspect.groupBy({
      by: ['sector'],
      where: { deleted_at: null, sector: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    }),
    prisma.coldCallCall.count(),
  ])

  const tasaConversion = llamasHoy > 0
    ? Math.round(((interesadosHoy + reunionesHoy) / llamasHoy) * 100)
    : 0

  // Mapa de estado → count (fuente de verdad para el funnel)
  const estadoMap = Object.fromEntries(
    porEstado.map((r: { estado: string; _count: { id: number } }) => [r.estado, r._count.id])
  )

  const funnel = {
    total_prospectos: totalProspectos,
    llamadas_hechas:  totalLlamadas,
    pendientes:       estadoMap['pendiente']        || 0,
    sin_respuesta:    estadoMap['sin_respuesta']     || 0,
    llamar_tarde:     estadoMap['llamar_tarde']      || 0,
    interesados:      estadoMap['interesado']        || 0,
    reunion_agendada: estadoMap['reunion_agendada']  || 0,
    no_interesado:    estadoMap['no_interesado']     || 0,
    no_contactar:     estadoMap['no_contactar']      || 0,
  }

  return res.json({
    hoy: { llamadas: llamasHoy, interesados: interesadosHoy, reuniones: reunionesHoy, tasaConversion },
    totales: { prospectos: totalProspectos, llamadas: totalLlamadas },
    funnel,
    porEstado: estadoMap,
    zonas: zonas.map((r: { zona: string | null; _count: { id: number } }) => ({ zona: r.zona, count: r._count.id })),
    sectores: sectores.map((r: { sector: string | null; _count: { id: number } }) => ({ sector: r.sector, count: r._count.id })),
  })
}
