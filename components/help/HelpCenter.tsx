'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BookOpen, Search, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CrmRole } from '@/lib/auth'
import { defaultHomeForRole } from '@/lib/auth-rbac'
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

const ACCENT = '#009b86'

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

  const catLabel =
    HELP_CATEGORIES.find((c) => c.id === activeVisible?.category)?.label ||
    activeVisible?.category ||
    ''

  return (
    <div
      className="help-docs flex min-h-[100dvh] flex-col text-[#0a0a0a]"
      style={
        {
          ['--bf' as string]: ACCENT,
          fontFamily: "'Figtree', system-ui, sans-serif",
          background: '#fafafa',
        } as CSSProperties
      }
    >
      {/* Top bar */}
      <header className="sticky top-0 z-30 shrink-0 border-b border-black/8 bg-white">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/buffalo-mark.png"
              alt="Buffalo"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0">
              <p
                className="truncate text-[15px] font-semibold tracking-tight"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                Documentación Buffalo
              </p>
              <p className="truncate text-[11px] text-black/45">ERP · guías · API · flujos</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative w-full max-w-[220px] sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/35" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="h-10 w-full rounded-full border border-black/10 bg-white pl-9 pr-4 text-sm text-black outline-none placeholder:text-black/35 focus:border-[var(--bf)] focus:ring-2 focus:ring-[var(--bf)]/25"
              />
            </div>
            <a
              href={role ? defaultHomeForRole(role) : '/dashboard'}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 text-sm font-semibold text-black transition-colors hover:border-black/20 hover:bg-black/[0.03]"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Volver a la app</span>
              <span className="sm:hidden">App</span>
            </a>
          </div>
        </div>
      </header>

      {/* Sidebar flush left + content */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="w-full shrink-0 border-b border-black/8 bg-white lg:w-[260px] lg:border-b-0 lg:border-r lg:min-h-0">
          <nav className="lg:sticky lg:top-[61px] lg:max-h-[calc(100dvh-61px)] lg:overflow-y-auto px-2 py-4">
            {categories.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-black/45">
                Sin resultados para «{query}»
              </p>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="mb-4">
                  <p
                    className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: ACCENT }}
                  >
                    {cat.label}
                  </p>
                  <div className="space-y-0.5">
                    {(byCategory.get(cat.id) || []).map((a) => {
                      const on = a.id === activeId
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            setActiveId(a.id)
                            if (typeof window !== 'undefined') {
                              const url = new URL(window.location.href)
                              url.searchParams.set('a', a.id)
                              window.history.replaceState({}, '', url.toString())
                            }
                          }}
                          className={cn(
                            'block w-full truncate rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
                            on
                              ? 'bg-black text-white'
                              : 'text-black/70 hover:bg-black/[0.04] hover:text-black'
                          )}
                          style={{ fontFamily: "'Syne', sans-serif" }}
                          title={a.title}
                        >
                          {a.title}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-5 py-8 sm:px-10 sm:py-10">
          {!activeVisible ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-black/15 bg-white px-6 py-24 text-center">
              <BookOpen className="h-8 w-8 text-black/25" />
              <p
                className="mt-4 text-lg font-semibold text-black"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                Elige un artículo
              </p>
            </div>
          ) : (
            <article className="mx-auto max-w-[720px]">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: ACCENT }}
              >
                {catLabel}
              </p>
              <h2
                className="mt-3 text-[1.85rem] font-bold leading-[1.15] tracking-[-0.025em] text-black sm:text-[2.15rem]"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                {activeVisible.title}
              </h2>
              <p className="mt-3 text-[1.05rem] leading-relaxed text-black/50">
                {activeVisible.summary}
              </p>
              <div
                className="mt-5 h-1 w-14 rounded-full"
                style={{ background: ACCENT }}
                aria-hidden
              />

              <div
                className={cn(
                  'help-docs-prose mt-8 text-[16px] leading-[1.75] text-black/80',
                  '[&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-[1.45rem] [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-black',
                  '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-[1.2rem] [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-black',
                  '[&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:text-[1.02rem] [&_h3]:font-semibold [&_h3]:text-black',
                  '[&_p]:my-3.5',
                  '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5',
                  '[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5',
                  '[&_li]:leading-relaxed',
                  '[&_strong]:font-semibold [&_strong]:text-black',
                  '[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2',
                  '[&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[14px]',
                  '[&_th]:border-b-2 [&_th]:border-black/15 [&_th]:px-2 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-black/45',
                  '[&_td]:border-b [&_td]:border-black/8 [&_td]:px-2 [&_td]:py-2.5 [&_td]:align-top',
                  '[&_code]:rounded-md [&_code]:bg-black/[0.05] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:text-black',
                  '[&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:bg-[#0a0a0a] [&_pre]:p-4 [&_pre]:text-[13px] [&_pre]:leading-6 [&_pre]:text-white/90',
                  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
                  '[&_blockquote]:my-5 [&_blockquote]:border-l-[3px] [&_blockquote]:pl-4 [&_blockquote]:text-black/55',
                  '[&_hr]:my-8 [&_hr]:border-black/10'
                )}
              >
                <style
                  dangerouslySetInnerHTML={{
                    __html: `
                      .help-docs-prose h1, .help-docs-prose h2, .help-docs-prose h3 {
                        font-family: 'Syne', sans-serif;
                      }
                      .help-docs-prose a { color: ${ACCENT}; }
                      .help-docs-prose blockquote { border-left-color: ${ACCENT}; }
                    `,
                  }}
                />
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeVisible.body}</ReactMarkdown>
              </div>
            </article>
          )}
        </main>
      </div>
    </div>
  )
}
