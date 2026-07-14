'use client'

import { Fragment, useState, useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import KanbanColumn from './KanbanColumn'
import type { PipelineStageRow } from '@/lib/pipelines/stages'

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

interface KanbanBoardProps {
  pipelineId: string
  cards: PipelineCard[]
  stages: PipelineStageRow[]
  entityType: 'client' | 'contact'
  onCardMove: (cardId: string, newStage: string, newPosition: number) => Promise<void>
  onCardCreate: (data: Omit<PipelineCard, 'id' | 'created_at' | 'updated_at' | 'position'>) => Promise<void>
  onCardUpdate?: (cardId: string, data: Partial<PipelineCard>) => Promise<void>
  onCardDelete?: (cardId: string) => Promise<void>
  onStageEdit: (oldStage: string, newStage: string, newColor: string) => Promise<void>
  onStageDelete: (stage: string) => Promise<void>
  onStageCreate: (stageName: string, color: string, insertAt?: number) => Promise<void>
  onStageMove: (stageName: string, direction: 'left' | 'right') => Promise<void>
  onTagAdd: (cardId: string, tag: string) => Promise<void>
  onTagRemove: (cardId: string, tag: string) => Promise<void>
  onCardClick?: (card: PipelineCard) => void
  getEntityName: (entityId: string) => Promise<string>
  getEntityDetails: (entityId: string) => Promise<{ email?: string; telefono?: string }>
  availableEntities: Array<{ id: string; name: string }>
}

const COLUMN_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']

function InsertColumnSlot({
  insertAt,
  showForm,
  newColumnName,
  newColumnColor,
  onOpen,
  onNameChange,
  onColorChange,
  onCreate,
  onCancel,
}: {
  insertAt: number
  showForm: boolean
  newColumnName: string
  newColumnColor: string
  onOpen: (at: number) => void
  onNameChange: (v: string) => void
  onColorChange: (v: string) => void
  onCreate: () => void
  onCancel: () => void
}) {
  if (showForm) {
    return (
      <div className="flex-shrink-0 w-[300px] border-r border-gray-200 bg-white">
        <div className="px-5 py-4 border-b-2 border-gray-200">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
            Nueva columna
          </p>
          <input
            type="text"
            value={newColumnName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Nombre de la columna"
            className="w-full px-3 py-2.5 text-sm font-bold text-gray-900 border-2 border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreate()
              if (e.key === 'Escape') onCancel()
            }}
          />
          <div className="mt-3 flex gap-2 flex-wrap">
            {COLUMN_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onColorChange(color)}
                className={`w-8 h-8 rounded-lg border-2 transition-all ${
                  newColumnColor === color ? 'border-gray-900 scale-110 shadow-md' : 'border-gray-300'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={onCreate} size="sm" className="h-8 text-xs flex-1 font-semibold">
              Crear
            </Button>
            <Button variant="ghost" onClick={onCancel} size="sm" className="h-8 text-xs">
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 w-10 border-r border-gray-100 bg-white flex items-center justify-center">
      <button
        type="button"
        onClick={() => onOpen(insertAt)}
        title="Insertar columna aquí"
        className="h-8 w-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function KanbanBoard({
  cards: initialCards,
  stages,
  entityType,
  onCardMove,
  onCardCreate,
  onCardUpdate,
  onCardDelete,
  onStageEdit,
  onStageDelete,
  onStageCreate,
  onStageMove,
  onTagAdd,
  onTagRemove,
  onCardClick,
  getEntityName,
  getEntityDetails,
  availableEntities,
}: KanbanBoardProps) {
  const [cards, setCards] = useState<Record<string, PipelineCard[]>>({})
  const [entityNames, setEntityNames] = useState<Record<string, string>>({})
  const [entityDetails, setEntityDetails] = useState<Record<string, { email?: string; telefono?: string }>>({})
  const [draggedCard, setDraggedCard] = useState<PipelineCard | null>(null)
  const [draggedOver, setDraggedOver] = useState<{ stage: string; position: number } | null>(null)
  const [showAddCard, setShowAddCard] = useState<string | null>(null)
  const [newCardEntityIdState, setNewCardEntityIdState] = useState('')
  const [showNewColumnAt, setShowNewColumnAt] = useState<number | null>(null)
  const [newColumnName, setNewColumnName] = useState('')
  const [newColumnColor, setNewColumnColor] = useState('#3B82F6')
  const boardRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  const boardStages = stages.map((s) => ({ name: s.name, color: s.color, id: s.id }))

  useEffect(() => {
    const board = boardRef.current
    const header = headerRef.current
    if (!board || !header) return
    const syncBoard = () => { header.scrollLeft = board.scrollLeft }
    const syncHeader = () => { board.scrollLeft = header.scrollLeft }
    board.addEventListener('scroll', syncBoard)
    header.addEventListener('scroll', syncHeader)
    return () => {
      board.removeEventListener('scroll', syncBoard)
      header.removeEventListener('scroll', syncHeader)
    }
  }, [])

  useEffect(() => {
    const grouped: Record<string, PipelineCard[]> = {}
    initialCards.forEach((card) => {
      if (!grouped[card.stage]) grouped[card.stage] = []
      grouped[card.stage].push(card)
    })
    Object.keys(grouped).forEach((stage) => {
      grouped[stage].sort((a, b) => a.position - b.position)
    })
    setCards(grouped)

    const loadEntityData = async () => {
      const names: Record<string, string> = {}
      const details: Record<string, { email?: string; telefono?: string }> = {}
      const uniqueEntityIds = Array.from(new Set(initialCards.map((c) => c.entity_id)))
      await Promise.all(
        uniqueEntityIds.map(async (id) => {
          try {
            names[id] = await getEntityName(id)
            details[id] = await getEntityDetails(id)
          } catch {
            names[id] = 'Sin nombre'
          }
        })
      )
      setEntityNames(names)
      setEntityDetails(details)
    }
    loadEntityData()
  }, [initialCards, getEntityName, getEntityDetails])

  const handleDragStart = (e: React.DragEvent, card: PipelineCard) => {
    setDraggedCard(card)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', card.id)
  }

  const handleDragOver = (e: React.DragEvent, stage: string, position: number) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDraggedOver({ stage, position })
  }

  const handleDrop = async (e: React.DragEvent, targetStage: string, targetPosition: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (!draggedCard) return

    const snapshot = { ...cards }
    const updatedCards = { ...cards }
    const sourceStage = draggedCard.stage

    if (updatedCards[sourceStage]) {
      updatedCards[sourceStage] = updatedCards[sourceStage].filter((c) => c.id !== draggedCard.id)
    }
    if (!updatedCards[targetStage]) updatedCards[targetStage] = []

    const newCard = { ...draggedCard, stage: targetStage, position: targetPosition }
    updatedCards[targetStage].splice(targetPosition, 0, newCard)
    updatedCards[targetStage].forEach((c, i) => { c.position = i })

    setCards(updatedCards)

    try {
      await onCardMove(draggedCard.id, targetStage, targetPosition)
      setDraggedCard(null)
      setDraggedOver(null)
    } catch (error) {
      console.error('Error moving card:', error)
      setCards(snapshot)
      setDraggedCard(null)
      setDraggedOver(null)
    }
  }

  const cancelNewColumn = () => {
    setShowNewColumnAt(null)
    setNewColumnName('')
    setNewColumnColor('#3B82F6')
  }

  const handleCreateColumn = async () => {
    if (!newColumnName.trim() || showNewColumnAt == null) return
    const name = newColumnName.trim()
    const insertAt = showNewColumnAt
    try {
      await onStageCreate(name, newColumnColor, insertAt)
      cancelNewColumn()
    } catch (error) {
      console.error('Error creating column:', error)
    }
  }

  const renderColumnPair = (stage: { name: string; color: string; id: string }, index: number) => {
    const stageCards = cards[stage.name] || []
    const commonProps = {
      stage,
      cards: stageCards,
      entityType,
      draggedCard,
      draggedOver,
      entityNames,
      entityDetails,
      availableEntities,
      showAddCard,
      newCardEntityId: newCardEntityIdState,
      onDragStart: handleDragStart,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
      onCardClick,
      onAddCardClick: (stageName: string) => {
        setShowAddCard(stageName)
        setNewCardEntityIdState('')
      },
      onCardSelect: (entityId: string) => setNewCardEntityIdState(entityId),
      onAddCardCancel: () => {
        setShowAddCard(null)
        setNewCardEntityIdState('')
      },
      onStageEdit,
      onStageDelete,
      onStageMove,
      canMoveLeft: index > 0,
      canMoveRight: index < boardStages.length - 1,
      onTagAdd,
      onTagRemove,
      onCardCreate,
      onCardUpdate,
      onCardDelete,
    }

    return (
      <>
        <InsertColumnSlot
          insertAt={index}
          showForm={showNewColumnAt === index}
          newColumnName={newColumnName}
          newColumnColor={newColumnColor}
          onOpen={(at) => {
            cancelNewColumn()
            setShowNewColumnAt(at)
          }}
          onNameChange={setNewColumnName}
          onColorChange={setNewColumnColor}
          onCreate={handleCreateColumn}
          onCancel={cancelNewColumn}
        />
        <div key={`header-${stage.id}`} className="flex-shrink-0 w-[300px] border-r border-gray-200 bg-white">
          <KanbanColumn {...commonProps} headerOnly />
        </div>
      </>
    )
  }

  return (
    <div className="h-full w-full flex flex-col bg-white">
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        <div
          ref={headerRef}
          className="flex-shrink-0 border-b-2 border-gray-200 bg-white z-20 shadow-sm overflow-x-auto overflow-y-hidden"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="flex min-w-max">
            {boardStages.map((stage, index) => (
              <Fragment key={stage.id}>{renderColumnPair(stage, index)}</Fragment>
            ))}
            <InsertColumnSlot
              insertAt={boardStages.length}
              showForm={showNewColumnAt === boardStages.length}
              newColumnName={newColumnName}
              newColumnColor={newColumnColor}
              onOpen={(at) => {
                cancelNewColumn()
                setShowNewColumnAt(at)
              }}
              onNameChange={setNewColumnName}
              onColorChange={setNewColumnColor}
              onCreate={handleCreateColumn}
              onCancel={cancelNewColumn}
            />
            {showNewColumnAt == null && (
              <div className="flex-shrink-0 w-[300px] border-r border-gray-200 bg-white">
                <div className="px-5 py-4 h-full flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowNewColumnAt(boardStages.length)}
                    className="w-full h-11 flex items-center justify-center text-gray-500 hover:text-gray-700 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    <span className="text-sm font-medium">Nueva columna al final</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          ref={boardRef}
          className="flex-1 overflow-x-auto overflow-y-auto bg-gray-50"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#CBD5E1 #F1F5F9' }}
        >
          <div className="flex min-w-max" style={{ minHeight: '100%' }}>
            {boardStages.map((stage, index) => {
              const stageCards = cards[stage.name] || []
              return (
                <Fragment key={stage.id}>
                  <div key={`gap-${stage.id}`} className="flex-shrink-0 w-10 border-r border-gray-100 bg-transparent" />
                  <div key={`cards-${stage.id}`} className="flex-shrink-0 w-[300px] bg-transparent">
                    <KanbanColumn
                      stage={stage}
                      cards={stageCards}
                      entityType={entityType}
                      draggedCard={draggedCard}
                      draggedOver={draggedOver}
                      entityNames={entityNames}
                      entityDetails={entityDetails}
                      availableEntities={availableEntities}
                      showAddCard={showAddCard}
                      newCardEntityId={newCardEntityIdState}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onCardClick={onCardClick}
                      onAddCardClick={(stageName) => {
                        setShowAddCard(stageName)
                        setNewCardEntityIdState('')
                      }}
                      onCardSelect={(entityId) => setNewCardEntityIdState(entityId)}
                      onAddCardCancel={() => {
                        setShowAddCard(null)
                        setNewCardEntityIdState('')
                      }}
                      onStageEdit={onStageEdit}
                      onStageDelete={onStageDelete}
                      onStageMove={onStageMove}
                      canMoveLeft={index > 0}
                      canMoveRight={index < boardStages.length - 1}
                      onTagAdd={onTagAdd}
                      onTagRemove={onTagRemove}
                      onCardCreate={onCardCreate}
                      onCardUpdate={onCardUpdate}
                      onCardDelete={onCardDelete}
                      headerOnly={false}
                    />
                  </div>
                </Fragment>
              )
            })}
            <div className="flex-shrink-0 w-10 bg-transparent" />
            <div className="flex-shrink-0 w-[300px] bg-transparent" />
          </div>
        </div>
      </div>
    </div>
  )
}
