'use client'

import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import {
  looksLikeResearchFiche,
  parseSummaryBlocks,
  pickProjectSummaryText,
  sanitizeProjectTitle,
} from '@/lib/onboarding/format-project-summary'

type Props = {
  leadId: number
  projectName: string | null
  fallbackName?: string | null
  projectDefinition: string | null
  projectContext: string | null
  scopeItems?: string[]
  notebookHref: string
}

/** Primera letra mayúscula; limpia espacios. No corrige ortografía. */
function polishParagraph(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim()
  if (!s) return s
  s = s.charAt(0).toLocaleUpperCase('es-ES') + s.slice(1)
  if (!/[.!?…]$/.test(s)) s += '.'
  return s
}

function titleCaseName(name: string): string {
  const t = name.trim()
  if (!t) return t
  // "buffalo ai" → "Buffalo AI" si son 1–3 palabras cortas
  if (t === t.toLowerCase() && t.split(/\s+/).length <= 4) {
    return t
      .split(/\s+/)
      .map((w) =>
        w.length <= 3 && w.toLowerCase() !== 'ai'
          ? w.charAt(0).toUpperCase() + w.slice(1)
          : w.toLowerCase() === 'ai'
            ? 'AI'
            : w.charAt(0).toUpperCase() + w.slice(1)
      )
      .join(' ')
  }
  return t
}

export default function ProjectSummaryCard({
  leadId: _leadId,
  projectName,
  fallbackName,
  projectDefinition,
  projectContext,
  scopeItems = [],
  notebookHref,
}: Props) {
  const title = titleCaseName(
    sanitizeProjectTitle(projectName, fallbackName) ||
      sanitizeProjectTitle(fallbackName) ||
      'Proyecto'
  )

  const summaryText = pickProjectSummaryText({
    definition: projectDefinition,
    context: projectContext,
  })

  const safeText =
    summaryText &&
    !looksLikeResearchFiche(summaryText) &&
    !/QUI[EÉ]NES SON|Ficha\s*web/i.test(summaryText)
      ? summaryText
      : ''

  const paragraphs = parseSummaryBlocks(safeText)
    .filter((b) => b.type === 'paragraph')
    .map((b) => polishParagraph(b.text))
    .filter(Boolean)

  const lead = paragraphs[0] || null
  const rest = paragraphs.slice(1)
  const showScope =
    scopeItems.length > 0 &&
    safeText &&
    !scopeItems.every((s) => safeText.includes(s))

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="relative px-6 py-8 sm:px-10 sm:py-10">
        <div className="absolute right-5 top-5 sm:right-8 sm:top-7">
          <Link
            href={notebookHref}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-50 hover:text-emerald-800"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Cuaderno
          </Link>
        </div>

        <div className="mx-auto max-w-[40rem] text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700/75">
            Resumen del proyecto
          </p>

          <h2 className="mt-3 text-[1.75rem] font-semibold tracking-[-0.03em] text-gray-900 sm:text-[2rem]">
            {title}
          </h2>

          <div className="mx-auto mt-4 h-px w-12 bg-emerald-600/30" />

          {lead ? (
            <div className="mt-7 space-y-5 text-pretty">
              <p className="text-[17px] font-medium leading-[1.65] tracking-[-0.01em] text-gray-800 sm:text-[18px]">
                {lead}
              </p>
              {rest.map((p, i) => (
                <p
                  key={i}
                  className="text-[15px] leading-[1.7] text-gray-600 sm:text-[16px]"
                >
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-7 text-[15px] leading-relaxed text-gray-400">
              Aún no hay un resumen claro. En el cuaderno, crea una nota de tipo{' '}
              <span className="font-medium text-gray-600">definición</span> con
              qué hay que construir.
            </p>
          )}

          {showScope ? (
            <ul className="mt-8 space-y-2 border-t border-gray-100 pt-6 text-left">
              {scopeItems.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-[14px] leading-relaxed text-gray-600"
                >
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-600/50" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  )
}
