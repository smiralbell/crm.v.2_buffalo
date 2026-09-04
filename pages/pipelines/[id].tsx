import { GetServerSideProps } from 'next'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PipelineLayout from '@/components/PipelineLayout'
import KanbanBoard from '@/components/KanbanBoard'
import PipelineCardDrawer from '@/components/PipelineCardDrawer'
import ColdCallScopeToolbar from '@/components/coldcall/ColdCallScopeToolbar'
import { getPipelineStages, type PipelineStageRow } from '@/lib/pipelines/stages'
import { getColdCallScope, type ColdCallFilter } from '@/lib/coldcall/scope'
import { coldCallScopeQuery } from '@/lib/coldcall/api-query'
import { useAuth } from '@/components/AuthContext'
import {
  getColdCallPipelineCards,
  getColdCallPipelineId,
  getColdCallProspectDisplayMap,
  isColdCallPipeline,
  backfillMissingColdCallCards,
} from '@/lib/pipelines/cold-calling'
import { isWebPipeline, syncAllWebSourcesToPipeline } from '@/lib/pipelines/web'
import {
  backfillReunionsToGlobalFunnel,
  isGlobalPipeline,
} from '@/lib/pipelines/global-funnel'
import { attachMeetingAlerts } from '@/lib/pipelines/meeting-alerts'

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
  meeting_alert?: boolean
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
  initialStages: PipelineStageRow[]
  availableEntities: Array<{ id: string; name: string }>
  isColdCallPipeline: boolean
  viewerRole: 'admin' | 'comercial' | 'developer'
  initialProspectDisplay: Record<
    string,
    { nombre: string; email: string | null; telefono: string | null; notas: string | null; campaign_id: number | null }
  >
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  let user
  try {
    user = await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }

  const pipelineId = context.params?.id as string
  if (!pipelineId) return { notFound: true }

  try {
    const pipeline = await prisma.pipelineKanban.findUnique({
      where: { id: pipelineId },
    })
    if (!pipeline) return { notFound: true }

    const coldCall = await isColdCallPipeline(pipelineId)
    const webPipeline = await isWebPipeline(pipelineId)
    const globalPipeline = await isGlobalPipeline(pipelineId)
    if (coldCall && user.role !== 'admin' && user.role !== 'comercial') {
      return { notFound: true }
    }
    // Comercial: solo puede ver el pipeline de Cold Calling (sus leads)
    if (user.role === 'comercial' && !coldCall) {
      const coldId = await getColdCallPipelineId()
      if (coldId) {
        return {
          redirect: { destination: `/pipelines/${coldId}`, permanent: false },
        }
      }
      return { redirect: { destination: '/comercial', permanent: false } }
    }
    if (!coldCall && user.role !== 'admin') {
      return { notFound: true }
    }

    const scope = await getColdCallScope(user)

    let cardsRaw
    if (coldCall) {
      // Solo crea tarjetas faltantes (las actualizaciones van al guardar cada llamada).
      // Evita re-sincronizar todos los leads en cada apertura del pipeline.
      await backfillMissingColdCallCards(scope)
      cardsRaw = await getColdCallPipelineCards(scope, pipelineId)
    } else if (webPipeline) {
      await syncAllWebSourcesToPipeline()
      cardsRaw = await prisma.pipelineCard.findMany({
        where: { pipeline_id: pipelineId, deleted_at: null },
        orderBy: [{ stage: 'asc' }, { position: 'asc' }],
      })
    } else if (globalPipeline) {
      await backfillReunionsToGlobalFunnel()
      cardsRaw = await prisma.pipelineCard.findMany({
        where: { pipeline_id: pipelineId, deleted_at: null },
        orderBy: [{ stage: 'asc' }, { position: 'asc' }],
      })
    } else {
      cardsRaw = await prisma.pipelineCard.findMany({
        where: { pipeline_id: pipelineId, deleted_at: null },
        orderBy: [{ stage: 'asc' }, { position: 'asc' }],
      })
    }

    const [stages, contacts] = await Promise.all([
      getPipelineStages(pipelineId),
      coldCall
        ? Promise.resolve([])
        : prisma.contact.findMany({
            take: 100,
            orderBy: { created_at: 'desc' },
          }),
    ])

    const initialCardsRaw = cardsRaw.map((card) => ({
      id: card.id,
      entity_id: card.entity_id,
      entity_type: card.entity_type as 'client' | 'contact',
      stage: card.stage,
      stage_color: card.stage_color || '#FFFFFF',
      position: card.position,
      tags: card.tags,
      capture_date: card.capture_date?.toISOString?.() || (card.capture_date ? String(card.capture_date) : null),
      amount: card.amount ? Number(card.amount) : null,
      notes: card.notes || null,
      created_at: card.created_at.toISOString(),
      updated_at: card.updated_at.toISOString(),
    }))
    const initialCards = await attachMeetingAlerts(initialCardsRaw)

    const initialProspectDisplay = coldCall
      ? await getColdCallProspectDisplayMap(initialCards.map((c) => c.entity_id))
      : {}

    return {
      props: {
        pipeline: {
          id: pipeline.id,
          name: pipeline.name,
          entity_type: pipeline.entity_type as 'client' | 'contact',
          created_at: pipeline.created_at.toISOString(),
        },
        initialStages: stages,
        initialCards,
        isColdCallPipeline: coldCall,
        viewerRole: user.role,
        initialProspectDisplay,
        availableEntities: coldCall
          ? initialCards.map((c) => ({
              id: c.entity_id,
              name: initialProspectDisplay[c.entity_id]?.nombre || `Lead #${c.entity_id}`,
            }))
          : contacts.map((c) => ({
              id: String(c.id),
              name: c.nombre || c.email || 'Sin nombre',
            })),
      },
    }
  } catch (error) {
    console.error('Error fetching pipeline:', error)
    return { notFound: true }
  }
}

export default function PipelineDetail({
  pipeline,
  initialCards,
  initialStages,
  availableEntities,
  isColdCallPipeline: isColdCall,
  viewerRole,
  initialProspectDisplay,
}: PipelineDetailProps) {
  const router = useRouter()
  const { user } = useAuth()
  const isComercialViewer = viewerRole === 'comercial' || user?.role === 'comercial'
  const [cards, setCards] = useState<PipelineCard[]>(initialCards)
  const [stages, setStages] = useState<PipelineStageRow[]>(initialStages)
  const [loading, setLoading] = useState(false)
  const [drawerCard, setDrawerCard] = useState<PipelineCard | null>(null)
  const [scopeFilter, setScopeFilter] = useState<ColdCallFilter>('team')
  const [entities, setEntities] = useState(availableEntities)

  useEffect(() => {
    setEntities(availableEntities)
  }, [availableEntities])

  useEffect(() => {
    if (isComercialViewer && user?.id) {
      setScopeFilter(user.id)
    }
  }, [isComercialViewer, user?.id])

  const reloadCards = useCallback(async () => {
    const q =
      isColdCall && user?.role === 'admin'
        ? coldCallScopeQuery(scopeFilter, user?.id)
        : ''
    const res = await fetch(`/api/pipelines/${pipeline.id}/cards${q}`)
    if (res.ok) {
      const data = await res.json()
      setCards(data.cards || [])
    }
  }, [pipeline.id, isColdCall, user?.role, user?.id, scopeFilter])

  useEffect(() => {
    if (!isColdCall || user?.role !== 'admin') return
    reloadCards()
  }, [scopeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadStages = useCallback(async () => {
    const res = await fetch(`/api/pipelines/${pipeline.id}/stages`)
    if (res.ok) {
      const data = await res.json()
      setStages(data.stages || [])
    }
  }, [pipeline.id])

  const handleCardMove = async (cardId: string, newStage: string, newPosition: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/cards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: cardId, stage: newStage, position: newPosition }),
      })
      if (!res.ok) throw new Error('Error al mover tarjeta')
      await reloadCards()
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
      if (!data.entity_id?.trim()) throw new Error('ID de entidad inválido')

      const res = await fetch(`/api/pipelines/${pipeline.id}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id: String(data.entity_id).trim(),
          entity_type: data.entity_type,
          stage: data.stage,
          stage_color: data.stage_color || '#FFFFFF',
          tags: data.tags || [],
          capture_date: data.capture_date || null,
          amount: data.amount || null,
          notes: data.notes || null,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Error desconocido' }))
        throw new Error(errorData.error || 'Error al crear tarjeta')
      }

      await reloadCards()
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
      await reloadCards()
    } finally {
      setLoading(false)
    }
  }

  const handleCardDelete = async (cardId: string) => {
    if (
      !window.confirm(
        '¿Eliminar esta tarjeta? No se volverá a crear automáticamente por sync de WEB/reuniones.'
      )
    ) {
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/cards/${cardId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Error desconocido' }))
        throw new Error(errorData.error || 'Error al eliminar tarjeta')
      }
      await reloadCards()
    } finally {
      setLoading(false)
    }
  }

  const getEntityName = async (entityId: string): Promise<string> => {
    if (isColdCall) {
      const cached = initialProspectDisplay[entityId]
      if (cached?.nombre) return cached.nombre
      try {
        const res = await fetch(`/api/coldcall/prospects/lookup?ids=${encodeURIComponent(entityId)}`)
        if (res.ok) {
          const data = await res.json()
          return data[entityId]?.nombre || 'Sin nombre'
        }
      } catch (error) {
        console.error('Error fetching prospect name:', error)
      }
      return 'Sin nombre'
    }

    try {
      const entityIdNum = parseInt(entityId, 10)
      if (isNaN(entityIdNum)) return 'Sin nombre'
      const res = await fetch(`/api/contacts/${entityIdNum}`)
      if (res.ok) {
        const data = await res.json()
        return data.nombre || data.email || 'Sin nombre'
      }
    } catch (error) {
      console.error('Error fetching entity name:', error)
    }
    return 'Sin nombre'
  }

  const getEntityDetails = async (
    entityId: string
  ): Promise<{ email?: string; telefono?: string; campaign_id?: number | null }> => {
    if (isColdCall) {
      const cached = initialProspectDisplay[entityId]
      if (cached) {
        return {
          email: cached.email || undefined,
          telefono: cached.telefono || undefined,
          campaign_id: cached.campaign_id,
        }
      }
      try {
        const res = await fetch(`/api/coldcall/prospects/lookup?ids=${encodeURIComponent(entityId)}`)
        if (res.ok) {
          const data = await res.json()
          const row = data[entityId]
          return {
            email: row?.email,
            telefono: row?.telefono,
            campaign_id: row?.campaign_id ?? null,
          }
        }
      } catch (error) {
        console.error('Error fetching prospect details:', error)
      }
      return {}
    }

    try {
      const entityIdNum = parseInt(entityId, 10)
      if (isNaN(entityIdNum)) return {}
      const res = await fetch(`/api/contacts/${entityIdNum}`)
      if (res.ok) {
        const data = await res.json()
        return { email: data.email || undefined, telefono: data.telefono || undefined }
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
        body: JSON.stringify({ old_stage: oldStage, new_stage: newStage, new_color: newColor }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al editar columna')
      }
      const data = await res.json()
      setStages(data.stages || [])
      await reloadCards()
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
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al eliminar columna')
      }
      const data = await res.json()
      setStages(data.stages || [])
    } finally {
      setLoading(false)
    }
  }

  const handleStageCreate = async (stageName: string, color: string, insertAt?: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_name: stageName, color, insert_at: insertAt }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al crear columna')
      }
      const data = await res.json()
      setStages(data.stages || [])
    } finally {
      setLoading(false)
    }
  }

  const handleStageMove = async (stageName: string, direction: 'left' | 'right') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/stages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_name: stageName, direction }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al mover columna')
      }
      const data = await res.json()
      setStages(data.stages || [])
    } finally {
      setLoading(false)
    }
  }

  const handleTagAdd = async (cardId: string, tag: string) => {
    const card = cards.find((c) => c.id === cardId)
    if (!card) return
    const newTags = [...(card.tags || []), tag]
    setCards(cards.map((c) => (c.id === cardId ? { ...c, tags: newTags } : c)))
    await handleCardUpdate(cardId, { tags: newTags })
  }

  const handleTagRemove = async (cardId: string, tag: string) => {
    const card = cards.find((c) => c.id === cardId)
    if (!card) return
    const newTags = (card.tags || []).filter((t) => t !== tag)
    setCards(cards.map((c) => (c.id === cardId ? { ...c, tags: newTags } : c)))
    await handleCardUpdate(cardId, { tags: newTags })
  }

  const totalCards = cards.length
  const totalValue = cards.reduce((sum, card) => sum + (card.amount ? Number(card.amount) : 0), 0)

  return (
    <PipelineLayout
      currentPipelineId={pipeline.id}
      currentPipelineName={
        isComercialViewer && isColdCall ? 'Mi pipeline' : pipeline.name
      }
      totalValue={totalValue}
      totalCards={totalCards}
      lockedToCurrent={isComercialViewer}
      backHref={isComercialViewer ? '/comercial' : '/pipelines'}
      allowDelete={!isComercialViewer}
    >
      {loading && (
        <div className="absolute top-20 right-6 z-20 bg-white px-4 py-2 rounded-lg shadow-md text-sm text-gray-600">
          Guardando cambios...
        </div>
      )}

      {isColdCall && !isComercialViewer && (
        <div className="px-4 pt-3 pb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            {scopeFilter === 'team'
              ? 'Pipeline oficial — leads de todo el equipo'
              : 'Pipeline filtrado por comercial'}
          </p>
          {user?.role === 'admin' && (
            <ColdCallScopeToolbar
              filter={scopeFilter}
              onFilterChange={setScopeFilter}
              onRefresh={reloadCards}
              loading={loading}
            />
          )}
        </div>
      )}

      {isColdCall && isComercialViewer && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-sm text-gray-500">Solo aparecen los leads de tus campañas.</p>
        </div>
      )}

      <PipelineCardDrawer
        card={drawerCard}
        pipelineId={pipeline.id}
        stages={stages}
        getEntityName={getEntityName}
        getEntityDetails={getEntityDetails}
        onCardMove={handleCardMove}
        onClose={() => {
          setDrawerCard(null)
          if (router.query.lead) {
            const nextQuery = { ...router.query }
            delete nextQuery.lead
            void router.replace(
              { pathname: router.pathname, query: nextQuery },
              undefined,
              { shallow: true }
            )
          }
        }}
        isColdCallPipeline={isColdCall}
      />

      <KanbanBoard
        pipelineId={pipeline.id}
        cards={cards}
        stages={stages}
        entityType={pipeline.entity_type}
        onCardMove={handleCardMove}
        onCardCreate={handleCardCreate}
        onCardUpdate={handleCardUpdate}
        onCardDelete={handleCardDelete}
        onStageEdit={handleStageEdit}
        onStageDelete={handleStageDelete}
        onStageCreate={handleStageCreate}
        onStageMove={handleStageMove}
        onTagAdd={handleTagAdd}
        onTagRemove={handleTagRemove}
        onCardClick={setDrawerCard}
        getEntityName={getEntityName}
        getEntityDetails={getEntityDetails}
        availableEntities={entities}
        allowQuickCreate={!isColdCall}
        onEntityCreated={(entity) => {
          setEntities((prev) =>
            prev.some((e) => e.id === entity.id) ? prev : [entity, ...prev]
          )
        }}
      />
    </PipelineLayout>
  )
}
