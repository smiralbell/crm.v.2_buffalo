/** Planificación de marketing: calendario de contenidos + objetivos del mes. */

export const PLAN_FORMATS = [
  { id: 'reel', label: 'Reel / vídeo corto' },
  { id: 'carrusel', label: 'Carrusel' },
  { id: 'historia', label: 'Historia' },
  { id: 'post', label: 'Post' },
  { id: 'articulo', label: 'Artículo de blog' },
] as const

export const PLAN_CHANNELS = [
  { id: 'instagram', label: 'Instagram', color: '#DB2777' },
  { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
  { id: 'youtube', label: 'YouTube Shorts', color: '#FF0000' },
  { id: 'tiktok', label: 'TikTok', color: '#111827' },
  { id: 'blog', label: 'Blog', color: '#059669' },
] as const

export const PLAN_STATUSES = [
  { id: 'idea', label: 'Idea', color: '#9CA3AF' },
  { id: 'guion', label: 'Guion', color: '#A78BFA' },
  { id: 'diseno', label: 'Diseño / grabación', color: '#F59E0B' },
  { id: 'programado', label: 'Programado', color: '#3B82F6' },
  { id: 'publicado', label: 'Publicado', color: '#10B981' },
] as const

export const PLAN_PILLARS = [
  { id: 'dolor', label: 'Dolor' },
  { id: 'autoridad', label: 'Autoridad / método' },
  { id: 'prueba', label: 'Prueba / casos' },
  { id: 'opinion', label: 'Opinión' },
  { id: 'equipo', label: 'Equipo / marca' },
] as const

export const PLAN_SECTORS = [
  { id: 'legal', label: 'Sector legal' },
  { id: 'transversal', label: 'Transversal' },
] as const

export type PlanFormat = (typeof PLAN_FORMATS)[number]['id']
export type PlanChannel = (typeof PLAN_CHANNELS)[number]['id']
export type PlanStatus = (typeof PLAN_STATUSES)[number]['id']
export type PlanPillar = (typeof PLAN_PILLARS)[number]['id']
export type PlanSector = (typeof PLAN_SECTORS)[number]['id']

export type PlanItem = {
  id: number
  /** YYYY-MM-DD */
  fecha: string
  titulo: string
  formato: PlanFormat
  canal: PlanChannel
  pilar: PlanPillar | null
  sector: PlanSector | null
  estado: PlanStatus
  responsable: string | null
  enlace: string | null
  notas: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PlanGoals = {
  /** YYYY-MM */
  period: string
  piezas_objetivo: number | null
  reuniones_objetivo: number | null
  clientes_objetivo: number | null
  notas: string | null
}

export type PlanMonth = {
  period: string
  items: PlanItem[]
  goals: PlanGoals
  /** false si la tabla todavía no existe en la base de datos */
  ready: boolean
}

export type PlanSummary = {
  total: number
  publicados: number
  en_curso: number
  /** Fecha pasada y sin publicar */
  atrasados: number
  por_estado: Record<PlanStatus, number>
  por_canal: Partial<Record<PlanChannel, number>>
  piezas_objetivo: number | null
}

export const labelOf = <T extends { id: string; label: string }>(list: readonly T[], id: string | null | undefined) =>
  list.find((x) => x.id === id)?.label ?? id ?? '—'

/** Resumen del mes: lo usa el Panel general. `today` en YYYY-MM-DD. */
export function summarizePlan(items: PlanItem[], goals: PlanGoals | null, today: string): PlanSummary {
  const por_estado = { idea: 0, guion: 0, diseno: 0, programado: 0, publicado: 0 } as Record<PlanStatus, number>
  const por_canal: Partial<Record<PlanChannel, number>> = {}
  let atrasados = 0
  for (const it of items) {
    por_estado[it.estado] = (por_estado[it.estado] || 0) + 1
    por_canal[it.canal] = (por_canal[it.canal] || 0) + 1
    if (it.estado !== 'publicado' && it.fecha < today) atrasados += 1
  }
  const publicados = por_estado.publicado
  return {
    total: items.length,
    publicados,
    en_curso: items.length - publicados,
    atrasados,
    por_estado,
    por_canal,
    piezas_objetivo: goals?.piezas_objetivo ?? null,
  }
}
