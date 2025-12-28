'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, DollarSign, FileText, Tag, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface PipelineCard {
  id?: string
  entity_id: string
  entity_type: 'client' | 'contact'
  stage: string
  stage_color?: string
  tags?: string[]
  capture_date?: string | null
  amount?: number | null
  notes?: string | null
}

interface CardFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: Omit<PipelineCard, 'id'>) => Promise<void>
  card?: PipelineCard | null
  entityName?: string
  entityId?: string // Agregar entityId como prop
  availableEntities?: Array<{ id: string; name: string }>
  entityType: 'client' | 'contact'
  stage: string
  stageColor?: string
}

export default function CardFormModal({
  isOpen,
  onClose,
  onSave,
  card,
  entityName,
  entityId: propEntityId,
  availableEntities = [],
  entityType,
  stage,
  stageColor = '#3B82F6',
}: CardFormModalProps) {
  const [entityId, setEntityId] = useState(card?.entity_id || propEntityId || '')
  const [selectedEntityName, setSelectedEntityName] = useState(entityName || '')
  const [captureDate, setCaptureDate] = useState(
    card?.capture_date ? new Date(card.capture_date).toISOString().split('T')[0] : ''
  )
  const [amount, setAmount] = useState(card?.amount?.toString() || '')
  const [notes, setNotes] = useState(card?.notes || '')
  const [tags, setTags] = useState<string[]>(card?.tags || [])
  const [newTag, setNewTag] = useState('')
  const [searchEntity, setSearchEntity] = useState('')
  const [showEntitySearch, setShowEntitySearch] = useState(!card && !entityName && !propEntityId)

  useEffect(() => {
    if (card) {
      setEntityId(card.entity_id)
      setSelectedEntityName(entityName || '')
      setCaptureDate(card.capture_date ? new Date(card.capture_date).toISOString().split('T')[0] : '')
      setAmount(card.amount?.toString() || '')
      setNotes(card.notes || '')
      setTags(card.tags || [])
      setShowEntitySearch(false)
    } else if (propEntityId && entityName) {
      // Si viene pre-seleccionado desde el dropdown
      setEntityId(propEntityId)
      setSelectedEntityName(entityName)
      setShowEntitySearch(false)
    } else if (entityName) {
      // Solo nombre, buscar el ID
      const foundEntity = availableEntities.find(e => e.name === entityName)
      if (foundEntity) {
        setEntityId(foundEntity.id)
        setSelectedEntityName(entityName)
        setShowEntitySearch(false)
      } else {
        setShowEntitySearch(true)
      }
    } else {
      setShowEntitySearch(true)
    }
  }, [card, entityName, propEntityId, availableEntities])

  const filteredEntities = availableEntities.filter((entity) =>
    entity.name.toLowerCase().includes(searchEntity.toLowerCase())
  )

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove))
  }

  const handleSelectEntity = (entity: { id: string; name: string }) => {
    setEntityId(entity.id)
    setSelectedEntityName(entity.name)
    setShowEntitySearch(false)
    setSearchEntity('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validación mejorada
    if (!entityId || entityId.trim().length === 0) {
      alert('Por favor, selecciona un ' + (entityType === 'contact' ? 'contacto' : 'cliente'))
      return
    }

    // Validar que el entityId existe en availableEntities si está disponible
    if (availableEntities.length > 0 && !availableEntities.find(e => e.id === entityId)) {
      alert('El ' + (entityType === 'contact' ? 'contacto' : 'cliente') + ' seleccionado no es válido')
      return
    }

    try {
      await onSave({
        entity_id: entityId.trim(),
        entity_type: entityType,
        stage,
        stage_color: stageColor,
        tags,
        capture_date: captureDate ? captureDate : null, // Ya está en formato YYYY-MM-DD, la API lo convertirá
        amount: amount ? parseFloat(amount) : null,
        notes: notes || null,
      })
      handleClose()
    } catch (error) {
      console.error('Error saving card:', error)
      alert('Error al guardar la tarjeta. Por favor, intenta de nuevo.')
    }
  }

  const handleClose = () => {
    setEntityId('')
    setSelectedEntityName('')
    setCaptureDate('')
    setAmount('')
    setNotes('')
    setTags([])
    setNewTag('')
    setSearchEntity('')
    setShowEntitySearch(!card && !entityName)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {card ? 'Editar Tarjeta' : 'Nueva Tarjeta'}
          </DialogTitle>
          <DialogDescription>
            {card ? 'Modifica los datos de la tarjeta' : 'Completa la información de la nueva tarjeta'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Selección de Contacto/Cliente */}
          <div>
            <Label className="text-sm font-semibold mb-2 flex items-center gap-2">
              <User className="h-4 w-4" />
              {entityType === 'contact' ? 'Contacto' : 'Cliente'}
            </Label>
            {showEntitySearch ? (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    type="text"
                    value={searchEntity}
                    onChange={(e) => setSearchEntity(e.target.value)}
                    placeholder="Buscar contacto..."
                    className="w-full"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-md">
                  {filteredEntities.length === 0 ? (
                    <div className="p-3 text-sm text-gray-400 text-center">
                      Sin resultados
                    </div>
                  ) : (
                    filteredEntities.map((entity) => (
                      <button
                        key={entity.id}
                        type="button"
                        onClick={() => handleSelectEntity(entity)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors border-b last:border-b-0"
                      >
                        {entity.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">
                    {selectedEntityName || (entityId ? `ID: ${entityId}` : 'Sin seleccionar')}
                  </span>
                  {entityId && (
                    <span className="text-xs text-gray-500 ml-2">({entityId})</span>
                  )}
                </div>
                {!card && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowEntitySearch(true)
                      setEntityId('')
                      setSelectedEntityName('')
                    }}
                    className="text-xs"
                  >
                    Cambiar
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Fecha de Captación */}
          <div>
            <Label className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Fecha de Captación
            </Label>
            <Input
              type="date"
              value={captureDate}
              onChange={(e) => setCaptureDate(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Cantidad */}
          <div>
            <Label className="text-sm font-semibold mb-2 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Cantidad (€)
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full"
            />
          </div>

          {/* Etiquetas */}
          <div>
            <Label className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Etiquetas
            </Label>
            <div className="flex gap-2 mb-2">
              <Input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTag()
                  }
                }}
                placeholder="Agregar etiqueta..."
                className="flex-1"
              />
              <Button type="button" onClick={handleAddTag} size="sm" variant="outline">
                Agregar
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-blue-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <Label className="text-sm font-semibold mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notas
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Agrega notas adicionales sobre esta tarjeta..."
              rows={4}
              className="w-full"
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" className="min-w-[100px]">
              {card ? 'Guardar Cambios' : 'Crear Tarjeta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

