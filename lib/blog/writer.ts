/**
 * Del tema al artículo: brief → borrador → control → correcciones → imágenes.
 */
import { askAi, generateImage } from './ai'
import { allThemes, NO_CASES_RULE, SITE_PAGES } from './defaults'
import { researchKeyword } from './research'
import { blockingFailures, runChecks, slugify } from './seo'
import type { BlogRules, BlogSettings, Brief, Post, Topic } from './types'

const nowIso = () => new Date().toISOString()

export function log(post: Post, event: string, detail?: string, by?: string) {
  post.history = [{ at: nowIso(), event, detail, by }, ...(post.history || [])].slice(0, 80)
  post.updatedAt = nowIso()
}

function addCost(post: Post, usd: number) {
  post.cost = { usd: Math.round(((post.cost?.usd || 0) + usd) * 10000) / 10000 }
}

/** Comprueba que un enlace responde (para no publicar enlaces rotos). */
export async function linkAlive(url: string): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (res.status === 405 || res.status === 403) res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
    return res.status < 400
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

/** Páginas candidatas para los 3 enlaces internos: la web y los artículos ya publicados o aprobados. */
function internalCandidates(post: Post, all: Post[], s: BlogSettings) {
  const blog = all
    .filter((p) => p.id !== post.id && ['publicado', 'aprobado'].includes(p.status))
    .map((p) => ({ path: `${s.site.blogPath}${p.slug}/`, title: p.h1, about: `Artículo del tema ${p.theme}${p.kind === 'pilar' ? ' (guía pilar)' : ''}: ${p.keyword}` }))
  return [...blog, ...SITE_PAGES.filter((p) => !p.noLink)]
}

/* ---------------- 1. Brief ---------------- */

export async function makeBrief(post: Post, topic: Topic | null, s: BlogSettings, rules: BlogRules, all: Post[]): Promise<Post> {
  const theme = allThemes(s).find((t) => t.code === post.theme)
  const destination = topic?.destination || theme?.salesPage || '/auditoria/'
  const { research, usd, citations } = await researchKeyword(
    { title: post.title, keyword: post.keyword || topic?.keyword || post.title, theme: post.theme, destination, notes: topic?.notes },
    s,
    all
  )
  addCost(post, usd)

  const candidates = internalCandidates(post, all, s)
  const { data: raw, usd: usd2 } = await askAi<Partial<Omit<Brief, 'research'>>>({
    model: s.models.research,
    web: s.models.webSearchResults,
    json: true,
    maxTokens: 16000,
    system: `Eres el editor jefe del blog de BuffaloIA. Preparas briefs que un redactor puede seguir sin dudas. Solo usas URLs que existen. Respondes solo con JSON.

${NO_CASES_RULE}`,
    prompt: `Artículo: «${post.title}» (${post.kind}, tema ${post.theme}: ${theme?.name})
Pregunta del lector en este tema: ${theme?.question}
Palabra clave principal validada: «${research.keyword}» (${research.intent}, demanda ${research.demand})
Secundarias: ${research.secondary.join(', ')}
Preguntas reales de la gente: ${research.questions.join(' | ')}
Lo que posiciona ahora: ${research.competitors.map((c) => `${c.title} (${c.url}): ${c.covers}`).join(' | ')}
Huecos que podemos cubrir: ${research.gaps.join(' | ')}
Página de venta destino: ${destination}
Material propio sugerido: ${topic?.ownMaterial || 'Banco de ideas'}
${topic?.notes ? 'Notas del tema: ' + topic.notes : ''}

Estructura obligatoria:
${rules.structure}

Normas SEO:
${rules.seo}

Páginas internas que existen (elige EXACTAMENTE 3 distintas; una debe ser la página de venta ${destination}):
${candidates.map((p) => `${p.path} · ${p.title}: ${p.about}`).join('\n')}

Busca en la web 3 fuentes externas primarias y fiables en español (preferiblemente: ${rules.trustedSources.join(', ')}) que respalden datos concretos del artículo. Solo URLs que hayas visto en la búsqueda.

Material propio disponible:
${rules.ownMaterial}

Sé breve en las notas del esquema (máximo 25 palabras cada una): el redactor ya tiene las reglas. Rellena TODOS los campos, en este orden:
{
 "h1": "máximo ${s.seo.h1Max} caracteres, con la palabra clave",
 "slug": "kebab-case, máximo ${s.seo.slugMax} caracteres, con la palabra clave",
 "metaDescription": "máximo ${s.seo.metaMax} caracteres, con la palabra clave",
 "angle": "qué hace distinto a este artículo, en 1-2 frases",
 "internalLinks": [{"url": "/ruta/", "anchorType": "h2|frase|palabra", "reason": "breve"}],
 "externalLinks": [{"url": "https://...", "title": "", "reason": "qué dato respalda"}],
 "faq": ["3-5 preguntas reales"],
 "ownMaterial": "qué parte del método u opinión de BuffaloIA va y dónde, y qué ejemplo hipotético del sector se usa (nunca casos ni clientes propios)",
 "cta": "el único CTA final, coherente con ${destination}, en una frase",
 "imagePrompts": {"featured": "prompt de la imagen destacada", "infographic": "prompt de una infografía o diagrama que explique una idea del artículo"},
 "outline": [{"h2": "", "h3": [""], "notes": "breve"}]
}`,
  })
  addCost(post, usd2)
  const data = await completeBrief(raw, { post, s, destination, candidates, research })
  addCost(post, data.usd)

  // Enlaces externos: solo los que responden. Si no hay suficientes, búsqueda específica en fuentes fiables.
  const alive: Brief['externalLinks'] = []
  const tryAdd = async (l: { url: string; title: string; reason: string }) => {
    if (alive.length < s.seo.externalLinks && l.url && !alive.some((a) => a.url === l.url) && !l.url.includes('buffaloia.com') && (await linkAlive(l.url))) alive.push(l)
  }
  for (const l of data.externalLinks) await tryAdd(l)
  for (const c of citations) if (rules.trustedSources.some((d) => c.url.includes(d))) await tryAdd({ url: c.url, title: c.title, reason: 'Fuente encontrada en la investigación' })
  if (alive.length < s.seo.externalLinks) {
    const found = await findSources(post, research.keyword, s, rules, s.seo.externalLinks - alive.length + 2)
    addCost(post, found.usd)
    for (const l of found.links) await tryAdd(l)
  }

  const brief: Brief = { ...data, externalLinks: alive, research }
  post.brief = brief
  // En un artículo escrito a mano el brief sólo sugiere: no pisa lo que ya ha puesto la persona
  const keep = (v: string | undefined) => post.manual && !!v
  if (!keep(post.keyword)) post.keyword = research.keyword
  if (!post.manual || !post.secondary.length) post.secondary = research.secondary.slice(0, s.seo.secondaryCount)
  if (!keep(post.h1) || post.h1 === post.title) post.h1 = brief.h1
  if (!keep(post.slug)) post.slug = slugify(brief.slug || brief.h1).slice(0, s.seo.slugMax).replace(/-+$/, '')
  if (!keep(post.metaDescription)) post.metaDescription = brief.metaDescription
  post.imagePrompts = post.imagePrompts?.featured ? post.imagePrompts : brief.imagePrompts
  if (!post.manual) post.status = 'brief'
  log(post, 'Brief generado', `Palabra clave «${research.keyword}» · demanda ${research.demand} · ${alive.length} fuentes externas verificadas`)
  return post
}

/**
 * Garantiza que el brief tiene todos los campos. Si la respuesta vino incompleta
 * (por ejemplo, cortada), pide solo lo que falta y, en último caso, usa valores seguros.
 */
async function completeBrief(
  raw: Partial<Omit<Brief, 'research'>>,
  ctx: { post: Post; s: BlogSettings; destination: string; candidates: { path: string; title: string }[]; research: Brief['research'] }
): Promise<Omit<Brief, 'research'> & { usd: number }> {
  const { post, s, destination, candidates, research } = ctx
  let usd = 0
  const missing = (['h1', 'slug', 'metaDescription', 'faq', 'internalLinks', 'ownMaterial', 'cta', 'imagePrompts', 'outline'] as const).filter((k) => {
    const v = raw[k]
    return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (k === 'imagePrompts' && !(v as Brief['imagePrompts'])?.featured)
  })
  if (missing.length) {
    try {
      const { data, usd: u } = await askAi<Partial<Omit<Brief, 'research'>>>({
        model: s.models.research,
        json: true,
        maxTokens: 6000,
        system: 'Completas briefs de blog. Respondes solo con JSON.',
        prompt: `Artículo: «${post.title}». Palabra clave: «${research.keyword}». Página de venta: ${destination}.
Páginas internas disponibles: ${candidates.slice(0, 25).map((c) => c.path).join(', ')}
Brief actual: ${JSON.stringify({ ...raw, outline: raw.outline?.map((o) => o.h2) })}

Devuelve SOLO estos campos que faltan, con el mismo formato del brief: ${missing.join(', ')}.
- faq: 3-5 preguntas reales (texto).
- internalLinks: exactamente 3 [{"url","anchorType":"h2|frase|palabra","reason"}], una de ellas ${destination}.
- imagePrompts: {"featured","infographic"}.
- outline: [{"h2","h3":[],"notes"}] con 5-7 H2.`,
      })
      usd += u
      raw = { ...raw, ...data }
    } catch {
      // se usan los valores seguros de abajo
    }
  }

  // Enlaces internos: exactamente 3 distintos, uno de cada tipo, y siempre la página de venta
  const types: ('h2' | 'frase' | 'palabra')[] = ['h2', 'frase', 'palabra']
  const valid = new Set(candidates.map((c) => c.path))
  let links = (raw.internalLinks || []).filter((l) => l && valid.has(l.url))
  if (!links.some((l) => l.url === destination) && valid.has(destination)) links.unshift({ url: destination, anchorType: 'h2', reason: 'Página de venta del tema' })
  for (const fallback of ['/auditoria/', '/servicios-ia/', '/contact/']) {
    if (links.length >= 3) break
    if (!links.some((l) => l.url === fallback)) links.push({ url: fallback, anchorType: 'frase', reason: 'Enlace de apoyo' })
  }
  links = links.filter((l, i, arr) => arr.findIndex((x) => x.url === l.url) === i).slice(0, 3)
  links.forEach((l, i) => (l.anchorType = types[i]))

  return {
    h1: raw.h1 || post.title.slice(0, s.seo.h1Max),
    slug: raw.slug || slugify(research.keyword),
    metaDescription: raw.metaDescription || '',
    angle: raw.angle || '',
    outline: (raw.outline || []).map((o) => ({ h2: o.h2, h3: o.h3 || [], notes: o.notes || '' })),
    faq: (raw.faq || research.questions || []).slice(0, 5),
    internalLinks: links,
    externalLinks: raw.externalLinks || [],
    ownMaterial: raw.ownMaterial || 'Método de BuffaloIA (auditoría primero, fase pequeña y medible) y un ejemplo hipotético del sector',
    cta: raw.cta || 'En la auditoría revisamos tu caso contigo: media hora, sin coste.',
    imagePrompts: raw.imagePrompts?.featured ? raw.imagePrompts : { featured: `Fotografía editorial de una oficina de servicios en España relacionada con: ${research.keyword}`, infographic: `Infografía sencilla que explique: ${post.title}` },
    usd,
  }
}

/** Búsqueda específica de fuentes primarias y fiables para los enlaces externos. */
async function findSources(post: Post, keyword: string, s: BlogSettings, rules: BlogRules, n: number) {
  try {
    const { data, usd, citations } = await askAi<{ links: { url: string; title: string; reason: string }[] }>({
      model: s.models.research,
      web: 6,
      json: true,
      maxTokens: 3000,
      system: 'Buscas fuentes primarias fiables en español. Solo devuelves URLs que has visto en la búsqueda. Respondes solo con JSON.',
      prompt: `Necesito ${n} fuentes externas con autoridad para un artículo sobre «${post.title}» (palabra clave «${keyword}»), dirigido a empresas de servicios en España.
Prioriza estos dominios: ${rules.trustedSources.join(', ')}. También valen organismos oficiales, colegios profesionales, estudios con metodología o medios de referencia. Nunca competidores (agencias o empresas de software de IA).
Devuelve {"links":[{"url":"","title":"","reason":"qué dato o norma respalda"}]}`,
    })
    const links = [...(data.links || []), ...citations.map((c) => ({ url: c.url, title: c.title, reason: 'Fuente encontrada' }))]
    return { links, usd }
  } catch {
    return { links: [], usd: 0 }
  }
}

/* ---------------- 2. Borrador ---------------- */
/*
 * El texto se pide en HTML directo (no dentro de un JSON): así no se corta a
 * medias ni se rompe al escapar comillas. Los datos (título, descripción,
 * resumen, preguntas) se sacan después con una llamada pequeña y barata.
 */

interface Meta {
  h1: string
  metaDescription: string
  excerpt: string
  faq: { q: string; a: string }[]
  imagePrompts: { featured: string; infographic: string }
}

function writerSystem(rules: BlogRules) {
  return `Eres el mejor redactor de blogs B2B de España y escribes para BuffaloIA. Tus artículos posicionan en Google porque responden mejor que nadie a lo que busca la gente, y se leen de un tirón porque suenan a una persona con experiencia, no a una máquina.

VOZ
${rules.voice}

NUNCA USES estas expresiones: ${rules.bannedPhrases.join(' · ')}
NUNCA DIGAS: ${rules.neverSay.join(' · ')}

REGLAS DE CONTENIDO
${rules.ownMaterial}

${NO_CASES_RULE}

FORMATO
- Devuelves SOLO el cuerpo del artículo en HTML limpio, sin \`\`\` ni explicaciones: <h2>, <h3>, <p>, <ul>/<ol>/<li>, <strong>, <a href="URL">texto</a>, <table> si compara cosas.
- Sin <h1> (lo pone la plantilla), sin estilos, sin clases, sin imágenes, sin preguntas frecuentes al final (van aparte) y sin llamada a la acción final (la pone la plantilla).
- Los indicadores de imagen van solos en su párrafo: <p>(imagen1)</p> y <p>(imagen2)</p>, en puntos con sentido visual.
- Párrafos de 2 a 4 frases. Nada de relleno.`
}

/** Saca el HTML de una respuesta aunque venga con ``` o texto alrededor. */
function extractHtml(text: string): string {
  let t = text.trim().replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim()
  const first = t.search(/<(p|h2|h3|ul|ol|table)[\s>]/i)
  if (first > 0) t = t.slice(first)
  return t
}

const words = (html: string) => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length

function linkRules(post: Post) {
  const b = post.brief!
  return `ENLACES A VUESTRA WEB (exactamente estos 3, uno de cada tipo):
${b.internalLinks.map((l) => `- ${l.url} → ${l.anchorType === 'h2' ? 'un H2 entero enlazado: <h2><a href="' + l.url + '">texto del H2</a></h2>' : l.anchorType === 'frase' ? 'una frase de 3 o más palabras enlazada dentro de un párrafo' : 'UNA sola palabra enlazada dentro de un párrafo'}`).join('\n')}

ENLACES A OTRAS WEBS (exactamente estos 3, repartidos por el texto, con texto ancla descriptivo, nunca la URL a la vista):
${b.externalLinks.map((l) => `- ${l.url} (${l.title}): ${l.reason}`).join('\n') || '- (no hay fuentes verificadas: no inventes enlaces externos)'}`
}

export async function makeDraft(post: Post, s: BlogSettings, rules: BlogRules): Promise<Post> {
  const b = post.brief
  if (!b) throw new Error('El artículo no tiene brief todavía')
  const [wMin, wMax] = post.kind === 'pilar' ? s.seo.wordsPillar : s.seo.wordsArticle
  const perSection = Math.round(((wMin + wMax) / 2) / Math.max(4, b.outline.length || 5))

  const { data: text, usd } = await askAi<string>({
    model: s.models.writing,
    maxTokens: 32000,
    system: writerSystem(rules),
    prompt: `Escribe el cuerpo completo del artículo «${b.h1}».

LONGITUD: entre ${wMin} y ${wMax} palabras en total (es un${post.kind === 'pilar' ? 'a guía pilar' : ' artículo'}). Desarrolla cada H2 con unas ${perSection} palabras. No te quedes corto.

Palabra clave principal: «${b.research.keyword}». Úsala al menos ${s.seo.keywordMinCount} veces de forma natural: en el primer párrafo, en al menos un H2 o H3 y repartida por el texto.
Secundarias (cada una al menos ${s.seo.secondaryMinCount} veces): ${post.secondary.join(', ')}
Ángulo: ${b.angle}
Preguntas que se hace la gente (respóndelas dentro del texto): ${b.research.questions.join(' | ')}
Material propio: ${b.ownMaterial}

ESTRUCTURA
${b.outline.map((o) => `- H2: ${o.h2}${o.h3?.length ? ' (H3: ' + o.h3.join(' / ') + ')' : ''}${o.notes ? ' — ' + o.notes : ''}`).join('\n')}

${linkRules(post)}

NORMAS SEO
${rules.seo}

Empieza directamente con el primer <p>.`,
  })
  addCost(post, usd)
  post.body = extractHtml(text)
  post.status = 'borrador'
  log(post, 'Borrador escrito', `${words(post.body)} palabras`)
  await makeMeta(post, s, rules)
  return post
}

/** Título, descripción, resumen, preguntas frecuentes y prompts de imagen, a partir del texto ya escrito. */
async function makeMeta(post: Post, s: BlogSettings, rules: BlogRules, only?: string[]) {
  const b = post.brief!
  const { data, usd } = await askAi<Partial<Meta>>({
    model: s.models.research,
    json: true,
    maxTokens: 6000,
    system: 'Eres el editor SEO de BuffaloIA. Respondes solo con JSON.',
    prompt: `Artículo (HTML):
${post.body.slice(0, 30000)}

Palabra clave principal: «${post.keyword}»
${only ? 'Devuelve SOLO estos campos: ' + only.join(', ') : 'Devuelve todos los campos.'}
{
 "h1": "título de máximo ${s.seo.h1Max} caracteres, con «${post.keyword}» lo más a la izquierda posible, como lo buscaría un gerente",
 "metaDescription": "máximo ${s.seo.metaMax} caracteres, con «${post.keyword}», dice qué se aprende y por qué importa, sin comillas dobles",
 "excerpt": "1-2 frases para la tarjeta del blog",
 "faq": [{"q": "pregunta real (de estas si encajan: ${b.research.questions.slice(0, 6).join(' | ')})", "a": "respuesta de 40-80 palabras, autosuficiente, con el tono del artículo"}],
 "imagePrompts": {"featured": "prompt de la imagen destacada", "infographic": "prompt de una infografía que explique una idea concreta del artículo"}
}
Entre 3 y 5 preguntas frecuentes. Respeta estas reglas de estilo: ${rules.bannedPhrases.slice(0, 12).join(', ')} están prohibidas.`,
  })
  addCost(post, usd)
  if (data.h1) post.h1 = data.h1.trim()
  if (data.metaDescription) post.metaDescription = data.metaDescription.trim().replace(/"/g, '')
  if (data.excerpt) post.excerpt = data.excerpt.trim()
  if (data.faq?.length) post.faq = data.faq.slice(0, 5)
  if (data.imagePrompts?.featured && !post.imagePrompts?.featured) post.imagePrompts = data.imagePrompts
  // La URL con la palabra clave y dentro del límite, sin depender de la IA
  if (!post.slug || !post.slug.includes(slugify(post.keyword))) post.slug = slugify(post.keyword + ' ' + post.h1.replace(new RegExp(post.keyword, 'i'), ''))
  post.slug = post.slug.slice(0, s.seo.slugMax).replace(/-[^-]*$/, (m) => (post.slug.length > s.seo.slugMax ? '' : m)).replace(/-+$/, '')
}

/* ---------------- 3. Control y correcciones ---------------- */

const META_CHECKS = ['kw-h1', 'kw-meta', 'kw-slug', 'h1-len', 'meta-len', 'slug-len', 'faq']

export async function checkAndFix(post: Post, s: BlogSettings, rules: BlogRules): Promise<Post> {
  for (let round = 0; round <= s.seo.maxRewrites; round++) {
    const { checks, score } = runChecks(post, s, rules)
    post.checks = checks
    post.score = score
    const fails = blockingFailures(checks)
    if (!fails.length) {
      log(post, 'Control SEO superado', `Nota ${score}/100`)
      return post
    }
    if (round === s.seo.maxRewrites) {
      log(post, 'Control SEO con fallos', fails.map((f) => f.label).join(' · '))
      return post
    }

    // 1) Lo pequeño (título, descripción, URL, preguntas): llamada barata, sin tocar el texto
    const metaFails = fails.filter((f) => META_CHECKS.includes(f.id))
    if (metaFails.length) {
      const fields = new Set<string>()
      for (const f of metaFails) {
        if (f.id.includes('h1')) fields.add('h1')
        if (f.id.includes('meta')) fields.add('metaDescription')
        if (f.id === 'faq') fields.add('faq')
      }
      if (metaFails.some((f) => f.id.includes('slug'))) post.slug = ''
      if (fields.size) await makeMeta(post, s, rules, Array.from(fields))
      else await makeMeta(post, s, rules, ['excerpt'])
    }

    // 2) El texto: solo si falla algo del cuerpo. Se reescribe con menos razonamiento (más rápido)
    const bodyFails = fails.filter((f) => !META_CHECKS.includes(f.id))
    if (bodyFails.length) {
      const [wMin, wMax] = post.kind === 'pilar' ? s.seo.wordsPillar : s.seo.wordsArticle
      const { data: text, usd } = await askAi<string>({
        model: s.models.writing,
        maxTokens: 32000,
        reasoning: 'low',
        system: writerSystem(rules),
        prompt: `Este artículo no pasa el control SEO. Corrige SOLO lo necesario, sin empeorar la naturalidad ni quitar contenido bueno, y devuelve el cuerpo completo corregido en HTML.

FALLOS
${bodyFails.map((f) => `- ${f.label}: ${f.detail}`).join('\n')}

Palabra clave: «${post.keyword}» (al menos ${s.seo.keywordMinCount} veces) · Secundarias (al menos ${s.seo.secondaryMinCount} veces cada una): ${post.secondary.join(', ')}
Longitud objetivo: ${wMin}-${wMax} palabras (ahora tiene ${words(post.body)}).

${linkRules(post)}

ARTÍCULO ACTUAL
${post.body}`,
      })
      addCost(post, usd)
      const fixed = extractHtml(text)
      // Si la respuesta viniera cortada, no se pierde el texto bueno
      if (words(fixed) >= words(post.body) * 0.8) post.body = fixed
    }
    log(post, `Corrección ${round + 1}`, fails.map((f) => f.label).join(' · '))
  }
  return post
}

/* ---------------- 4. Imágenes ---------------- */

export async function makeImages(post: Post, s: BlogSettings, rules: BlogRules): Promise<Post> {
  if (s.images.provider === 'ninguno') return post
  // Artículos escritos a mano sin investigación: prompts a partir del título
  if (!post.imagePrompts?.featured) {
    const about = post.h1 || post.title
    post.imagePrompts = {
      featured: `Imagen editorial para un artículo de blog titulado «${about}», dirigido a gerentes de empresas de servicios en España.`,
      infographic: `Infografía sencilla que resuma en 3-4 pasos o puntos la idea principal de «${about}».`,
    }
  }
  const jobs: { slot: 'destacada' | 'imagen1' | 'imagen2'; prompt: string; alt: string }[] = [
    { slot: 'destacada', prompt: `${post.imagePrompts.featured}\n\nEstilo: ${rules.imageStyle}`, alt: post.h1 },
    { slot: 'imagen1', prompt: `${post.imagePrompts.featured} (otro encuadre, detalle de la situación)\n\nEstilo: ${rules.imageStyle}`, alt: `${post.keyword}: situación del día a día` },
    { slot: 'imagen2', prompt: `${post.imagePrompts.infographic}\n\nInfografía limpia en español, fondo blanco, acentos verde #00c896, tipografía sans clara, pocos elementos, textos cortos y legibles.`, alt: `Infografía: ${post.keyword}` },
  ]
  const images = []
  for (const j of jobs) {
    try {
      const img = await generateImage({ provider: s.images.provider, prompt: j.prompt, openaiModel: s.images.openaiModel, openrouterModel: s.images.openrouterModel, size: s.images.size })
      if (img) {
        addCost(post, img.usd)
        images.push({ slot: j.slot, prompt: j.prompt, alt: j.alt, dataUrl: img.dataUrl })
      }
    } catch (e) {
      log(post, 'Error de imagen', `${j.slot}: ${e instanceof Error ? e.message : e}`)
    }
  }
  if (images.length) {
    post.images = images
    log(post, 'Imágenes generadas', `${images.length} de 3 con ${s.images.provider}`)
  }
  return post
}
