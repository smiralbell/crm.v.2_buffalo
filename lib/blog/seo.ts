/**
 * Control automático de cada artículo. Implementa las normas SEO del
 * equipo (Blog → Reglas) con los números de Blog → Configuración.
 *
 * Los checks de tipo «error» bloquean el paso a revisión: el motor
 * reescribe hasta que pasan (máximo maxRewrites veces). Los «aviso»
 * se enseñan a quien revisa pero no bloquean.
 */
import { significantWords } from './research'
import type { BlogRules, BlogSettings, Post, SeoCheck } from './types'

export const stripTags = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

/** Minúsculas y sin tildes, para contar apariciones de forma justa. */
export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ\s-]/g, ' ').replace(/\s+/g, ' ').trim()

export function countPhrase(text: string, phrase: string): number {
  const t = ' ' + norm(text) + ' '
  const p = norm(phrase)
  if (!p) return 0
  let n = 0
  let i = t.indexOf(' ' + p + ' ')
  while (i >= 0) {
    n++
    i = t.indexOf(' ' + p + ' ', i + p.length)
  }
  return n
}

export function slugify(s: string): string {
  return norm(s).replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const tagTexts = (html: string, tag: string) =>
  Array.from(html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))).map((m) => m[1])

interface Link {
  href: string
  text: string
  inH2: boolean
  h2Full: boolean
}

export function extractLinks(html: string, domain: string): { internal: Link[]; external: Link[] } {
  const links: Link[] = []
  // Enlaces dentro de H2 (y si el H2 entero es el enlace)
  for (const h2 of tagTexts(html, 'h2')) {
    for (const m of Array.from(h2.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi))) {
      links.push({ href: m[1], text: stripTags(m[2]), inH2: true, h2Full: stripTags(m[2]) === stripTags(h2) })
    }
  }
  const withoutH2 = html.replace(/<h2[^>]*>[\s\S]*?<\/h2>/gi, ' ')
  for (const m of Array.from(withoutH2.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi))) {
    links.push({ href: m[1], text: stripTags(m[2]), inH2: false, h2Full: false })
  }
  const host = domain.replace(/^https?:\/\//, '')
  const isInternal = (h: string) => h.startsWith('/') || h.includes(host)
  return { internal: links.filter((l) => isInternal(l.href)), external: links.filter((l) => !isInternal(l.href) && /^https?:/.test(l.href)) }
}

export function runChecks(post: Post, s: BlogSettings, rules: BlogRules): { checks: SeoCheck[]; score: number } {
  const c: SeoCheck[] = []
  const add = (id: string, label: string, ok: boolean, detail: string, severity: 'error' | 'aviso' = 'error') =>
    c.push({ id, label, ok, detail, severity })
  const seo = s.seo
  const kw = post.keyword || ''
  const bodyText = stripTags(post.body)
  const fullText = post.h1 + ' ' + bodyText

  // --- Palabra clave principal ---
  const kwWords = significantWords(kw).length
  add('kw-words', `Palabra clave de 1 a ${seo.keywordMaxWords} palabras`, kwWords >= 1 && kwWords <= seo.keywordMaxWords, `«${kw}»: ${kwWords} palabras significativas`)
  const kwCount = countPhrase(fullText, kw)
  add('kw-count', `Palabra clave al menos ${seo.keywordMinCount} veces`, kwCount >= seo.keywordMinCount, `Aparece ${kwCount} veces`)
  add('kw-h1', 'Palabra clave en el H1', countPhrase(post.h1, kw) > 0, post.h1)
  add('kw-meta', 'Palabra clave en la meta-description', countPhrase(post.metaDescription, kw) > 0, post.metaDescription)
  add('kw-slug', 'Palabra clave en el slug', post.slug.includes(slugify(kw)), `/${post.slug}/ debe contener «${slugify(kw)}»`)
  const firstP = stripTags(tagTexts(post.body, 'p')[0] || '')
  add('kw-first', 'Palabra clave en el primer párrafo', countPhrase(firstP, kw) > 0, firstP.slice(0, 140) + '…')
  const heads = [...tagTexts(post.body, 'h2'), ...tagTexts(post.body, 'h3')].map(stripTags)
  add('kw-head', 'Palabra clave en al menos un H2 o H3', heads.some((h) => countPhrase(h, kw) > 0), `${heads.filter((h) => countPhrase(h, kw) > 0).length} encabezados la llevan`)

  // --- Secundarias ---
  add('sec-count', `${seo.secondaryCount} palabras clave secundarias`, post.secondary.length === seo.secondaryCount, post.secondary.join(' · ') || 'ninguna')
  for (const term of post.secondary) {
    const n = countPhrase(fullText, term)
    const words = significantWords(term).length
    add(`sec-${slugify(term)}`, `Secundaria «${term}» ≥ ${seo.secondaryMinCount} veces (1-3 palabras)`, n >= seo.secondaryMinCount && words >= 1 && words <= 3, `Aparece ${n} veces`)
  }

  // --- Título, descripción y URL ---
  add('h1-len', `H1 de máximo ${seo.h1Max} caracteres`, post.h1.length > 0 && post.h1.length <= seo.h1Max, `${post.h1.length} caracteres`)
  add('meta-len', `Meta-description de máximo ${seo.metaMax} caracteres`, post.metaDescription.length > 50 && post.metaDescription.length <= seo.metaMax, `${post.metaDescription.length} caracteres`)
  add('slug-len', `Slug de máximo ${seo.slugMax} caracteres en kebab-case`, post.slug.length <= seo.slugMax && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(post.slug), `${post.slug.length} caracteres`)

  // --- Estructura y legibilidad ---
  const h2n = tagTexts(post.body, 'h2').length
  const firstH2 = post.body.search(/<h2/i)
  const firstH3 = post.body.search(/<h3/i)
  add('hierarchy', 'Jerarquía H2/H3 coherente', h2n >= 3 && !/<h1/i.test(post.body) && (firstH3 < 0 || firstH3 > firstH2), `${h2n} H2, ${tagTexts(post.body, 'h3').length} H3`)
  const maxChars = seo.paragraphMaxLines * seo.charsPerLine
  const longP = tagTexts(post.body, 'p').map(stripTags).filter((p) => p.length > maxChars)
  add('paragraphs', `Párrafos de máximo ${seo.paragraphMaxLines} líneas`, longP.length === 0, longP.length ? `${longP.length} párrafos largos: «${longP[0].slice(0, 60)}…»` : 'Todos cortos')
  add('lists', 'Usa listas donde aportan claridad', /<(ul|ol)[\s>]/i.test(post.body), /<(ul|ol)[\s>]/i.test(post.body) ? 'Sí' : 'Ninguna lista', 'aviso')
  const words = bodyText.split(/\s+/).length
  const [wMin, wMax] = post.kind === 'pilar' ? seo.wordsPillar : seo.wordsArticle
  add('length', `Longitud ${wMin}-${wMax} palabras`, words >= wMin * 0.9 && words <= wMax * 1.15, `${words} palabras`, words < wMin * 0.75 ? 'error' : 'aviso')

  // --- Enlaces ---
  const { internal, external } = extractLinks(post.body, s.site.domain)
  const intUnique = new Set(internal.map((l) => l.href))
  add('int-count', `Exactamente ${seo.internalLinks} enlaces internos`, internal.length === seo.internalLinks && intUnique.size === seo.internalLinks, internal.map((l) => l.href).join(' · ') || 'ninguno')
  add('int-h2', 'Un H2 completo enlazado', internal.some((l) => l.h2Full), internal.find((l) => l.h2Full)?.text || 'falta')
  add('int-phrase', 'Una frase enlazada', internal.some((l) => !l.inH2 && l.text.split(/\s+/).length >= 3), internal.find((l) => !l.inH2 && l.text.split(/\s+/).length >= 3)?.text || 'falta')
  add('int-word', 'Una sola palabra enlazada', internal.some((l) => !l.inH2 && l.text.split(/\s+/).length === 1), internal.find((l) => !l.inH2 && l.text.split(/\s+/).length === 1)?.text || 'falta')
  add('ext-count', `Exactamente ${seo.externalLinks} enlaces externos`, external.length === seo.externalLinks && new Set(external.map((l) => l.href)).size === seo.externalLinks, external.map((l) => l.href).join(' · ') || 'ninguno')
  const nakedUrl = /(^|\s)(https?:\/\/|www\.)\S+/i.test(bodyText) || [...internal, ...external].some((l) => /^(https?:\/\/|www\.)/.test(l.text))
  add('ext-format', 'Sin URLs desnudas, siempre con texto ancla', !nakedUrl, nakedUrl ? 'Hay una URL a la vista' : 'Correcto')
  const untrusted = external.filter((l) => !rules.trustedSources.some((d) => l.href.includes(d)))
  add('ext-trust', 'Enlaces externos a fuentes con autoridad', untrusted.length === 0, untrusted.length ? 'Revisar: ' + untrusted.map((l) => l.href).join(', ') : 'Todas de la lista de fuentes', 'aviso')

  // --- Elementos visuales ---
  add('img-markers', 'Indicadores (imagen1) e (imagen2) en el cuerpo', post.body.includes('(imagen1)') && post.body.includes('(imagen2)'), [post.body.includes('(imagen1)') ? 'imagen1 ✓' : 'falta imagen1', post.body.includes('(imagen2)') ? 'imagen2 ✓' : 'falta imagen2'].join(' · '))
  add('img-prompts', 'Prompt de imagen destacada y de infografía', !!(post.imagePrompts?.featured && post.imagePrompts?.infographic), post.imagePrompts?.featured ? 'Sí' : 'Faltan')

  // --- Voz y reglas de contenido ---
  const lower = norm(fullText)
  const banned = rules.bannedPhrases.filter((b) => lower.includes(norm(b)))
  add('banned', 'Sin expresiones prohibidas', banned.length === 0, banned.length ? banned.join(', ') : 'Ninguna')
  const never = rules.neverSay.filter((b) => fullText.toLowerCase().includes(b.toLowerCase()))
  add('never', 'Sin cifras ni promesas prohibidas', never.length === 0, never.length ? never.join(', ') : 'Ninguna')
  // BuffaloIA no cita casos propios: frases que suenan a «un cliente nuestro» o a proyecto hecho
  const cases = Array.from(
    new Set(
      (bodyText.match(/[^.]*(nuestros? clientes?|uno de nuestros|una de nuestras|con el que trabajamos|con la que trabajamos|con los que trabajamos|hemos implantado|implantamos (?:en|para) (?:un|una)|en un proyecto (?:reciente|nuestro)|un cliente (?:nos|nuestro)|casos? de éxito)[^.]*.?/gi) || []).map((x) => x.trim().slice(0, 140))
    )
  )
  add('casos', 'Sin casos ni clientes propios', cases.length === 0, cases.length ? 'Quitar o plantear como ejemplo hipotético: ' + cases.join(' · ') : 'Ninguno')
  const caseLink = internal.some((l) => l.href.includes('casos-de-exito'))
  add('casos-link', 'Sin enlace a Casos de éxito', !caseLink, caseLink ? 'Quitar el enlace a /casos-de-exito/' : 'Correcto')
  add('brand', 'Marca escrita «BuffaloIA»', !/buffalo ia|buffalo\.ai|buffalo ai/i.test(fullText), /buffalo ia|buffalo ai/i.test(fullText) ? 'Corregir a BuffaloIA' : 'Correcto')
  const dashes = (bodyText.match(/—/g) || []).length
  add('dashes', 'Pocos guiones largos (máximo 3)', dashes <= 3, `${dashes} guiones largos`, 'aviso')
  add('faq', 'Entre 3 y 5 preguntas frecuentes', post.faq.length >= 3 && post.faq.length <= 5, `${post.faq.length} preguntas`)
  const gaps = (post.body.match(/\[SERGI:[^\]]*\]/g) || []).length
  add('gaps', 'Huecos [SERGI: …] rellenados', gaps === 0, gaps ? `${gaps} huecos por rellenar antes de publicar` : 'Ninguno', 'aviso')

  const errors = c.filter((x) => x.severity === 'error')
  const score = Math.round((errors.filter((x) => x.ok).length / Math.max(1, errors.length)) * 100)
  return { checks: c, score }
}

export const blockingFailures = (checks: SeoCheck[]) => checks.filter((x) => x.severity === 'error' && !x.ok)
