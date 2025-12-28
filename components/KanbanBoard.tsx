'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import KanbanColumn from './KanbanColumn'

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
  entityType: 'client' | 'contact'
  onCardMove: (cardId: string, newStage: string, newPosition: number, newColor?: string) => Promise<void>
  onCardCreate: (data: Omit<PipelineCard, 'id' | 'created_at' | 'updated_at' | 'position'>) => Promise<void>
  onCardUpdate?: (cardId: string, data: Partial<PipelineCard>) => Promise<void>
  onStageEdit: (oldStage: string, newStage: string, newColor: string) => Promise<void>
  onStageDelete: (stage: string) => Promise<void>
  onStageCreate: (stageName: string, color: string) => Promise<void>
  onTagAdd: (cardId: string, tag: string) => Promise<void>
  onTagRemove: (cardId: string, tag: string) => Promise<void>
  onCardClick?: (card: PipelineCard) => void
  getEntityName: (entityId: string) => Promise<string>
  getEntityDetails: (entityId: string) => Promise<{ email?: string; telefono?: string }>
  availableEntities: Array<{ id: string; name: string }>
  stageOrder: string[]
  onStageOrderChange: (newOrder: string[]) => void
}

export default function KanbanBoard({
  pipelineId,
  cards: initialCards,
  entityType,
  onCardMove,
  onCardCreate,
  onCardUpdate,
  onStageEdit,
  onStageDelete,
  onStageCreate,
  onTagAdd,
  onTagRemove,
  onCardClick,
  getEntityName,
  getEntityDetails,
  availableEntities,
  stageOrder,
  onStageOrderChange,
}: KanbanBoardProps) {
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [cards, setCards] = useState<Record<string, PipelineCard[]>>({})
  const [entityNames, setEntityNames] = useState<Record<string, string>>({})
  const [entityDetails, setEntityDetails] = useState<Record<string, { email?: string; telefono?: string }>>({})
  const [draggedCard, setDraggedCard] = useState<PipelineCard | null>(null)
  const [draggedOver, setDraggedOver] = useState<{ stage: string; position: number } | null>(null)
  const [showAddCard, setShowAddCard] = useState<string | null>(null)
  const [newCardEntityIdState, setNewCardEntityIdState] = useState('')
  const [showNewColumn, setShowNewColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [newColumnColor, setNewColumnColor] = useState('#3B82F6')
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredCards, setFilteredCards] = useState<Record<string, PipelineCard[]>>({})
  const boardRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  // Sincronizar scroll horizontal entre headers y cards
  useEffect(() => {
    const board = boardRef.current
    const header = headerRef.current
    if (!board || !header) return

    const handleBoardScroll = () => {
      header.scrollLeft = board.scrollLeft
    }

    const handleHeaderScroll = () => {
      board.scrollLeft = header.scrollLeft
    }

    board.addEventListener('scroll', handleBoardScroll)
    header.addEventListener('scroll', handleHeaderScroll)
    
    return () => {
      board.removeEventListener('scroll', handleBoardScroll)
      header.removeEventListener('scroll', handleHeaderScroll)
    }
  }, [])

  // Agrupar cards por stage
  useEffect(() => {
    const grouped: Record<string, PipelineCard[]> = {}
    initialCards.forEach((card) => {
      if (!grouped[card.stage]) {
        grouped[card.stage] = []
      }
      grouped[card.stage].push(card)
    })

    // Ordenar por position
    Object.keys(grouped).forEach((stage) => {
      grouped[stage].sort((a, b) => a.position - b.position)
    })

    setCards(grouped)

    // Cargar nombres y detalles de entidades
    const loadEntityData = async () => {
      const names: Record<string, string> = {}
      const details: Record<string, { email?: string; telefono?: string }> = {}
      const uniqueEntityIds = Array.from(new Set(initialCards.map((c) => c.entity_id)))

      await Promise.all(
        uniqueEntityIds.map(async (id) => {
          try {
            names[id] = await getEntityName(id)
            details[id] = await getEntityDetails(id)
          } catch (error) {
            names[id] = 'Sin nombre'
          }
        })
      )

      setEntityNames(names)
      setEntityDetails(details)
    }
    loadEntityData()
  }, [initialCards, getEntityName, getEntityDetails])

  // Filtrar cards por búsqueda
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCards(cards)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered: Record<string, PipelineCard[]> = {}

    Object.keys(cards).forEach((stage) => {
      const stageCards = cards[stage].filter((card) => {
        const name = entityNames[card.entity_id]?.toLowerCase() || ''
        const email = entityDetails[card.entity_id]?.email?.toLowerCase() || ''
        const telefono = entityDetails[card.entity_id]?.telefono?.toLowerCase() || ''
        const tags = card.tags?.join(' ').toLowerCase() || ''
        return name.includes(query) || email.includes(query) || telefono.includes(query) || tags.includes(query)
      })

      if (stageCards.length > 0) {
        filtered[stage] = stageCards
      }
    })

    setFilteredCards(filtered)
  }, [searchQuery, cards, entityNames, entityDetails])

  // Obtener stages ordenados
  const getStages = () => {
    const currentCards = searchQuery ? filteredCards : cards
    const stagesFromCards = Object.keys(currentCards).map((stage) => {
      const stageCard = currentCards[stage]?.[0]
      return {
        name: stage,
        color: stageCard?.stage_color || '#3B82F6',
      }
    })

    // Si hay orden guardado, usarlo y agregar stages que no tienen cards aún
    if (stageOrder && stageOrder.length > 0) {
      const ordered: typeof stagesFromCards = []
      
      // Primero agregar stages del orden (tengan o no cards)
      stageOrder.forEach((stageName) => {
        const existingStage = stagesFromCards.find((s) => s.name === stageName)
        if (existingStage) {
          ordered.push(existingStage)
        } else {
          // Stage en el orden pero sin cards aún - agregarlo igual
          ordered.push({
            name: stageName,
            color: '#3B82F6',
          })
        }
      })
      
      // Agregar stages nuevos que no están en el orden (tienen cards pero no están en el orden)
      stagesFromCards.forEach((stage) => {
        if (!ordered.find((s) => s.name === stage.name)) {
          ordered.push(stage)
        }
      })
      
      return ordered
    }

    return stagesFromCards.length > 0 ? stagesFromCards : []
  }

  const stages = getStages()

  const handleDragStart = (e: React.DragEvent, card: PipelineCard) => {
    setDraggedCard(card)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', card.id)
    // Mejorar la imagen de arrastre
    if (e.currentTarget instanceof HTMLElement) {
      const rect = e.currentTarget.getBoundingClientRect()
      const dragImage = e.currentTarget.cloneNode(true) as HTMLElement
      dragImage.style.transform = 'rotate(2deg)'
      dragImage.style.opacity = '0.8'
      document.body.appendChild(dragImage)
      dragImage.style.position = 'absolute'
      dragImage.style.top = '-1000px'
      e.dataTransfer.setDragImage(dragImage, rect.width / 2, rect.height / 2)
      setTimeout(() => {
        if (document.body.contains(dragImage)) {
          document.body.removeChild(dragImage)
        }
      }, 0)
    }
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

    const targetColor = (searchQuery ? filteredCards : cards)[targetStage]?.[0]?.stage_color || '#3B82F6'

    // Actualizar UI optimistically
    const currentCards = searchQuery ? filteredCards : cards
    const updatedCards = { ...currentCards }
    const sourceStage = draggedCard.stage

    // Remover de stage anterior
    if (updatedCards[sourceStage]) {
      updatedCards[sourceStage] = updatedCards[sourceStage].filter((c) => c.id !== draggedCard.id)
    }

    // Agregar a nuevo stage
    if (!updatedCards[targetStage]) {
      updatedCards[targetStage] = []
    }
    const newCard = {
      ...draggedCard,
      stage: targetStage,
      stage_color: targetColor,
      position: targetPosition,
    }
    updatedCards[targetStage].splice(targetPosition, 0, newCard)
    updatedCards[targetStage].forEach((c, i) => {
      c.position = i
    })

    if (searchQuery) {
      setFilteredCards(updatedCards)
    } else {
      setCards(updatedCards)
    }

    // Actualizar en backend
    try {
      await onCardMove(draggedCard.id, targetStage, targetPosition, targetColor)
      // Limpiar estado después de éxito
      setDraggedCard(null)
      setDraggedOver(null)
    } catch (error) {
      console.error('Error moving card:', error)
      // Revertir cambios
      if (searchQuery) {
        setFilteredCards({ ...filteredCards })
      } else {
        setCards({ ...cards })
      }
      setDraggedCard(null)
      setDraggedOver(null)
    }
  }

  const handleCardSelect = async (entityId: string) => {
    // Este método ya no se usa directamente, el modal maneja la creación
    // Se mantiene por compatibilidad pero no hace nada
  }

  const handleStageEdit = async (oldStage: string, newStage: string, newColor: string) => {
    try {
      await onStageEdit(oldStage, newStage, newColor)
      if (oldStage !== newStage && stageOrder.includes(oldStage)) {
        const newOrder = stageOrder.map((s) => (s === oldStage ? newStage : s))
        onStageOrderChange(newOrder)
      }
    } catch (error) {
      console.error('Error editing stage:', error)
    }
  }

  const handleStageDelete = async (stageName: string) => {
    try {
      await onStageDelete(stageName)
      if (stageOrder.includes(stageName)) {
        const newOrder = stageOrder.filter((s) => s !== stageName)
        onStageOrderChange(newOrder)
      }
    } catch (error) {
      console.error('Error deleting stage:', error)
    }
  }

  const handleCreateColumn = async () => {
    if (!newColumnName.trim()) return

    const newStageName = newColumnName.trim()
    
    try {
      onStageOrderChange([...stageOrder, newStageName])
      setShowNewColumn(false)
      setNewColumnName('')
      setNewColumnColor('#3B82F6')
      await onStageCreate(newStageName, newColumnColor)
    } catch (error) {
      console.error('Error creating column:', error)
      onStageOrderChange(stageOrder)
      setShowNewColumn(true)
      setNewColumnName(newStageName)
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-white">
      {/* Board con scroll horizontal - Diseño profesional tipo tabla */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        {/* Fila de Headers - Sticky arriba con scroll sincronizado */}
        <div 
          ref={headerRef}
          className="flex-shrink-0 border-b-2 border-gray-200 bg-white z-20 shadow-sm overflow-x-auto overflow-y-hidden"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <div className="flex min-w-max">
            {stages.map((stage) => {
              const stageCards = (searchQuery ? filteredCards : cards)[stage.name] || []
              return (
                <div key={`header-${stage.name}`} className="flex-shrink-0 w-[300px] border-r border-gray-200 bg-white">
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
                    onCardSelect={(entityId) => {
                      setNewCardEntityIdState(entityId)
                    }}
                    onCardCreate={onCardCreate}
                    onCardUpdate={onCardUpdate}
                    onAddCardCancel={() => {
                      setShowAddCard(null)
                      setNewCardEntityIdState('')
                    }}
                    onStageEdit={handleStageEdit}
                    onStageDelete={handleStageDelete}
                    onTagAdd={onTagAdd}
                    onTagRemove={onTagRemove}
                    headerOnly={true}
                  />
                </div>
              )
            })}

            {/* Botón crear nueva columna - en header */}
            {showNewColumn ? (
              <div className="flex-shrink-0 w-[300px] border-r border-gray-200 bg-white">
                <div className="px-5 py-4 border-b-2 border-gray-200">
                  <input
                    type="text"
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    placeholder="Nombre de la columna"
                    className="w-full px-3 py-2.5 text-sm font-bold text-gray-900 border-2 border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateColumn()
                      if (e.key === 'Escape') {
                        setShowNewColumn(false)
                        setNewColumnName('')
                      }
                    }}
                  />
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'].map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewColumnColor(color)}
                        className={`w-8 h-8 rounded-lg border-2 transition-all ${
                          newColumnColor === color ? 'border-gray-900 scale-110 shadow-md' : 'border-gray-300 hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button onClick={handleCreateColumn} size="sm" className="h-8 text-xs flex-1 font-semibold">
                      Crear
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowNewColumn(false)
                        setNewColumnName('')
                      }}
                      size="sm"
                      className="h-8 text-xs"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-shrink-0 w-[300px] border-r border-gray-200 bg-white">
                <div className="px-5 py-4 h-full flex items-center">
                  <button
                    onClick={() => setShowNewColumn(true)}
                    className="w-full h-11 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-all border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    <span className="text-sm font-medium">Nueva columna</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fila de Tarjetas - Área de trabajo libre con scroll horizontal sincronizado */}
        <div 
          ref={boardRef}
          className="flex-1 overflow-x-auto overflow-y-auto bg-gray-50"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#CBD5E1 #F1F5F9'
          }}
        >
          <div className="flex min-w-max" style={{ minHeight: '100%' }}>
            {stages.map((stage) => {
              const stageCards = (searchQuery ? filteredCards : cards)[stage.name] || []
              return (
                <div key={`cards-${stage.name}`} className="flex-shrink-0 w-[300px] bg-transparent">
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
                    onCardSelect={(entityId) => {
                      setNewCardEntityIdState(entityId)
                    }}
                    onAddCardCancel={() => {
                      setShowAddCard(null)
                      setNewCardEntityIdState('')
                    }}
                    onStageEdit={handleStageEdit}
                    onStageDelete={handleStageDelete}
                    onTagAdd={onTagAdd}
                    onTagRemove={onTagRemove}
                    onCardCreate={onCardCreate}
                    onCardUpdate={onCardUpdate}
                    headerOnly={false}
                  />
                </div>
              )
            })}

            {/* Espacio para nueva columna en área de tarjetas */}
            {!showNewColumn && (
              <div className="flex-shrink-0 w-[300px] bg-transparent" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
