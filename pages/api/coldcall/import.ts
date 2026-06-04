import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuthAPI(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()

  const { prospects } = req.body as { prospects: Record<string, string>[] }

  if (!Array.isArray(prospects) || prospects.length === 0) {
    return res.status(400).json({ error: 'Lista vacía' })
  }

  if (prospects.length > 5000) {
    return res.status(400).json({ error: 'Máximo 5.000 prospectos por importación' })
  }

  // Normalizar columnas flexibles
  const normalize = (row: Record<string, string>) => {
    const g = (keys: string[]) => {
      for (const k of keys) {
        const v = row[k] || row[k.toLowerCase()] || row[k.toUpperCase()]
        if (v?.trim()) return v.trim()
      }
      return undefined
    }
    return {
      nombre:      g(['nombre','name','Nombre','Name','NOMBRE']) || 'Sin nombre',
      empresa:     g(['empresa','company','Empresa','Company','EMPRESA']),
      telefono:    g(['telefono','teléfono','phone','tel','Telefono','Phone']),
      email:       g(['email','Email','EMAIL','correo']),
      zona:        g(['zona','ciudad','city','Zona','Ciudad','City','provincia']),
      sector:      g(['sector','industria','industry','Sector']),
      cargo:       g(['cargo','puesto','role','Cargo','Puesto']),
      linkedin:    g(['linkedin','LinkedIn']),
      web:         g(['web','website','Web','Website']),
      notas:       g(['notas','notes','Notas','Notes']),
      assigned_to: g(['assigned_to','comercial','asignado']),
    }
  }

  const data = prospects.map(normalize)
  const created = await prisma.coldCallProspect.createMany({ data, skipDuplicates: false })

  return res.json({ imported: created.count })
}
