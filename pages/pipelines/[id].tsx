import { GetServerSideProps } from 'next'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PipelineLayout from '@/components/PipelineLayout'
import KanbanBoard from '@/components/KanbanBoard'

interface PipelineCard {
  id: string
  entity_id: string
  entity_type: 'client' | 'contact'
  stage: string
  stage_color: string
  position: number
  tags: string[]
  capture_date?: string | null
  amount?: number | null
  notes?: string | null
  created_at: string
  updated_at: string
}

interface Pipeline {
  id: string
  name: string
  entity_type: 'client' | 'contact'
  created_at: string
}

interface PipelineDetailProps {
  pipeline: Pipeline
  initialCards: PipelineCard[]
  availableEntities: Array<{ id: string; name: string }>
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch (error) {
    return { redirect: { destination: '/login', permanent: false } }
  }

  const pipelineId = context.params?.id as string

  if (!pipelineId) {
    return { notFound: true }
  }

  try {
    // Obtener pipeline directamente con Prisma
    const pipeline = await prisma.pipelineKanban.findUnique({
      where: { id: pipelineId },
    })

    if (!pipeline) {
      return { notFound: true }
    }

    // Obtener cards directamente con Prisma
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

    // Obtener entidades disponibles (contactos o clientes) directamente con Prisma
    const contacts = await prisma.contact.findMany({
      take: 100, // Limitar para no sobrecargar
      orderBy: { created_at: 'desc' },
    })

    const availableEntities = contacts.map((c) => ({
      id: String(c.id),
      name: c.nombre || c.email || 'Sin nombre',
    }))

    return {
      props: {
        pipeline: {
          id: pipeline.id,
          name: pipeline.name,
          entity_type: pipeline.entity_type as 'client' | 'contact',
          created_at: pipeline.created_at.toISOString(),
        },
        initialCards: cards.map((card) => ({
          id: card.id,
          entity_id: card.entity_id,
          entity_type: card.entity_type as 'client' | 'contact',
          stage: card.stage,
          stage_color: card.stage_color || '#3B82F6',
          position: card.position,
          tags: card.tags,
          capture_date: card.capture_date?.toISOString() || null,
          amount: card.amount ? Number(card.amount) : null,
          notes: card.notes || null,
          created_at: card.created_at.toISOString(),
          updated_at: card.updated_at.toISOString(),
        })),
        availableEntities,
      },
    }
  } catch (error) {
    console.error('Error fetching pipeline:', error)
    return { notFound: true }
  }
}

export default function PipelineDetail({ pipeline, initialCards, availableEntities }: PipelineDetailProps) {
  const router = useRouter()
  const [cards, setCards] = useState<PipelineCard[]>(initialCards)
  const [loading, setLoading] = useState(false)
  // Inicializar stageOrder sin localStorage para evitar error de hidratación
  const [stageOrder, setStageOrder] = useState<string[]>(() => {
    // Orden por defecto: stages únicos de las cards
    const stages = Array.from(new Set(initialCards.map((c) => c.stage)))
    return stages
  })

  // Cargar desde localStorage después de la hidratación
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`pipeline_${pipeline.id}_stage_order`)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setStageOrder(parsed)
          }
        } catch (error) {
          console.error('Error parsing stage order from localStorage:', error)
        }
      }
    }
  }, [pipeline.id])

  const handleCardMove = async (cardId: string, newStage: string, newPosition: number, newColor?: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/cards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardId,
          stage: newStage,
          position: newPosition,
          stage_color: newColor,
        }),
      })

      if (!res.ok) {
        throw new Error('Error al mover tarjeta')
      }

      // Recargar cards
      const cardsRes = await fetch(`/api/pipelines/${pipeline.id}/cards`)
      if (cardsRes.ok) {
        const data = await cardsRes.json()
        setCards(data.cards || [])
      }
    } catch (error) {
      console.error('Error moving card:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const handleCardCreate = async (data: {
    entity_id: string
    entity_type: 'client' | 'contact'
    stage: string
    stage_color?: string
    tags?: string[]
    capture_date?: string | null
    amount?: number | null
    notes?: string | null
  }) => {
    setLoading(true)
    try {
      // Validar que entityId sea válido
      if (!data.entity_id || typeof data.entity_id !== 'string' || data.entity_id.trim().length === 0) {
        throw new Error('ID de entidad inválido')
      }

      console.log('Creating card:', data)

      const res = await fetch(`/api/pipelines/${pipeline.id}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id: String(data.entity_id).trim(),
          entity_type: data.entity_type,
          stage: data.stage,
          stage_color: data.stage_color || '#3B82F6',
          tags: data.tags || [],
          capture_date: data.capture_date || null,
          amount: data.amount || null,
          notes: data.notes || null,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Error desconocido' }))
        console.error('Error response:', errorData)
        throw new Error(errorData.error || 'Error al crear tarjeta')
      }

      // Recargar cards
      const cardsRes = await fetch(`/api/pipelines/${pipeline.id}/cards`)
      if (cardsRes.ok) {
        const data = await cardsRes.json()
        setCards(data.cards || [])
      }
    } catch (error) {
      console.error('Error creating card:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const handleCardUpdate = async (cardId: string, data: Partial<PipelineCard>) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/cards/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(data.stage && { stage: data.stage }),
          ...(data.stage_color && { stage_color: data.stage_color }),
          ...(data.tags !== undefined && { tags: data.tags }),
          ...(data.capture_date !== undefined && { capture_date: data.capture_date }),
          ...(data.amount !== undefined && { amount: data.amount }),
          ...(data.notes !== undefined && { notes: data.notes }),
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Error desconocido' }))
        throw new Error(errorData.error || 'Error al actualizar tarjeta')
      }

      // Recargar cards
      const cardsRes = await fetch(`/api/pipelines/${pipeline.id}/cards`)
      if (cardsRes.ok) {
        const data = await cardsRes.json()
        setCards(data.cards || [])
      }
    } catch (error) {
      console.error('Error updating card:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const getEntityName = async (entityId: string): Promise<string> => {
    try {
      const entityType = pipeline.entity_type
      const entityIdNum = parseInt(entityId, 10)
      if (isNaN(entityIdNum)) {
        return 'Sin nombre'
      }

      const res = await fetch(`/api/${entityType === 'contact' ? 'contacts' : 'contacts'}/${entityIdNum}`)
      if (res.ok) {
        const data = await res.json()
        return entityType === 'contact' ? (data.nombre || data.email || 'Sin nombre') : (data.nombre || 'Sin nombre')
      }
    } catch (error) {
      console.error('Error fetching entity name:', error)
    }
    return 'Sin nombre'
  }

  const getEntityDetails = async (entityId: string): Promise<{ email?: string; telefono?: string }> => {
    try {
      const entityType = pipeline.entity_type
      const entityIdNum = parseInt(entityId, 10)
      if (isNaN(entityIdNum)) {
        return {}
      }

      const res = await fetch(`/api/${entityType === 'contact' ? 'contacts' : 'contacts'}/${entityIdNum}`)
      if (res.ok) {
        const data = await res.json()
        return {
          email: data.email || undefined,
          telefono: data.telefono || undefined,
        }
      }
    } catch (error) {
      console.error('Error fetching entity details:', error)
    }
    return {}
  }

  const handleStageEdit = async (oldStage: string, newStage: string, newColor: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/stages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_stage: oldStage,
          new_stage: newStage,
          new_color: newColor,
        }),
      })

      if (!res.ok) {
        throw new Error('Error al editar columna')
      }

      // Recargar cards
      const cardsRes = await fetch(`/api/pipelines/${pipeline.id}/cards`)
      if (cardsRes.ok) {
        const data = await cardsRes.json()
        setCards(data.cards || [])
      }

      // Actualizar orden si cambió el nombre
      if (oldStage !== newStage) {
        const newOrder = stageOrder.map((s) => (s === oldStage ? newStage : s))
        setStageOrder(newOrder)
        if (typeof window !== 'undefined') {
          localStorage.setItem(`pipeline_${pipeline.id}_stage_order`, JSON.stringify(newOrder))
        }
      }
    } catch (error) {
      console.error('Error editing stage:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const handleStageDelete = async (stageName: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/stages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_name: stageName }),
      })

      if (!res.ok) {
        throw new Error('Error al eliminar columna')
      }

      // Remover del orden
      const newOrder = stageOrder.filter((s) => s !== stageName)
      setStageOrder(newOrder)
      if (typeof window !== 'undefined') {
        localStorage.setItem(`pipeline_${pipeline.id}_stage_order`, JSON.stringify(newOrder))
      }
    } catch (error) {
      console.error('Error deleting stage:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const handleStageCreate = async (stageName: string, color: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage_name: stageName,
          color,
        }),
      })

      if (!res.ok) {
        throw new Error('Error al crear columna')
      }

      // Agregar al orden
      const newOrder = [...stageOrder, stageName]
      setStageOrder(newOrder)
      if (typeof window !== 'undefined') {
        localStorage.setItem(`pipeline_${pipeline.id}_stage_order`, JSON.stringify(newOrder))
      }

      // Recargar cards para asegurar que todo esté sincronizado
      const cardsRes = await fetch(`/api/pipelines/${pipeline.id}/cards`)
      if (cardsRes.ok) {
        const data = await cardsRes.json()
        setCards(data.cards || [])
      }
    } catch (error) {
      console.error('Error creating stage:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const handleTagAdd = async (cardId: string, tag: string) => {
    setLoading(true)
    try {
      const card = cards.find((c) => c.id === cardId)
      if (!card) return

      const newTags = [...(card.tags || []), tag]

      const res = await fetch(`/api/pipelines/${pipeline.id}/cards/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: newTags,
        }),
      })

      if (!res.ok) {
        throw new Error('Error al agregar etiqueta')
      }

      // Actualizar localmente
      setCards(cards.map((c) => (c.id === cardId ? { ...c, tags: newTags } : c)))
    } catch (error) {
      console.error('Error adding tag:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const handleTagRemove = async (cardId: string, tag: string) => {
    setLoading(true)
    try {
      const card = cards.find((c) => c.id === cardId)
      if (!card) return

      const newTags = (card.tags || []).filter((t) => t !== tag)

      const res = await fetch(`/api/pipelines/${pipeline.id}/cards/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: newTags,
        }),
      })

      if (!res.ok) {
        throw new Error('Error al eliminar etiqueta')
      }

      // Actualizar localmente
      setCards(cards.map((c) => (c.id === cardId ? { ...c, tags: newTags } : c)))
    } catch (error) {
      console.error('Error removing tag:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const handleCardClick = (card: PipelineCard) => {
    // TODO: Abrir modal/drawer con detalles de la tarjeta
    console.log('Card clicked:', card)
  }

  const totalCards = cards.length
  const totalValue = cards.reduce((sum, card) => {
    return sum + (card.amount ? Number(card.amount) : 0)
  }, 0)

  return (
    <PipelineLayout
      currentPipelineId={pipeline.id}
      currentPipelineName={pipeline.name}
      totalValue={totalValue}
      totalCards={totalCards}
    >
      {loading && (
        <div className="absolute top-20 right-6 z-20 bg-white px-4 py-2 rounded-lg shadow-md text-sm text-gray-600">
          Guardando cambios...
        </div>
      )}
      <KanbanBoard
        pipelineId={pipeline.id}
        cards={cards}
        entityType={pipeline.entity_type}
        onCardMove={handleCardMove}
        onCardCreate={handleCardCreate}
        onCardUpdate={handleCardUpdate}
        onStageEdit={handleStageEdit}
        onStageDelete={handleStageDelete}
        onStageCreate={handleStageCreate}
        onTagAdd={handleTagAdd}
        onTagRemove={handleTagRemove}
        onCardClick={handleCardClick}
        getEntityName={getEntityName}
        getEntityDetails={getEntityDetails}
        availableEntities={availableEntities}
        stageOrder={stageOrder}
        onStageOrderChange={(newOrder) => {
          setStageOrder(newOrder)
          if (typeof window !== 'undefined') {
            localStorage.setItem(`pipeline_${pipeline.id}_stage_order`, JSON.stringify(newOrder))
          }
        }}
      />
    </PipelineLayout>
  )
}

