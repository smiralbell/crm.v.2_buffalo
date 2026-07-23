'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BookOpen,
  ChevronRight,
  HelpCircle,
  Search,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import type { CrmRole } from '@/lib/auth'
import {
  HELP_CATEGORIES,
  articlesForRole,
  getArticle,
  searchArticles,
  type HelpArticle,
} from '@/lib/help/catalog'

type Props = {
  role: CrmRole | null
  initialArticleId?: string | null
}

export default function HelpCenter({ role, initialArticleId }: Props) {
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(initialArticleId || null)

  const pool = useMemo(() => articlesForRole(role), [role])
  const results = useMemo(
    () => (query.trim() ? searchArticles(query, role) : pool),
    [query, role, pool]
  )

  const byCategory = useMemo(() => {
    const map = new Map<string, HelpArticle[]>()
    for (const a of results) {
      const list = map.get(a.category) || []
      list.push(a)
      map.set(a.category, list)
    }
    for (const list of Array.from(map.values())) {
      list.sort((x: HelpArticle, y: HelpArticle) => (x.order ?? 99) - (y.order ?? 99))
    }
    return map
  }, [results])

  const categories = useMemo(
    () =>
      [...HELP_CATEGORIES]
        .sort((a, b) => a.order - b.order)
        .filter((c) => (byCategory.get(c.id) || []).length > 0),
    [byCategory]
  )

  useEffect(() => {
    if (activeId && getArticle(activeId)) return
    const first = categories[0] && byCategory.get(categories[0].id)?.[0]
    if (first) setActiveId(first.id)
  }, [activeId, categories, byCategory])

  const active = activeId ? getArticle(activeId) : null
  const activeVisible =
    active &&
    (active.audience.includes('all') || (role && active.audience.includes(role)))
      ? active
      : null

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-4 lg:flex-row lg:gap-6">
      {/* Índice */}
      <aside className="w-full shrink-0 lg:w-80 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border bg-foreground px-4 py-4 text-background">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-background/15">
                <HelpCircle className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-tight">Centro de ayuda</p>
                <p className="text-[11px] text-background/60">
                  Documentación completa del ERP Buffalo
                </p>
              </div>
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-background/50" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar: API, retención, facturas…"
                className="h-9 rounded-xl border-0 bg-background/15 pl-9 text-sm text-background placeholder:text-background/45 focus-visible:ring-background/30"
              />
            </div>
          </div>

          <div className="max-h-[min(70vh,640px)] overflow-y-auto p-2">
            {categories.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Sin resultados para «{query}»
              </p>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="mb-2">
                  <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {cat.label}
                  </p>
                  <div className="space-y-0.5">
                    {(byCategory.get(cat.id) || []).map((a) => {
                      const on = a.id === activeId
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setActiveId(a.id)}
                          className={cn(
                            'flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors',
                            on
                              ? 'bg-foreground text-background'
                              : 'text-foreground/80 hover:bg-muted'
                          )}
                        >
                          <ChevronRight
                            className={cn(
                              'mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50',
                              on && 'opacity-90'
                            )}
                          />
                          <span className="min-w-0">
                            <span className="block font-medium leading-snug">{a.title}</span>
                            <span
                              className={cn(
                                'mt-0.5 block text-[11px] leading-snug line-clamp-2',
                                on ? 'text-background/65' : 'text-muted-foreground'
                              )}
                            >
                              {a.summary}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Artículo */}
      <article className="min-w-0 flex-1">
        {!activeVisible ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-20 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium text-foreground">Elige un artículo</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Usa el índice o la búsqueda para explorar módulos, APIs y flujos.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <header className="border-b border-border px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  {HELP_CATEGORIES.find((c) => c.id === activeVisible.category)?.label ||
                    activeVisible.category}
                </span>
                {activeVisible.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {activeVisible.title}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{activeVisible.summary}</p>
            </header>

            <div
              className={cn(
                'prose-help px-5 py-6 sm:px-7 sm:py-8',
                'text-[15px] leading-7 text-foreground/90',
                '[&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight',
                '[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight',
                '[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold',
                '[&_p]:my-3 [&_ul]:my-3 [&_ol]:my-3 [&_li]:my-1',
                '[&_table]:my-4 [&_table]:w-full [&_table]:text-sm',
                '[&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground',
                '[&_td]:border-b [&_td]:border-border/70 [&_td]:px-2 [&_td]:py-2 [&_td]:align-top',
                '[&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px]',
                '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-zinc-900 [&_pre]:p-4 [&_pre]:text-[13px] [&_pre]:text-zinc-100',
                '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
                '[&_blockquote]:border-l-2 [&_blockquote]:border-foreground/20 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
                '[&_a]:underline [&_a]:underline-offset-2'
              )}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeVisible.body}</ReactMarkdown>
            </div>
          </div>
        )}
      </article>
    </div>
  )
}
