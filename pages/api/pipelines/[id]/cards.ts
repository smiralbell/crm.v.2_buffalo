import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createCardSchema = z.object({
  entity_id: z.union([z.string(), z.number()]).transform((val) => String(val)), // Acepta string o number, convierte a string
  entity_type: z.enum(['client', 'contact']),
  stage: z.string().min(1, 'El stage es requerido'),
  stage_color: z.string().optional().default('#3B82F6'),
  tags: z.array(z.string()).optional().default([]),
  capture_date: z.union([
    z.string().datetime(), // Formato ISO completo
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Formato YYYY-MM-DD
    z.string().length(0), // String vacío
  ]).transform((val) => {
    if (!val || val.length === 0) return null
    // Si es formato YYYY-MM-DD, convertir a ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return new Date(val + 'T00:00:00Z').toISOString()
    }
    return val
  }).optional().nullable(),
  amount: z.union([z.string(), z.number()]).transform((val) => val ? parseFloat(String(val)) : null).optional().nullable(),
  notes: z.string().optional().nullable(),
})

const moveCardSchema = z.object({
  stage: z.string().min(1, 'El stage es requerido'),
  stage_color: z.string().optional(),
  position: z.number().int().min(0),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requireAuthAPI(req, res)

    const pipelineId = req.query.id as string

    if (!pipelineId) {
      return res.status(400).json({ error: 'pipeline_id es requerido' })
    }

    // Validar que pipelineId sea un UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pipelineId)) {
      console.error('Invalid pipelineId format:', pipelineId, 'Length:', pipelineId?.length)
      return res.status(400).json({ 
        error: `pipeline_id no es un UUID válido. Recibido: "${pipelineId}" (longitud: ${pipelineId?.length})` 
      })
    }

    // Verificar que el pipeline existe
    const pipeline = await prisma.pipelineKanban.findUnique({
      where: { id: pipelineId },
    })

    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline no encontrado' })
    }

    if (req.method === 'GET') {
      // Listar todas las tarjetas del pipeline (no eliminadas)
      const cards = await prisma.pipelineCard.findMany({
        where: {
          pipeline_id: pipelineId,
          deleted_at: null,
        },
        orderBy: [
          { stage: 'asc' },
          { position: 'asc' },
        ],
      })

      // Agrupar por stage para facilitar el frontend
      const cardsByStage: Record<string, typeof cards> = {}
      cards.forEach((card) => {
        if (!cardsByStage[card.stage]) {
          cardsByStage[card.stage] = []
        }
        cardsByStage[card.stage].push(card)
      })

      return res.status(200).json({
        cards,
        cardsByStage,
        stages: Object.keys(cardsByStage),
      })
    }

    if (req.method === 'POST') {
      // Crear nueva tarjeta
      const data = createCardSchema.parse(req.body)

      // Validar que entity_id no esté vacío
      if (!data.entity_id || data.entity_id.trim().length === 0) {
        return res.status(400).json({
          error: 'entity_id es requerido y no puede estar vacío',
        })
      }

      // Verificar que entity_type coincida con el pipeline
      if (data.entity_type !== pipeline.entity_type) {
        return res.status(400).json({
          error: `El entity_type debe ser "${pipeline.entity_type}" para este pipeline`,
        })
      }

      // Validar que pipelineId sea un UUID válido
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(pipelineId)) {
        return res.status(400).json({
          error: 'pipeline_id no es un UUID válido',
        })
      }

      // Obtener el último position en el stage
      const lastCard = await prisma.pipelineCard.findFirst({
        where: {
          pipeline_id: pipelineId,
          stage: data.stage,
          deleted_at: null,
        },
        orderBy: { position: 'desc' },
      })

      const newPosition = lastCard ? lastCard.position + 1 : 0

      // Asegurar que entity_id sea un string válido
      const entityIdString = String(data.entity_id || '').trim()
      
      if (!entityIdString || entityIdString.length === 0) {
        return res.status(400).json({
          error: 'entity_id es requerido y no puede estar vacío',
        })
      }

      console.log('Creating card with data:', {
        pipeline_id: pipelineId,
        entity_id: entityIdString,
        entity_type: data.entity_type,
        stage: data.stage,
        position: newPosition,
      })

      try {
        const card = await prisma.pipelineCard.create({
          data: {
            pipeline_id: pipelineId,
            entity_id: entityIdString, // Ya validado y convertido a string
            entity_type: data.entity_type,
            stage: data.stage,
            stage_color: data.stage_color || '#3B82F6',
            position: newPosition,
            tags: data.tags || [],
            capture_date: data.capture_date ? (typeof data.capture_date === 'string' ? new Date(data.capture_date) : null) : null,
            amount: data.amount !== null && data.amount !== undefined ? data.amount : null,
            notes: data.notes || null,
          },
        })

        return res.status(201).json(card)
      } catch (createError: any) {
        console.error('Error creating card:', createError)
        console.error('Error code:', createError.code)
        console.error('Error message:', createError.message)
        console.error('Data being sent:', {
          pipeline_id: pipelineId,
          entity_id: entityIdString,
          entity_type: data.entity_type,
          stage: data.stage,
        })
        
        // Si es un error de UUID, dar un mensaje más claro
        if (createError.code === 'P2023') {
          return res.status(400).json({
            error: 'Error: La columna entity_id en la base de datos está definida como UUID pero debería ser TEXT. Ejecuta el SQL en FIX_ENTITY_ID_SIMPLE.sql para corregirlo.',
            details: createError.message,
          })
        }
        
        throw createError
      }
    }

    if (req.method === 'PUT') {
      // Mover tarjeta (cambiar stage y/o position)
      const { card_id, ...moveData } = req.body

      if (!card_id) {
        return res.status(400).json({ error: 'card_id es requerido' })
      }

      const data = moveCardSchema.parse(moveData)

      // Verificar que la tarjeta existe
      const card = await prisma.pipelineCard.findUnique({
        where: { id: card_id },
      })

      if (!card || card.deleted_at) {
        return res.status(404).json({ error: 'Tarjeta no encontrada' })
      }

      if (card.pipeline_id !== pipelineId) {
        return res.status(400).json({ error: 'La tarjeta no pertenece a este pipeline' })
      }

      // Si cambia el stage, recalcular posiciones
      if (card.stage !== data.stage) {
        // Reordenar tarjetas en el stage anterior
        await prisma.pipelineCard.updateMany({
          where: {
            pipeline_id: pipelineId,
            stage: card.stage,
            position: { gt: card.position },
            deleted_at: null,
          },
          data: {
            position: { decrement: 1 },
          },
        })

        // Reordenar tarjetas en el nuevo stage
        await prisma.pipelineCard.updateMany({
          where: {
            pipeline_id: pipelineId,
            stage: data.stage,
            position: { gte: data.position },
            deleted_at: null,
            id: { not: card_id },
          },
          data: {
            position: { increment: 1 },
          },
        })
      } else {
        // Mismo stage, solo cambiar position
        if (card.position < data.position) {
          await prisma.pipelineCard.updateMany({
            where: {
              pipeline_id: pipelineId,
              stage: data.stage,
              position: { gt: card.position, lte: data.position },
              deleted_at: null,
              id: { not: card_id },
            },
            data: {
              position: { decrement: 1 },
            },
          })
        } else if (card.position > data.position) {
          await prisma.pipelineCard.updateMany({
            where: {
              pipeline_id: pipelineId,
              stage: data.stage,
              position: { gte: data.position, lt: card.position },
              deleted_at: null,
              id: { not: card_id },
            },
            data: {
              position: { increment: 1 },
            },
          })
        }
      }

      // Actualizar la tarjeta
      const updated = await prisma.pipelineCard.update({
        where: { id: card_id },
        data: {
          stage: data.stage,
          stage_color: data.stage_color || card.stage_color,
          position: data.position,
        },
      })

      return res.status(200).json(updated)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Pipeline Cards API error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    return res.status(500).json({ error: error.message || 'Error interno del servidor' })
  }
}

