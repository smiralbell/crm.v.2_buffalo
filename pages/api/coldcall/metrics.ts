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
    porResultado,
    zonas,
    sectores,
    totalLlamadas,
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
    // Llamadas totales agrupadas por resultado (para el funnel)
    prisma.coldCallCall.groupBy({
      by: ['resultado'],
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

  const resultadoMap = Object.fromEntries(
    porResultado.map((r: { resultado: string; _count: { id: number } }) => [r.resultado, r._count.id])
  )

  // Funnel: prospectos → llamados → sin respuesta → interesados → reunión → no interesados
  const prospectosPendientes = (porEstado.find((e: { estado: string }) => e.estado === 'pendiente')?._count?.id) || 0
  const funnel = {
    total_prospectos:  totalProspectos,
    llamadas_hechas:   totalLlamadas,
    sin_respuesta:     (resultadoMap['sin_respuesta'] || 0) + (resultadoMap['buzon_voz'] || 0),
    interesados:       resultadoMap['interesado'] || 0,
    reunion_agendada:  resultadoMap['reunion_agendada'] || 0,
    no_interesado:     resultadoMap['no_interesado'] || 0,
    no_contactar:      resultadoMap['no_contactar'] || 0,
    pendientes:        prospectosPendientes,
  }

  return res.json({
    hoy: { llamadas: llamasHoy, interesados: interesadosHoy, reuniones: reunionesHoy, tasaConversion },
    totales: { prospectos: totalProspectos, llamadas: totalLlamadas },
    funnel,
    porEstado: Object.fromEntries(porEstado.map((r: { estado: string; _count: { id: number } }) => [r.estado, r._count.id])),
    zonas: zonas.map((r: { zona: string | null; _count: { id: number } }) => ({ zona: r.zona, count: r._count.id })),
    sectores: sectores.map((r: { sector: string | null; _count: { id: number } }) => ({ sector: r.sector, count: r._count.id })),
  })
}
