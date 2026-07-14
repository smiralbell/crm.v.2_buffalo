'use client'

import { useState, useEffect } from 'react'
import { Plus, X, Edit2, MoreVertical, Search, Trash2, Palette, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import CardFormModal from './CardFormModal'

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

interface KanbanColumnProps {
  stage: {
    name: string
    color: string
  }
  cards: PipelineCard[]
  entityType: 'client' | 'contact'
  draggedCard: PipelineCard | null
  draggedOver: { stage: string; position: number } | null
  entityNames: Record<string, string>
  entityDetails: Record<string, { email?: string; telefono?: string }>
  availableEntities: Array<{ id: string; name: string }>
  showAddCard: string | null
  newCardEntityId: string
  onDragStart: (e: React.DragEvent, card: PipelineCard) => void
  onDragOver: (e: React.DragEvent, stage: string, position: number) => void
  onDrop: (e: React.DragEvent, stage: string, position: number) => void
  onAddCardClick: (stage: string) => void
  onCardSelect: (entityId: string) => void
  onAddCardCancel: () => void
  onStageEdit: (stageName: string, newName: string, newColor: string) => void
  onStageDelete: (stageName: string) => void
  onStageMove?: (stageName: string, direction: 'left' | 'right') => void
  canMoveLeft?: boolean
  canMoveRight?: boolean
  onTagAdd: (cardId: string, tag: string) => void
  onTagRemove: (cardId: string, tag: string) => void
  onCardClick?: (card: PipelineCard) => void
  onCardCreate?: (data: Omit<PipelineCard, 'id' | 'position' | 'created_at' | 'updated_at'> & { stage_color?: string }) => Promise<void>
  onCardUpdate?: (cardId: string, data: Partial<PipelineCard>) => Promise<void>
  onCardDelete?: (cardId: string) => Promise<void>
  headerOnly?: boolean
}

export default function KanbanColumn({
  stage,
  cards,
  entityType,
  draggedCard,
  draggedOver,
  entityNames,
  entityDetails,
  availableEntities,
  showAddCard,
  newCardEntityId,
  onDragStart,
  onDragOver,
  onDrop,
  onAddCardClick,
  onCardSelect,
  onAddCardCancel,
  onStageEdit,
  onStageDelete,
  onStageMove,
  canMoveLeft = false,
  canMoveRight = false,
  onTagAdd,
  onTagRemove,
  onCardClick,
  onCardCreate,
  onCardUpdate,
  onCardDelete,
  headerOnly = false,
}: KanbanColumnProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(stage.name)
  const [editColor, setEditColor] = useState(stage.color)
  const [showTagInput, setShowTagInput] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')
  const [searchEntity, setSearchEntity] = useState('')
  const [showCardModal, setShowCardModal] = useState(false)
  const [editingCard, setEditingCard] = useState<PipelineCard | null>(null)
  const [selectedEntityForNewCard, setSelectedEntityForNewCard] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    setEditName(stage.name)
    setEditColor(stage.color)
  }, [stage.name, stage.color])

  const isDraggedOver = draggedOver?.stage === stage.name

  const handleSaveEdit = () => {
    const trimmed = editName.trim()
    if (!trimmed) return
    if (trimmed !== stage.name || editColor !== stage.color) {
      onStageEdit(stage.name, trimmed, editColor)
    }
    setIsEditing(false)
  }

  const handleAddTag = (cardId: string) => {
    if (newTag.trim()) {
      onTagAdd(cardId, newTag.trim())
      setNewTag('')
      setShowTagInput(null)
    }
  }

  const filteredEntities = availableEntities.filter((entity) =>
    entity.name.toLowerCase().includes(searchEntity.toLowerCase())
  )

  const getDaysAgo = (card: PipelineCard) => {
    // Usar capture_date si está disponible, sino usar created_at
    const dateString = card.capture_date || card.created_at
    if (!dateString) return 0
    
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const columnValue = cards.reduce((sum, card) => sum + (card.amount ? Number(card.amount) : 0), 0)
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  // Modo Header Only - Solo muestra el header
  if (headerOnly) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 bg-white px-5 py-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div
                className="w-1 h-5 rounded-full flex-shrink-0"
                style={{ backgroundColor: stage.color || '#3B82F6' }}
              />
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit()
                      if (e.key === 'Escape') {
                        setIsEditing(false)
                        setEditName(stage.name)
                      }
                    }}
                    className="h-7 text-sm font-bold px-2.5 py-1.5 border-2"
                    autoFocus
                  />
                ) : (
                  <h3
                    className="text-sm font-bold text-gray-900 cursor-pointer hover:text-gray-700 transition-colors leading-tight truncate"
                    onClick={() => setIsEditing(true)}
                  >
                    {stage.name}
                  </h3>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors flex-shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditName(stage.name)
                  setEditColor(stage.color)
                  setIsEditing(true)
                }}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Editar columna
                </DropdownMenuItem>
                {onStageMove && canMoveLeft && (
                  <DropdownMenuItem onClick={() => onStageMove(stage.name, 'left')}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Mover a la izquierda
                  </DropdownMenuItem>
                )}
                {onStageMove && canMoveRight && (
                  <DropdownMenuItem onClick={() => onStageMove(stage.name, 'right')}>
                    <ChevronRight className="h-4 w-4 mr-2" />
                    Mover a la derecha
                  </DropdownMenuItem>
                )}
                {cards.length === 0 && (
                  <DropdownMenuItem
                    onClick={() => onStageDelete(stage.name)}
                    className="text-red-600"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Eliminar columna
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-xs text-gray-600 leading-tight">
            <span className="font-semibold text-gray-700">{formatCurrency(columnValue)}</span>
            <span className="mx-1.5 text-gray-400">·</span>
            <span>
              {cards.length} {cards.length === 1 ? 'oportunidad' : 'oportunidades'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Modo Cards - Área de tarjetas
  return (
    <>
      <div
        className="h-full w-full"
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDragOver(e, stage.name, cards.length)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDrop(e, stage.name, cards.length)
        }}
      >
        <div
          className={cn(
            'h-full flex flex-col bg-transparent transition-all duration-200',
            isDraggedOver && 'bg-blue-50/50'
          )}
        >
          {/* Área de tarjetas - Espacio libre profesional */}
          <div className="px-4 py-5 space-y-3 bg-transparent min-h-[400px]">
            {/* Indicador visual cuando se arrastra sobre esta columna */}
            {isDraggedOver && draggedCard && draggedCard.stage !== stage.name && (
              <div className="mb-3 h-2 bg-blue-400 rounded-full animate-pulse" />
            )}
            {cards.map((card, index) => {
              const entityName = entityNames[card.entity_id] || 'Cargando...'
              const details = entityDetails[card.entity_id] || {}
              const isDragging = draggedCard?.id === card.id
              const daysAgo = getDaysAgo(card)
              const cardValue = card.amount ? Number(card.amount) : 0
              const cardTags = card.tags || []

              const cardColor = card.stage_color || '#FFFFFF'
              const isWhiteCard = cardColor === '#FFFFFF' || cardColor.toUpperCase() === '#FFFFFF'
              const CARD_COLORS: { value: string; label: string }[] = [
                { value: '#FFFFFF', label: 'Blanco' },
                { value: '#3B82F6', label: 'Azul' },
                { value: '#10B981', label: 'Verde' },
                { value: '#F59E0B', label: 'Ámbar' },
                { value: '#EF4444', label: 'Rojo' },
                { value: '#8B5CF6', label: 'Violeta' },
                { value: '#EC4899', label: 'Rosa' },
                { value: '#06B6D4', label: 'Cian' },
                { value: '#F97316', label: 'Naranja' },
              ]

              return (
                <div
                  key={card.id}
                  draggable={true}
                  onDragStart={(e) => {
                    e.stopPropagation()
                    onDragStart(e, card)
                  }}
                  onClick={() => onCardClick?.(card)}
                  onDoubleClick={() => {
                    setEditingCard(card)
                    setShowCardModal(true)
                  }}
                  className={cn(
                    'rounded-lg p-4 border relative',
                    isWhiteCard ? 'bg-white border-gray-200' : 'border-gray-200/50',
                    'cursor-grab active:cursor-grabbing',
                    'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
                    'select-none',
                    isDragging && 'opacity-30 scale-95 rotate-1 z-50',
                    onCardClick && 'cursor-pointer'
                  )}
                  style={isWhiteCard ? { boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' } : { backgroundColor: cardColor, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.1)' }}
                >
                  {/* Menú 3 puntos - arriba a la derecha */}
                  <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'h-7 w-7 flex items-center justify-center rounded transition-colors',
                            isWhiteCard ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100' : 'text-white/80 hover:text-white hover:bg-white/20'
                          )}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onCardClick && (
                          <DropdownMenuItem
                            onClick={() => onCardClick(card)}
                            className="font-medium"
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            Configurar proyecto
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Palette className="h-4 w-4 mr-2" />
                            Poner color a la tarjeta
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {CARD_COLORS.map(({ value, label }) => (
                              <DropdownMenuItem
                                key={value}
                                onClick={() => onCardUpdate?.(card.id, { stage_color: value })}
                              >
                                <span
                                  className="w-4 h-4 rounded border border-gray-300 mr-2 inline-block"
                                  style={{ backgroundColor: value }}
                                />
                                {label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        {onCardDelete && (
                          <DropdownMenuItem
                            onClick={() => onCardDelete(card.id)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Eliminar tarjeta
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Nombre principal */}
                  <div className={cn('font-bold text-[15px] mb-1 leading-tight pr-8', isWhiteCard ? 'text-gray-900' : 'text-white drop-shadow-sm')}>
                    {entityName}
                  </div>

                  {/* Sub-nombre */}
                  <div className={cn('text-xs mb-2 leading-tight', isWhiteCard ? 'text-gray-500' : 'text-white/80')}>
                    {entityName}
                  </div>

                  {/* Etiquetas */}
                  {cardTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {cardTags.slice(0, 3).map((tag, tagIndex) => (
                        <span
                          key={tagIndex}
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium',
                            isWhiteCard ? 'bg-blue-100 text-blue-700' : 'bg-white/25 text-white'
                          )}
                        >
                          {tag}
                        </span>
                      ))}
                      {cardTags.length > 3 && (
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium',
                          isWhiteCard ? 'bg-gray-100 text-gray-600' : 'bg-white/25 text-white'
                        )}>
                          +{cardTags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer con badge, valor y logo */}
                  <div className={cn('flex items-center justify-between pt-3', isWhiteCard ? 'border-t border-gray-100' : 'border-t border-white/30')}>
                    <span 
                      className={cn(
                        'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold leading-none',
                        isWhiteCard ? 'bg-red-100 text-red-700' : 'bg-white/25 text-white'
                      )}
                    >
                      {daysAgo}d
                    </span>
                    <span className={cn('text-sm font-semibold', isWhiteCard ? 'text-gray-900' : 'text-white')}>
                      {formatCurrency(card.amount ? Number(card.amount) : 0)}
                    </span>
                    <div 
                      className={cn(
                        'flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold leading-none',
                        isWhiteCard ? 'bg-emerald-500 text-white' : 'bg-white/30 text-white'
                      )}
                    >
                      {cardTags.length > 0 ? cardTags.length : '0'}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Botón agregar card */}
            {showAddCard === stage.name ? (
              <div className="bg-white rounded-lg p-4 border-2 border-blue-300 shadow-sm">
                <div className="relative mb-2.5">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    type="text"
                    value={searchEntity}
                    onChange={(e) => setSearchEntity(e.target.value)}
                    placeholder="Buscar contacto..."
                    className="pl-9 pr-3 h-9 text-xs border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-0.5 mb-2.5">
                  {filteredEntities.length === 0 ? (
                    <div className="text-xs text-gray-400 text-center py-3">
                      Sin resultados
                    </div>
                  ) : (
                    filteredEntities.slice(0, 8).map((entity) => (
                      <button
                        key={entity.id}
                        type="button"
                        onClick={() => {
                          if (onCardCreate) {
                            setSelectedEntityForNewCard(entity)
                            setShowCardModal(true)
                            setSearchEntity('')
                          } else {
                            onCardSelect(entity.id)
                            setSearchEntity('')
                          }
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 rounded-md transition-colors font-medium"
                      >
                        {entity.name}
                      </button>
                    ))
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onAddCardCancel()
                    setSearchEntity('')
                  }}
                  className="w-full text-xs h-8"
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <button
                onClick={() => onAddCardClick(stage.name)}
                className="w-full py-3.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center gap-2 transition-all hover:border-gray-400 hover:shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Agregar tarjeta
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dialog para editar columna */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Columna</DialogTitle>
            <DialogDescription>
              Cambia el nombre y color de la columna
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nombre de la columna"
              />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'].map((color) => (
                  <button
                    key={color}
                    onClick={() => setEditColor(color)}
                    className={cn(
                      'w-10 h-10 rounded-lg border-2 transition-all',
                      editColor === color ? 'border-gray-900 scale-110' : 'border-gray-300 hover:scale-105'
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <Input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-10 h-10 p-0 border-0 cursor-pointer"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} className="flex-1">
                Guardar
              </Button>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Crear/Editar Tarjeta */}
      {onCardCreate && (
        <CardFormModal
          isOpen={showCardModal}
          onClose={() => {
            setShowCardModal(false)
            setEditingCard(null)
            setSelectedEntityForNewCard(null)
            onAddCardCancel()
          }}
          onSave={async (data) => {
            if (editingCard && onCardUpdate) {
              await onCardUpdate(editingCard.id!, data)
            } else if (onCardCreate) {
              await onCardCreate(data as Omit<PipelineCard, 'id' | 'position' | 'created_at' | 'updated_at'> & { stage_color?: string })
            }
            setShowCardModal(false)
            setEditingCard(null)
            setSelectedEntityForNewCard(null)
            onAddCardCancel()
          }}
          card={editingCard || null}
          entityName={editingCard ? entityNames[editingCard.entity_id] : selectedEntityForNewCard?.name}
          entityId={editingCard ? editingCard.entity_id : selectedEntityForNewCard?.id}
          availableEntities={availableEntities}
          entityType={entityType}
          stage={stage.name}
          stageColor={stage.color}
        />
      )}
    </>
  )
}
