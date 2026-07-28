'use client'

import { useEffect, useState } from 'react'
import {
  X,
  Settings,
  Mail,
  Phone,
  Tag,
  DollarSign,
  StickyNote,
  ChevronRight,
  Calendar,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/router'
import { BUFFALO_STAGE_COLORS, defaultStageColor } from '@/lib/pipelines/defaults'
import type { PipelineStageRow } from '@/lib/pipelines/stages'

export { BUFFALO_STAGE_COLORS }

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
  meeting_alert?: boolean
}

interface PipelineCardDrawerProps {
  card: PipelineCard | null
  pipelineId: string
  stages: PipelineStageRow[]
  getEntityName: (id: string) => Promise<string>
  getEntityDetails: (id: string) => Promise<{
    email?: string
    telefono?: string
    campaign_id?: number | null
  }>
  onCardMove: (cardId: string, newStage: string, newPosition: number) => Promise<void>
  onClose: () => void
  isColdCallPipeline?: boolean
}

export default function PipelineCardDrawer({
  card,
  pipelineId,
  stages,
  getEntityName,
  getEntityDetails,
  onCardMove,
  onClose,
  isColdCallPipeline = false,
}: PipelineCardDrawerProps) {
  const router = useRouter()
  const [entityName, setEntityName] = useState<string>('')
  const [entityContactDetails, setEntityContactDetails] = useState<{
    email?: string
    telefono?: string
    campaign_id?: number | null
  }>({})
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    if (!card) return
    setEntityName('')
    setEntityContactDetails({})
    getEntityName(card.entity_id).then(setEntityName)
    getEntityDetails(card.entity_id).then(setEntityContactDetails)
  }, [card?.entity_id])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!card) return null

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val)

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })

  const stageOrder = stages.map((s) => s.name)
  const currentStageIndex = stageOrder.indexOf(card.stage)
  const nextStage =
    currentStageIndex >= 0 && currentStageIndex < stageOrder.length - 1
      ? stageOrder[currentStageIndex + 1]
      : null

  const stageColor =
    stages.find((s) => s.name === card.stage)?.color || defaultStageColor(card.stage)

  const handleMoveNext = async () => {
    if (!nextStage) return
    setMoving(true)
    try {
      await onCardMove(card.id, nextStage, 0)
      onClose()
    } finally {
      setMoving(false)
    }
  }

  const handleConfigure = () => {
    router.push(
      `/onboarding?lead=${card.entity_id}&pipeline=${pipelineId}&card=${card.id}`
    )
  }

  const handleOpenColdCallLead = () => {
    const campaignId = entityContactDetails.campaign_id
    if (campaignId) {
      router.push(`/coldcalling/campanas/${campaignId}/leads/${card.entity_id}`)
      return
    }
    router.push(`/coldcalling/campanas`)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: stageColor }}
            />
            <span
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: stageColor }}
            >
              {card.stage}
            </span>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Name + avatar */}
          <div className="px-6 pt-5 pb-5">
            <div className="flex items-start gap-3">
              <div className="relative flex-shrink-0">
                <div className="w-11 h-11 rounded-full bg-gray-900 flex items-center justify-center text-white text-base font-bold">
                  {(entityName || '?').charAt(0).toUpperCase()}
                </div>
                {card.meeting_alert && (
                  <span
                    className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white"
                    title="Reunión agendada · revisar"
                  >
                    1
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-gray-900 leading-tight truncate">
                  {entityName || 'Cargando...'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">ID #{card.entity_id}</p>
              </div>
            </div>
            {card.meeting_alert && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                Reunión ya agendada — revisa esta tarjeta antes de avanzar.
              </div>
            )}
          </div>

          {/* Contact info */}
          {(entityContactDetails.email || entityContactDetails.telefono) && (
            <div className="px-6 pb-5 space-y-2">
              {entityContactDetails.email && (
                <a
                  href={`mailto:${entityContactDetails.email}`}
                  className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-gray-900 group"
                >
                  <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="group-hover:underline">{entityContactDetails.email}</span>
                </a>
              )}
              {entityContactDetails.telefono && (
                <a
                  href={`tel:${entityContactDetails.telefono}`}
                  className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-gray-900 group"
                >
                  <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="group-hover:underline">{entityContactDetails.telefono}</span>
                </a>
              )}
            </div>
          )}

          <div className="mx-6 border-t border-gray-100" />

          {/* Deal value */}
          {card.amount ? (
            <div className="px-6 py-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <DollarSign className="h-3.5 w-3.5" />
                <span className="font-semibold uppercase tracking-wider">Valor del deal</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(Number(card.amount))}
              </div>
            </div>
          ) : null}

          {/* Capture date */}
          {card.capture_date && (
            <div className="px-6 pb-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <Calendar className="h-3.5 w-3.5" />
                <span className="font-semibold uppercase tracking-wider">Fecha de captura</span>
              </div>
              <div className="text-sm font-medium text-gray-700">
                {formatDate(card.capture_date)}
              </div>
            </div>
          )}

          {/* Tags */}
          {card.tags?.length > 0 && (
            <div className="px-6 pb-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <Tag className="h-3.5 w-3.5" />
                <span className="font-semibold uppercase tracking-wider">Etiquetas</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {card.tags.map((tag, i) => (
                  <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {card.notes && (
            <div className="px-6 pb-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <StickyNote className="h-3.5 w-3.5" />
                <span className="font-semibold uppercase tracking-wider">
                  {isColdCallPipeline ? 'Notas del comercial' : 'Notas'}
                </span>
              </div>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3.5 leading-relaxed border border-gray-100 whitespace-pre-line">
                {card.notes}
              </p>
            </div>
          )}

          {/* Pipeline progress bar */}
          <div className="px-6 pb-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Progreso del pipeline
            </div>
            {/* Progress segments */}
            <div className="flex gap-1">
              {stages.map((stage, i) => (
                <div
                  key={stage.id}
                  title={stage.name}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-all',
                    i <= currentStageIndex ? 'opacity-100' : 'opacity-15'
                  )}
                  style={{ backgroundColor: stage.color }}
                />
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Etapa <strong>{currentStageIndex + 1}</strong> de <strong>{stageOrder.length}</strong>
              {nextStage && (
                <span className="ml-1 text-gray-400">
                  · Siguiente: <span className="font-medium text-gray-600">{nextStage}</span>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-100 px-6 py-4 space-y-2.5 bg-white">
          {isColdCallPipeline ? (
            <Button
              onClick={handleOpenColdCallLead}
              className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl"
            >
              <User className="h-4 w-4 mr-2" />
              Ver lead
            </Button>
          ) : (
            <Button
              onClick={handleConfigure}
              className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl"
            >
              <Settings className="h-4 w-4 mr-2" />
              Configurar proyecto
            </Button>
          )}

          {/* Move to next stage */}
          {nextStage && (
            <Button
              onClick={handleMoveNext}
              disabled={moving}
              variant="outline"
              className="w-full h-11 text-sm font-medium rounded-xl border-gray-200 hover:border-gray-300"
            >
              {moving ? (
                <span className="text-gray-500">Moviendo...</span>
              ) : (
                <>
                  <span className="text-gray-600">Mover a</span>
                  <span
                    className="ml-1.5 font-bold"
                    style={{ color: stages.find((s) => s.name === nextStage)?.color || defaultStageColor(nextStage) }}
                  >
                    {nextStage}
                  </span>
                  <ChevronRight className="h-4 w-4 ml-auto text-gray-400" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
