/**
 * Estados de lead — FUENTE ÚNICA de etiqueta y color.
 *
 * Antes cada pantalla tenía su propio mapa: «caliente» salía en cuatro colores
 * distintos según dónde lo miraras, y compartía color con «perdido», así que un
 * lead caliente y uno perdido se veían igual.
 *
 * Estados canónicos según la cadena comercial; `nuevo` y `en_proceso` son
 * heredados y se mantienen para no romper datos antiguos.
 */

export const LEAD_ESTADOS = [
  'frio',
  'caliente',
  'reunion',
  'propuesta',
  'negociando',
  'cerrado',
  'activo',
  'perdido',
] as const

export type LeadEstado = (typeof LEAD_ESTADOS)[number]

type EstadoMeta = { label: string; badge: string; dot: string }

const META: Record<string, EstadoMeta> = {
  // Aún no calificado
  frio:       { label: 'Frío',       badge: 'bg-muted text-muted-foreground',                       dot: 'bg-zinc-400' },
  // Calificado y con interés — ámbar, NUNCA rojo (rojo es perder)
  caliente:   { label: 'Caliente',   badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',   dot: 'bg-amber-500' },
  reunion:    { label: 'Reunión',    badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  propuesta:  { label: 'Propuesta',  badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',         dot: 'bg-sky-500' },
  negociando: { label: 'Negociando', badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
  // Ganado
  cerrado:    { label: 'Cerrado',    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  activo:     { label: 'Activo',     badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  // Perdido — el único rojo
  perdido:    { label: 'Perdido',    badge: 'bg-red-500/15 text-red-700 dark:text-red-300',          dot: 'bg-red-500' },

  // Heredados
  nuevo:      { label: 'Nuevo',      badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',       dot: 'bg-blue-500' },
  en_proceso: { label: 'En proceso', badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',    dot: 'bg-amber-500' },
}

const DESCONOCIDO: EstadoMeta = {
  label: 'Sin estado',
  badge: 'bg-muted text-muted-foreground',
  dot: 'bg-zinc-300',
}

function meta(estado?: string | null): EstadoMeta {
  return (estado && META[estado]) || DESCONOCIDO
}

/** «Caliente» */
export function estadoLabel(estado?: string | null): string {
  return meta(estado).label
}

/** Clases de la píldora de estado. */
export function estadoBadgeClass(estado?: string | null): string {
  return meta(estado).badge
}

/** Clase del puntito de color. */
export function estadoDotClass(estado?: string | null): string {
  return meta(estado).dot
}

/** Opciones para los `<Select>` de alta y edición. */
export const LEAD_ESTADO_OPTIONS: Array<{ value: LeadEstado; label: string }> =
  LEAD_ESTADOS.map((value) => ({ value, label: META[value].label }))
