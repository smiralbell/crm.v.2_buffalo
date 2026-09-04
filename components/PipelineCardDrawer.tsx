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
  ExternalLink,
  FolderKanban,
  BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/router'
import { BUFFALO_STAGE_COLORS, defaultStageColor } from '@/lib/pipelines/defaults'
import type { PipelineStageRow } from '@/lib/pipelines/stages'
import type {
  PipelineCardContext,
  PipelineProjectContext,
} from '@/lib/pipelines/card-context.types'
import CrmActivityTimeline from '@/components/crm/CrmActivityTimeline'
import { leadContextHref, leadNewNoteHref } from '@/lib/crm/lead-from-route'

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

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(val: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(val)
}

function ProjectContextBlock({
  project,
  loading,
  onNavigate,
}: {
  project: PipelineProjectContext | null | undefined
  loading: boolean
  onNavigate: (href: string) => void
}) {
  if (loading && !project) {
    return (
      <div className="px-6 pb-5">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <BookOpen className="h-3.5 w-3.5" />
          <span className="font-semibold uppercase tracking-wider">Contexto del proyecto</span>
        </div>
        <div className="h-28 rounded-xl bg-gray-50 border border-gray-100 animate-pulse" />
      </div>
    )
  }

  if (!project) return null

  return (
    <div className="px-6 pb-5">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
        <BookOpen className="h-3.5 w-3.5" />
        <span className="font-semibold uppercase tracking-wider">Contexto del proyecto</span>
      </div>

      {!project.has_any ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3.5 py-3 space-y-2.5">
          <p className="text-sm text-gray-600">
            Aún no hay proyecto ni configuración guardada para este lead.
          </p>
          {project.hrefs.onboarding && (
            <Button
              type="button"
              variant="outline"
              className="w-full h-9 text-sm rounded-lg border-gray-200"
              onClick={() => onNavigate(project.hrefs.onboarding!)}
            >
              <Settings className="h-3.5 w-3.5 mr-2" />
              Configurar proyecto
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-3">
          {(project.title || project.status || project.mode) && (
            <div>
              {project.title && (
                <p className="text-sm font-semibold text-gray-900 leading-snug">{project.title}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {project.mode && (
                  <span className="px-2 py-0.5 rounded-md bg-gray-100 text-[11px] font-medium text-gray-600">
                    {project.mode === 'custom' ? 'A medida' : 'Packaged'}
                  </span>
                )}
                {project.status && (
                  <span className="px-2 py-0.5 rounded-md bg-gray-100 text-[11px] font-medium text-gray-600 capitalize">
                    {project.status}
                  </span>
                )}
              </div>
            </div>
          )}

          {project.description && (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {project.description}
            </p>
          )}

          {project.services.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {project.services.map((s) => (
                <span
                  key={s}
                  className="px-2 py-1 rounded-full bg-slate-50 border border-slate-100 text-[11px] font-semibold text-slate-700"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {(project.setup_eur != null || project.monthly_eur != null) && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {project.setup_eur != null && project.setup_eur > 0 && (
                <div className="rounded-lg bg-gray-50 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                    Setup
                  </p>
                  <p className="font-semibold text-gray-900">{formatMoney(project.setup_eur)}</p>
                </div>
              )}
              {project.monthly_eur != null && project.monthly_eur > 0 && (
                <div className="rounded-lg bg-gray-50 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                    {project.monthly_label || 'Mensual'}
                  </p>
                  <p className="font-semibold text-gray-900">{formatMoney(project.monthly_eur)}</p>
                </div>
              )}
            </div>
          )}

          {project.scope_text && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                Alcance
              </p>
              <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                {project.scope_text}
              </p>
            </div>
          )}

          {project.onboarding_summary && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                Resumen onboarding
              </p>
              <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                {project.onboarding_summary}
              </p>
            </div>
          )}

          {project.onboarding_notes && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                Notas de configuración
              </p>
              <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                {project.onboarding_notes}
              </p>
            </div>
          )}

          {project.lead_notas && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                Notas del lead
              </p>
              <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                {project.lead_notas}
              </p>
            </div>
          )}

          {project.last_meeting_summary && (
            <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wider text-violet-500 font-semibold mb-1">
                Última reunión
                {project.last_meeting_title ? ` · ${project.last_meeting_title}` : ''}
              </p>
              <p className="text-xs text-violet-950 whitespace-pre-line leading-relaxed">
                {project.last_meeting_summary}
              </p>
            </div>
          )}

          {project.retention_excerpt && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                Contexto retención
                {project.retention_status ? ` · ${project.retention_status}` : ''}
              </p>
              <pre className="text-[11px] text-gray-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto bg-gray-50 rounded-lg p-2.5 border border-gray-100 font-sans">
                {project.retention_excerpt}
              </pre>
            </div>
          )}

          <div className="flex flex-col gap-1.5 pt-0.5">
            {project.hrefs.onboarding && (
              <button
                type="button"
                onClick={() => onNavigate(project.hrefs.onboarding!)}
                className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                <Settings className="h-3.5 w-3.5" />
                Ver / editar configuración
                <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
              </button>
            )}
            {project.hrefs.retencion && project.retention_excerpt && (
              <button
                type="button"
                onClick={() => onNavigate(project.hrefs.retencion!)}
                className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Abrir contexto completo (retención)
                <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
              </button>
            )}
            {project.hrefs.gestion && (
              <button
                type="button"
                onClick={() => onNavigate(project.hrefs.gestion!)}
                className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                <FolderKanban className="h-3.5 w-3.5" />
                Gestión del proyecto
                <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
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
  const [context, setContext] = useState<PipelineCardContext | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    if (!card) return
    setEntityName('')
    setEntityContactDetails({})
    setContext(null)
    getEntityName(card.entity_id).then(setEntityName)
    getEntityDetails(card.entity_id).then(setEntityContactDetails)

    if (isColdCallPipeline) return

    const contactId = parseInt(card.entity_id, 10)
    if (!Number.isFinite(contactId)) return

    let cancelled = false
    setContextLoading(true)
    fetch(`/api/contacts/${contactId}/pipeline-context`)
      .then(async (res) => {
        if (!res.ok) return null
        return (await res.json()) as PipelineCardContext
      })
      .then((data) => {
        if (!cancelled) setContext(data)
      })
      .catch(() => {
        if (!cancelled) setContext(null)
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [card?.entity_id, isColdCallPipeline])

  useEffect(() => {
    if (isColdCallPipeline || !context?.lead_id) return
    const lead = String(context.lead_id)
    if (router.query.lead === lead) return
    void router.replace(
      { pathname: router.pathname, query: { ...router.query, lead } },
      undefined,
      { shallow: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.lead_id, isColdCallPipeline])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
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

  const email = context?.email || entityContactDetails.email
  const telefono = context?.telefono || entityContactDetails.telefono
  const upcoming = context?.upcoming_meeting

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

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
                {(context?.origen_principal || context?.canal) && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    {context.origen_principal && (
                      <span>Origen · {context.origen_principal}</span>
                    )}
                    {context.origen_principal && context.canal && (
                      <span className="text-gray-300"> · </span>
                    )}
                    {context.canal && <span>Canal · {context.canal}</span>}
                  </p>
                )}
              </div>
            </div>
            {card.meeting_alert && !upcoming && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                Reunión ya agendada — revisa esta tarjeta antes de avanzar.
              </div>
            )}
          </div>

          {/* Contact info */}
          {(email || telefono) && (
            <div className="px-6 pb-5 space-y-2">
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-gray-900 group"
                >
                  <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="group-hover:underline break-all">{email}</span>
                </a>
              )}
              {telefono && (
                <a
                  href={`tel:${telefono}`}
                  className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-gray-900 group"
                >
                  <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="group-hover:underline">{telefono}</span>
                </a>
              )}
            </div>
          )}

          {/* Upcoming meeting */}
          {!isColdCallPipeline && (
            <div className="px-6 pb-5">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <Calendar className="h-3.5 w-3.5" />
                <span className="font-semibold uppercase tracking-wider">Reunión</span>
              </div>
              {contextLoading && !context ? (
                <div className="h-16 rounded-xl bg-gray-50 border border-gray-100 animate-pulse" />
              ) : upcoming ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-emerald-950">
                      {upcoming.title || 'Reunión agendada'}
                    </p>
                    <p className="text-sm text-emerald-800 mt-0.5">
                      {formatDateTime(upcoming.start_time)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-9 text-sm rounded-lg border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900"
                    onClick={() => router.push(upcoming.calendar_href)}
                  >
                    <Calendar className="h-3.5 w-3.5 mr-2" />
                    Ir al calendario
                    <ExternalLink className="h-3.5 w-3.5 ml-auto opacity-60" />
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-3 space-y-2.5">
                  <p className="text-sm text-gray-600">Sin reunión próxima agendada.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-9 text-sm rounded-lg border-gray-200"
                    onClick={() => router.push('/calendario')}
                  >
                    <Calendar className="h-3.5 w-3.5 mr-2" />
                    Abrir calendario
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Project / commercial context */}
          {!isColdCallPipeline && (
            <ProjectContextBlock
              project={context?.project_context}
              loading={contextLoading}
              onNavigate={(href) => router.push(href)}
            />
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
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold"
                  >
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

          {/* Lead history */}
          {!isColdCallPipeline && (
            <div className="px-6 pb-5">
              {contextLoading && !context ? (
                <div className="space-y-2">
                  <div className="h-10 rounded-lg bg-gray-50 animate-pulse" />
                  <div className="h-10 rounded-lg bg-gray-50 animate-pulse" />
                </div>
              ) : (
                <CrmActivityTimeline
                  contactId={context?.contact_id ?? parseInt(card.entity_id, 10)}
                  leadId={context?.lead_id ?? null}
                  derived={context?.timeline ?? []}
                  title="Historial del lead"
                  subtitle="Entrada, reuniones, documentos y notas"
                  compact
                />
              )}
            </div>
          )}

          {/* Pipeline progress bar */}
          <div className="px-6 pb-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Progreso del pipeline
            </div>
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
            <>
              {context?.lead_id ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 text-xs rounded-xl border-gray-200"
                    onClick={() => router.push(leadContextHref(context.lead_id!))}
                  >
                    <StickyNote className="h-3.5 w-3.5 mr-1.5" />
                    Contexto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 text-xs rounded-xl border-gray-200"
                    onClick={() => router.push(leadNewNoteHref(context.lead_id!))}
                  >
                    <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                    Nueva nota
                  </Button>
                </div>
              ) : null}
              <Button
                onClick={handleConfigure}
                className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl"
              >
                <Settings className="h-4 w-4 mr-2" />
                Configurar proyecto
              </Button>
            </>
          )}

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
                    style={{
                      color:
                        stages.find((s) => s.name === nextStage)?.color ||
                        defaultStageColor(nextStage),
                    }}
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
