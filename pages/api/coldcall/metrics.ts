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
  ] = await Promise.all([
    prisma.coldCallCall.count({ where: { fecha: { gte: todayStart, lt: todayEnd } } }),
    prisma.coldCallCall.count({ where: { fecha: { gte: todayStart, lt: todayEnd }, resultado: 'interesado' } }),
    prisma.coldCallCall.count({ where: { fecha: { gte: todayStart, lt: todayEnd }, resultado: 'reunion_agendada' } }),
    prisma.coldCallProspect.count({ where: { deleted_at: null } }),
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
  ])

  const tasaConversion = llamasHoy > 0
    ? Math.round(((interesadosHoy + reunionesHoy) / llamasHoy) * 100)
    : 0

  return res.json({
    hoy: { llamadas: llamasHoy, interesados: interesadosHoy, reuniones: reunionesHoy, tasaConversion },
    totales: { prospectos: totalProspectos },
    porEstado: Object.fromEntries(porEstado.map(r => [r.estado, r._count.id])),
    zonas: zonas.map(r => ({ zona: r.zona, count: r._count.id })),
    sectores: sectores.map(r => ({ sector: r.sector, count: r._count.id })),
  })
}
