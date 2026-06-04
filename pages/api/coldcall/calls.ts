import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuthAPI(req, res)) return

  if (req.method === 'POST') {
    const { prospect_id, duracion, resultado, notas, whatsapp_enviado, email_enviado, reunion_fecha } = req.body

    if (!prospect_id || !resultado) {
      return res.status(400).json({ error: 'prospect_id y resultado son obligatorios' })
    }

    // Crear la llamada
    const call = await prisma.coldCallCall.create({
      data: {
        prospect_id: parseInt(prospect_id),
        duracion: duracion ? parseInt(duracion) : null,
        resultado,
        notas,
        whatsapp_enviado: !!whatsapp_enviado,
        email_enviado: !!email_enviado,
        reunion_fecha: reunion_fecha ? new Date(reunion_fecha) : null,
      },
    })

    // Actualizar estado del prospecto según resultado
    const estadoMap: Record<string, string> = {
      interesado:       'interesado',
      reunion_agendada: 'reunion_agendada',
      no_interesado:    'no_interesado',
      sin_respuesta:    'sin_respuesta',
      buzon_voz:        'sin_respuesta',
      no_contactar:     'no_contactar',
      llamar_tarde:     'llamar_tarde',
    }
    if (estadoMap[resultado]) {
      await prisma.coldCallProspect.update({
        where: { id: parseInt(prospect_id) },
        data: { estado: estadoMap[resultado], updated_at: new Date() },
      })
    }

    return res.status(201).json(call)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
