import type { CrmRole } from '@/lib/auth'
import type { HelpArticle } from './types'
import { HELP_CATEGORIES } from './categories'
import { ARTICLES_INICIO } from './articles/inicio'
import { ARTICLES_ENG1, ARTICLES_COMERCIAL, ARTICLES_LEADS } from './articles/eng1-comercial-leads'
import { ARTICLES_ENG2, ARTICLES_ENG3, ARTICLES_ENG4 } from './articles/eng2-4'
import { ARTICLES_FINANZAS, ARTICLES_ADMIN } from './articles/finanzas-admin'
import { ARTICLES_API, ARTICLES_INTEGRACIONES } from './articles/api-integraciones'

export { HELP_CATEGORIES }
export type { HelpArticle }

export const HELP_ARTICLES: HelpArticle[] = [
  ...ARTICLES_INICIO,
  ...ARTICLES_ENG1,
  ...ARTICLES_COMERCIAL,
  ...ARTICLES_LEADS,
  ...ARTICLES_ENG2,
  ...ARTICLES_ENG3,
  ...ARTICLES_ENG4,
  ...ARTICLES_FINANZAS,
  ...ARTICLES_ADMIN,
  ...ARTICLES_API,
  ...ARTICLES_INTEGRACIONES,
]

export function articlesForRole(role: CrmRole | null | undefined): HelpArticle[] {
  if (!role) return HELP_ARTICLES.filter((a) => a.audience.includes('all'))
  return HELP_ARTICLES.filter(
    (a) => a.audience.includes('all') || a.audience.includes(role)
  )
}

export function getArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.id === id)
}

export function searchArticles(
  query: string,
  role: CrmRole | null | undefined
): HelpArticle[] {
  const q = query.trim().toLowerCase()
  const pool = articlesForRole(role)
  if (!q) return pool
  const tokens = q.split(/\s+/).filter(Boolean)
  return pool
    .map((a) => {
      const hay = [
        a.title,
        a.summary,
        a.category,
        a.tags.join(' '),
        a.body.slice(0, 4000),
      ]
        .join('\n')
        .toLowerCase()
      let score = 0
      for (const t of tokens) {
        if (a.title.toLowerCase().includes(t)) score += 8
        if (a.tags.some((tag) => tag.toLowerCase().includes(t))) score += 5
        if (a.summary.toLowerCase().includes(t)) score += 3
        if (hay.includes(t)) score += 1
      }
      return { a, score }
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a)
}
