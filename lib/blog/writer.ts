/**
 * Del tema al artículo: brief → borrador → control → correcciones → imágenes.
 */
import { askAi, generateImage } from './ai'
import { SITE_PAGES, THEMES } from './defaults'
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
  return [...blog, ...SITE_PAGES]
}

/* ---------------- 1. Brief ---------------- */

export async function makeBrief(post: Post, topic: Topic | null, s: BlogSettings, rules: BlogRules, all: Post[]): Promise<Post> {
  const theme = THEMES.find((t) => t.code === post.theme)
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
    system: 'Eres el editor jefe del blog de BuffaloIA. Preparas briefs que un redactor puede seguir sin dudas. Solo usas URLs que existen. Respondes solo con JSON.',
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
 "ownMaterial": "qué material propio concreto va y dónde; si no hay, indica [SERGI: ...]",
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
  for (const fallback of ['/auditoria/', '/casos-de-exito/', '/servicios-ia/']) {
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
    ownMaterial: raw.ownMaterial || '[SERGI: añadir un caso o dato propio]',
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

interface Draft {
  h1: string
  slug: string
  metaDescription: string
  excerpt: string
  body: string
  faq: { q: string; a: string }[]
  secondary: string[]
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

FORMATO DEL CUERPO (campo body)
- HTML limpio: <h2>, <h3>, <p>, <ul>/<ol>/<li>, <strong>, <a href="URL">texto</a>, <table> si compara cosas. Sin <h1>, sin estilos, sin clases, sin imágenes.
- Los indicadores de imagen van solos en su párrafo: <p>(imagen1)</p> y <p>(imagen2)</p>, en puntos que tengan sentido visual.
- Párrafos cortos. Nada de relleno.

Respondes solo con JSON.`
}

export async function makeDraft(post: Post, s: BlogSettings, rules: BlogRules): Promise<Post> {
  const b = post.brief
  if (!b) throw new Error('El artículo no tiene brief todavía')
  const [wMin, wMax] = post.kind === 'pilar' ? s.seo.wordsPillar : s.seo.wordsArticle

  const { data, usd } = await askAi<Draft>({
    model: s.models.writing,
    json: true,
    maxTokens: 16000,
    system: writerSystem(rules),
    prompt: `Escribe el artículo completo siguiendo este brief.

H1 propuesto: ${b.h1}
Slug: ${b.slug}
Meta-description: ${b.metaDescription}
Palabra clave principal: «${b.research.keyword}»
Secundarias: ${b.research.secondary.join(', ')}
Ángulo: ${b.angle}
Estructura:
${b.outline.map((o) => `- H2: ${o.h2}${o.h3?.length ? ' (H3: ' + o.h3.join(' / ') + ')' : ''}${o.notes ? ' — ' + o.notes : ''}`).join('\n')}
Preguntas frecuentes: ${b.faq.join(' | ')}
Material propio: ${b.ownMaterial}
CTA: NO escribas una llamada a la acción al final; la plantilla añade un único CTA («${b.cta}»). Termina con el último punto del contenido.
Longitud: ${wMin}-${wMax} palabras.

NORMAS SEO (obligatorias, se comprueban una a una):
${rules.seo}

ENLACES INTERNOS (exactamente estos 3, uno de cada tipo):
${b.internalLinks.map((l) => `- ${l.url} → ${l.anchorType === 'h2' ? 'un H2 completo enlazado: <h2><a href="' + l.url + '">texto del H2</a></h2>' : l.anchorType === 'frase' ? 'una frase de varias palabras enlazada dentro de un párrafo' : 'UNA sola palabra enlazada dentro de un párrafo'}`).join('\n')}

ENLACES EXTERNOS (exactamente estos 3, repartidos por el texto, con texto ancla descriptivo):
${b.externalLinks.map((l) => `- ${l.url} (${l.title}): ${l.reason}`).join('\n')}

Antes de responder, repasa tú mismo: palabra clave al menos ${s.seo.keywordMinCount} veces, en el H1, en la meta, en el slug, en el primer párrafo y en un H2 o H3; cada secundaria al menos ${s.seo.secondaryMinCount} veces; H1 ≤ ${s.seo.h1Max} caracteres; meta ≤ ${s.seo.metaMax}; párrafos de máximo ${s.seo.paragraphMaxLines} líneas.

Devuelve:
{"h1": "", "slug": "", "metaDescription": "", "excerpt": "1-2 frases para la tarjeta del blog", "body": "<p>...</p>", "faq": [{"q": "", "a": "40-80 palabras"}], "secondary": ["3 secundarias tal cual las usas"], "imagePrompts": {"featured": "", "infographic": ""}}`,
  })
  addCost(post, usd)
  applyDraft(post, data, s)
  post.status = 'borrador'
  log(post, 'Borrador escrito', `${post.body.split(/\s+/).length} palabras aprox.`)
  return post
}

function applyDraft(post: Post, d: Partial<Draft>, s: BlogSettings) {
  if (d.h1) post.h1 = d.h1.trim()
  if (d.slug) post.slug = slugify(d.slug).slice(0, s.seo.slugMax).replace(/-+$/, '')
  if (d.metaDescription) post.metaDescription = d.metaDescription.trim()
  if (d.excerpt) post.excerpt = d.excerpt.trim()
  if (d.body) post.body = d.body.trim()
  if (d.faq?.length) post.faq = d.faq
  if (d.secondary?.length) post.secondary = d.secondary.slice(0, s.seo.secondaryCount)
  if (d.imagePrompts?.featured) post.imagePrompts = d.imagePrompts
}

/* ---------------- 3. Control y correcciones ---------------- */

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
    const { data, usd } = await askAi<Partial<Draft>>({
      model: s.models.writing,
      json: true,
      maxTokens: 16000,
      system: writerSystem(rules),
      prompt: `Este artículo no pasa el control. Corrige SOLO lo necesario para que pase, sin empeorar la naturalidad ni tocar lo que está bien. Mantén exactamente los mismos enlaces.

FALLOS:
${fails.map((f) => `- ${f.label}: ${f.detail}`).join('\n')}

Palabra clave: «${post.keyword}» · Secundarias: ${post.secondary.join(', ')}

ARTÍCULO ACTUAL (JSON):
${JSON.stringify({ h1: post.h1, slug: post.slug, metaDescription: post.metaDescription, excerpt: post.excerpt, body: post.body, faq: post.faq, secondary: post.secondary, imagePrompts: post.imagePrompts })}

Devuelve el JSON completo corregido con los mismos campos.`,
    })
    addCost(post, usd)
    applyDraft(post, data, s)
    log(post, `Corrección ${round + 1}`, fails.map((f) => f.label).join(' · '))
  }
  return post
}

/* ---------------- 4. Imágenes ---------------- */

export async function makeImages(post: Post, s: BlogSettings, rules: BlogRules): Promise<Post> {
  if (s.images.provider === 'ninguno' || !post.imagePrompts) return post
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
