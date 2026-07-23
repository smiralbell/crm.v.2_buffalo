import type { CrmRole } from '@/lib/auth'

export type HelpAudience = CrmRole | 'all'

export type HelpArticle = {
  id: string
  title: string
  summary: string
  /** Agrupa en el índice lateral */
  category: string
  /** Orden dentro de la categoría */
  order?: number
  /** Roles que ven el artículo; 'all' = todos */
  audience: HelpAudience[]
  /** Keywords para búsqueda */
  tags: string[]
  /** Markdown del cuerpo */
  body: string
}

export type HelpCategory = {
  id: string
  label: string
  description: string
  order: number
}
