/**
 * Investigación de palabras clave, temas y noticias.
 *
 * Sin APIs de pago de SEO. Se combinan tres fuentes:
 *  1. Autocompletado de Google, Bing y DuckDuckGo (gratis). Son búsquedas
 *     reales: un término que aparece en el autocompletado lo busca gente.
 *     Cuantos más buscadores lo sugieren y más arriba, más demanda.
 *  2. Búsqueda web de OpenRouter: qué páginas posicionan, qué cubren y
 *     qué les falta; fuentes primarias para los enlaces externos.
 *  3. RSS de Google Noticias (gratis) para la actualidad.
 *
 * El volumen exacto de búsquedas sólo lo da Google (Keyword Planner o
 * Search Console). Aquí se estima con señales de demanda, que es lo
 * que permite decidir entre opciones; cuando el blog tenga datos de
 * Search Console se pueden añadir.
 */
import { askAi } from './ai'
import { allThemes, SITE_PAGES } from './defaults'
import type { BlogRules, BlogSettings, KeywordResearch, Post, Topic, ThemeCode } from './types'
import { newId } from './store'

/* ---------------- Autocompletado ---------------- */

async function fetchJson(url: string, ms = 6000): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    // Por si algún buscador responde en ISO-8859-1: se detecta por la cabecera
    const ct = res.headers.get('content-type') || ''
    const text = /8859|latin/i.test(ct) ? buf.toString('latin1') : buf.toString('utf8')
    return JSON.parse(text)
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

const SOURCES: Record<string, (q: string) => string> = {
  google: (q) => `https://suggestqueries.google.com/complete/search?client=chrome&hl=es&gl=es&q=${encodeURIComponent(q)}`,
  bing: (q) => `https://api.bing.com/osjson.aspx?market=es-ES&query=${encodeURIComponent(q)}`,
  ddg: (q) => `https://duckduckgo.com/ac/?type=list&kl=es-es&q=${encodeURIComponent(q)}`,
}

async function suggest(q: string, engine: keyof typeof SOURCES): Promise<string[]> {
  const out = await fetchJson(SOURCES[engine](q))
  if (Array.isArray(out) && Array.isArray(out[1])) return (out[1] as unknown[]).filter((x): x is string => typeof x === 'string')
  return []
}

export interface Harvest {
  term: string
  score: number // señal de demanda: aparece en más buscadores y más arriba
  engines: string[]
}

const MODIFIERS = ['', 'cómo', 'cuánto cuesta', 'qué es', 'precio', 'mejor', 'para', 'vs', 'ventajas', 'empresa', 'ejemplos', 'gratis', 'legal']

/** Recoge búsquedas reales alrededor de una semilla. ~15-40 peticiones gratuitas. */
export async function harvestSearches(seed: string, deep = false): Promise<Harvest[]> {
  const queries = new Set<string>([seed])
  for (const m of MODIFIERS) if (m) queries.add(m.length > 4 && !['para', 'legal'].includes(m) ? `${m} ${seed}` : `${seed} ${m}`)
  if (deep) for (const c of 'abcdefghijlmnopqrstv') queries.add(`${seed} ${c}`)

  const found = new Map<string, Harvest>()
  const list = Array.from(queries)
  for (let i = 0; i < list.length; i += 6) {
    const batch = list.slice(i, i + 6)
    const results = await Promise.all(
      batch.flatMap((q) =>
        (['google', 'bing', 'ddg'] as const).map(async (engine) => ({ engine, items: await suggest(q, engine) }))
      )
    )
    for (const { engine, items } of results) {
      items.forEach((term, pos) => {
        const key = term.toLowerCase().trim()
        if (!key || key.length > 90) return
        const h = found.get(key) || { term: key, score: 0, engines: [] }
        h.score += Math.max(1, 10 - pos) // más arriba = más búsquedas
        if (!h.engines.includes(engine)) h.engines.push(engine)
        found.set(key, h)
      })
    }
  }
  for (const h of Array.from(found.values())) h.score *= h.engines.length // varios buscadores = señal más fuerte
  return Array.from(found.values()).sort((a, b) => b.score - a.score)
}

export function demandFrom(h: Harvest[], keyword: string): 'alta' | 'media' | 'baja' {
  const k = keyword.toLowerCase()
  const exact = h.find((x) => x.term === k)
  const related = h.filter((x) => x.term.includes(k)).length
  if ((exact && exact.engines.length >= 2) || related >= 12) return 'alta'
  if (exact || related >= 4) return 'media'
  return 'baja'
}

/* ---------------- Palabra clave de un artículo ---------------- */

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'para', 'con', 'en', 'y', 'o', 'a', 'al', 'por', 'que', 'qué', 'mi', 'tu'])
export const significantWords = (k: string) => k.toLowerCase().split(/\s+/).filter((w) => w && !STOP.has(w))

export async function researchKeyword(
  topic: { title: string; keyword: string; theme: ThemeCode; destination: string; notes?: string },
  s: BlogSettings,
  existing: Post[]
): Promise<{ research: KeywordResearch; usd: number; citations: { url: string; title: string }[] }> {
  // La hipótesis completa y una versión corta (dos palabras significativas) para captar búsquedas más amplias
  const seeds = [topic.keyword, significantWords(topic.keyword).slice(0, 2).join(' ')].filter(Boolean)
  const harvest = (await Promise.all(Array.from(new Set(seeds)).map((q, i) => harvestSearches(q, i === 0)))).flat()
  const merged = new Map<string, Harvest>()
  for (const h of harvest) {
    const m = merged.get(h.term)
    if (m) m.score += h.score
    else merged.set(h.term, { ...h })
  }
  const top = Array.from(merged.values()).sort((a, b) => b.score - a.score).slice(0, 80)

  const used = existing.filter((p) => p.keyword).map((p) => `${p.keyword} (${p.status})`).join('; ') || 'ninguno'
  const { data, usd, citations } = await askAi<KeywordResearch>({
    model: s.models.research,
    web: s.models.webSearchResults,
    json: true,
    system:
      'Eres un consultor SEO senior en España. Trabajas con datos reales que te paso (autocompletado de buscadores y resultados web). Nunca inventes volúmenes de búsqueda. Respondes solo con JSON.',
    prompt: `Tema del artículo: «${topic.title}»
Palabra clave de partida (hipótesis): «${topic.keyword}»
Página de venta a la que debe empujar: ${topic.destination}
${topic.notes ? 'Notas: ' + topic.notes : ''}

Búsquedas reales del autocompletado de Google, Bing y DuckDuckGo en España (término · señal de demanda · buscadores):
${top.map((h) => `- ${h.term} · ${h.score} · ${h.engines.join('/')}`).join('\n')}

Palabras clave que ya usa el blog (no canibalizar): ${used}

Busca en la web qué páginas en español posicionan hoy para la palabra clave y analízalas.

Devuelve este JSON:
{
 "keyword": "palabra clave principal final: 1 a 3 palabras significativas (sin contar artículos ni preposiciones), que la gente busque de verdad según el autocompletado y encaje con el tema. Entre las que encajen de lleno con el tema y con quien lee (gerentes de empresas de servicios), elige la de MAYOR señal de demanda; no cambies a una más genérica o con menos demanda. Puede ser distinta de la hipótesis si hay una mejor.",
 "intent": "informativa | comercial | transaccional | navegacional",
 "demand": "alta | media | baja (según la señal del autocompletado)",
 "suggestions": ["10-15 búsquedas reales del listado relacionadas"],
 "questions": ["5-8 preguntas reales que se hace la gente (del autocompletado o de los resultados)"],
 "secondary": ["exactamente 3 palabras clave secundarias de 1-3 palabras, sacadas del listado"],
 "alternatives": [{"keyword": "otra opción", "why": "por qué podría ser mejor o peor"}],
 "competitors": [{"title": "", "url": "", "covers": "qué cubre"}],
 "gaps": ["qué les falta a los resultados actuales que nosotros sí podemos aportar"]
}`,
  })
  return { research: data, usd, citations }
}

/* ---------------- Propuestas de temas nuevos ---------------- */

export async function proposeTopics(
  opts: { focus?: string; theme?: ThemeCode | ''; count: number },
  s: BlogSettings,
  rules: BlogRules,
  existingTopics: Topic[],
  posts: Post[]
): Promise<{ topics: Topic[]; usd: number }> {
  const THEMES = allThemes(s)
  const theme = opts.theme ? THEMES.find((t) => t.code === opts.theme) : null
  const seeds = opts.focus
    ? [opts.focus]
    : theme
      ? [theme.name.split(':')[0], ...SITE_PAGES.filter((p) => p.path === theme.salesPage).map((p) => p.title)]
      : ['asistente virtual abogados', 'automatizar atención al cliente', 'agente de voz IA', 'automatizar procesos empresa', 'chatbot WhatsApp empresa']

  const harvest = (await Promise.all(seeds.slice(0, 4).map((q) => harvestSearches(q, false)))).flat()
  const seen = new Map<string, Harvest>()
  for (const h of harvest) if (!seen.has(h.term) || seen.get(h.term)!.score < h.score) seen.set(h.term, h)
  const top = Array.from(seen.values()).sort((a, b) => b.score - a.score).slice(0, 120)

  const taken = [...existingTopics.filter((t) => t.status !== 'descartado').map((t) => t.keyword), ...posts.map((p) => p.keyword)]
  const { data, usd } = await askAi<{ topics: Array<Omit<Topic, 'id' | 'createdAt' | 'status' | 'order' | 'source' | 'ownMaterial'> & { ownMaterial?: string }> }>({
    model: s.models.research,
    web: Math.min(5, s.models.webSearchResults),
    json: true,
    system: 'Eres el estratega de contenidos de BuffaloIA. Propones temas de blog que atraen a quien puede comprar, no a curiosos. Usas solo datos reales que te paso. Respondes solo con JSON.',
    prompt: `Quién lee: socio director, fundador o gerente de una empresa de servicios de 10-100 personas en España, con mucho volumen de llamadas, WhatsApp, formularios o documentos. Sector principal: despachos de abogados.

Temas del blog (código: nombre → página de venta):
${THEMES.filter((t) => t.code !== 'N').map((t) => `${t.code}: ${t.name} → ${t.salesPage}`).join('\n')}

Páginas de la web que se pueden enlazar:
${SITE_PAGES.filter((p) => !p.noLink).map((p) => `${p.path} · ${p.title}: ${p.about}`).join('\n')}

Línea editorial (resumen): ${rules.voice.split('\n')[0]}

${opts.focus ? 'El equipo quiere temas sobre: ' + opts.focus : theme ? 'Tema pedido: ' + theme.code + ' ' + theme.name : 'Temas libres dentro de los del blog.'}

Búsquedas reales en España (autocompletado de Google/Bing/DuckDuckGo · señal de demanda):
${top.map((h) => `- ${h.term} · ${h.score}`).join('\n')}

Palabras clave que ya tenemos (no repetir ni canibalizar): ${taken.join('; ') || 'ninguna'}

Busca en la web qué está cambiando ahora en este mercado (2026) por si hay un ángulo nuevo.

Propón ${opts.count} temas distintos. Cada uno con palabra clave de 1-3 palabras significativas que aparezca en el listado de búsquedas reales. Devuelve:
{"topics":[{
 "title": "título de trabajo como lo buscaría un gerente",
 "keyword": "palabra clave principal",
 "theme": "código de la categoría (${THEMES.filter((t) => t.code !== 'N').map((t) => t.code).join('|')})",
 "kind": "articulo | pilar | sector",
 "destination": "ruta de la página de venta",
 "notes": "ángulo y por qué este artículo ganaría a lo que ya posiciona",
 "evidence": {"searches": ["3-6 búsquedas reales del listado que lo justifican"], "intent": "", "demand": "alta|media|baja", "whyNow": "por qué ahora", "links": ["2-3 rutas internas con las que enlazaría"]}
}]}`,
  })

  const now = new Date().toISOString()
  const topics: Topic[] = (data.topics || []).map((t, i) => ({
    id: newId('prop-'),
    source: 'propuesta',
    order: 1000 + i,
    title: t.title,
    keyword: t.keyword,
    theme: (t.theme as ThemeCode) || 'A',
    kind: t.kind || 'articulo',
    destination: t.destination || '/auditoria/',
    ownMaterial: t.ownMaterial || 'Banco de ideas',
    notes: t.notes,
    evidence: t.evidence,
    status: 'pendiente',
    createdAt: now,
  }))
  return { topics, usd }
}

/* ---------------- Actualidad ---------------- */

const NEWS_QUERIES = [
  'inteligencia artificial empresas España',
  'AI Act Reglamento inteligencia artificial',
  'AEPD inteligencia artificial',
  'WhatsApp Business API novedades',
  'agentes de voz inteligencia artificial',
  'OpenAI nuevo modelo',
  'Anthropic Claude nuevo',
  'Google Gemini empresas',
  'inteligencia artificial abogados',
]

async function googleNews(q: string): Promise<{ title: string; url: string; date: string; source: string }[]> {
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:14d')}&hl=es&gl=ES&ceid=ES:es`)
    if (!res.ok) return []
    const xml = await res.text()
    return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).slice(0, 8).map((m) => {
      const get = (tag: string) => (m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || ''
      return {
        title: get('title').replace(/<!\[CDATA\[|\]\]>/g, ''),
        url: get('link'),
        date: get('pubDate'),
        source: get('source').replace(/<!\[CDATA\[|\]\]>/g, ''),
      }
    })
  } catch {
    return []
  }
}

/** Noticias de los últimos 14 días que de verdad afectan a nuestro lector, con ángulo propio. */
export async function findNews(s: BlogSettings, count = 4, posts: Post[] = []): Promise<{ topics: Topic[]; usd: number }> {
  const items = (await Promise.all(NEWS_QUERIES.map(googleNews))).flat()
  const unique = Array.from(new Map(items.map((i) => [i.title.toLowerCase().slice(0, 70), i] as [string, typeof i])).values()).slice(0, 70)

  const { data, usd } = await askAi<{ topics: Array<{ title: string; keyword: string; destination: string; notes: string; evidence: Topic['evidence'] }> }>({
    model: s.models.research,
    web: Math.min(5, s.models.webSearchResults),
    json: true,
    system: 'Eres el editor de actualidad de BuffaloIA. Solo eliges noticias que cambian algo para un gerente de una empresa de servicios en España (despachos, inmobiliarias, seguros, clínicas). Nada de «ChatGPT vs Gemini» ni tendencias genéricas. Respondes solo con JSON.',
    prompt: `Titulares de los últimos 14 días (Google Noticias):
${unique.map((n) => `- ${n.title} · ${n.source} · ${n.date} · ${n.url}`).join('\n')}

Artículos que ya tenemos: ${posts.map((p) => p.title).slice(0, 40).join('; ') || 'ninguno'}

Comprueba en la web los hechos de las que elijas. Elige como máximo ${count} noticias que de verdad afecten a nuestro lector (un plazo legal, un cambio de precio o de condiciones de WhatsApp, un modelo que abarata los agentes de voz, una resolución de la AEPD...). Si ninguna vale, devuelve una lista vacía. Para cada una:
{"topics":[{
 "title": "título con ángulo propio: qué significa para tu empresa (no el titular de la noticia)",
 "keyword": "palabra clave de 1-3 palabras que la gente esté buscando sobre esto",
 "destination": "ruta de la página de venta de buffaloia.com más relacionada",
 "notes": "qué ha pasado, a quién afecta y qué debería hacer el lector",
 "evidence": {"whyNow": "", "sources": [{"title": "", "url": "fuente primaria si existe"}], "demand": "alta|media|baja", "links": ["rutas internas"]}
}]}`,
  })

  const now = new Date().toISOString()
  return {
    usd,
    topics: (data.topics || []).map((t, i) => ({
      id: newId('news-'),
      source: 'noticia',
      order: 2000 + i,
      title: t.title,
      keyword: t.keyword,
      theme: 'N',
      kind: 'actualidad',
      destination: t.destination || '/auditoria/',
      ownMaterial: 'Opinión de BuffaloIA sobre el impacto',
      notes: t.notes,
      evidence: t.evidence,
      status: 'pendiente',
      createdAt: now,
    })),
  }
}
