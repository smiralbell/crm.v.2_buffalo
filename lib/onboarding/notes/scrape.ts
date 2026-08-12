/**
 * Scraping real de la web del cliente — portado de notas-preview/server.js.
 * Extrae título, meta, secciones, señales digitales y ganchos (reglas o LLM).
 */

import {
  openRouterChatCompletion,
  parseJsonFromModelOutput,
  resolveModel,
} from '@/lib/openrouter'

const TIMEOUT_MS = 12000
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'

const RES_ABRE = '┌'
const RES_CIERRA = '└'

export type ScrapedResearch = {
  url: string
  host: string
  nombre: string
  sector: string
  hace: string
  servicios: string[]
  senales: string[]
  ganchos: string[]
  fuentes: string[]
  origen: string
  at: string
}

export type ResearchError = {
  error: string
  detalle?: string
}

type PageOk = { ok: true; status: number; url: string; html: string }
type PageFail = {
  ok: false
  status?: number
  url?: string
  reason?: string
}
type PageResult = PageOk | PageFail

type SignalsResult = {
  found: string[]
  langs: string[]
  tech: string[]
}

type ResearchDraft = {
  url: string
  host: string
  nombre: string
  titulo: string
  descripcion: string
  h1: string[]
  servicios: string[]
  senales: string[]
  idiomas: string[]
  tecnologia: string[]
  extracto: string
  fuentes: string[]
  scrapeadoEn: string
  ganchos: string[]
  sector: string
  hace: string
  origen: string
}

type LlmEnrichResult = {
  sector?: string
  hace?: string
  ganchos: string[]
  modelo: string
}

const NAMED: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  eacute: 'é',
  aacute: 'á',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h === '::1') return true
  if (/^127\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  return false
}

/** Rechaza localhost, rangos privados y esquemas que no sean http(s). */
function assertSafeUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, error: 'URL no válida' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Solo se permiten URLs http(s)' }
  }
  if (isBlockedHost(parsed.hostname)) {
    return { ok: false, error: 'URL no permitida (dirección privada o local)' }
  }
  return { ok: true, url: parsed }
}

function fetchErrorReason(e: unknown): string {
  let causa = ''
  let name = ''
  let message = ''

  if (typeof e === 'object' && e !== null) {
    if ('name' in e && typeof (e as { name: unknown }).name === 'string') {
      name = (e as { name: string }).name
    }
    if ('message' in e && typeof (e as { message: unknown }).message === 'string') {
      message = (e as { message: string }).message
    }
    if ('cause' in e) {
      const cause = (e as { cause: unknown }).cause
      if (typeof cause === 'object' && cause !== null) {
        const c = cause as { code?: unknown; message?: unknown }
        if (typeof c.code === 'string') causa = c.code
        else if (typeof c.message === 'string') causa = c.message
      } else if (typeof cause === 'string') {
        causa = cause
      }
    }
  }

  let reason = name === 'AbortError' ? 'no respondió a tiempo' : message || 'fetch failed'
  if (/ENOTFOUND|EAI_AGAIN/.test(causa)) reason = 'el dominio no existe o no resuelve'
  else if (/ECONNREFUSED/.test(causa)) reason = 'el servidor rechazó la conexión'
  else if (/CERT|SSL|TLS/i.test(causa)) reason = 'problema con el certificado HTTPS'
  else if (causa) reason = causa
  return reason
}

async function getPage(url: string): Promise<PageResult> {
  const safe = assertSafeUrl(url)
  if (!safe.ok) return { ok: false, reason: safe.error }

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'es-ES,es;q=0.9,ca;q=0.8,en;q=0.7',
      },
    })
    const type = res.headers.get('content-type') || ''
    if (!res.ok) return { ok: false, status: res.status, url: res.url }

    const finalSafe = assertSafeUrl(res.url)
    if (!finalSafe.ok) return { ok: false, reason: finalSafe.error, url: res.url }

    if (!/text\/html|application\/xhtml/i.test(type)) {
      return {
        ok: false,
        status: res.status,
        url: res.url,
        reason: 'no es HTML (' + type + ')',
      }
    }
    const html = await res.text()
    return { ok: true, status: res.status, url: res.url, html }
  } catch (e: unknown) {
    return { ok: false, reason: fetchErrorReason(e) }
  } finally {
    clearTimeout(t)
  }
}

const strip = (s: string): string =>
  (s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

/** Decodifica entidades con nombre y numéricas (&#x27; &#039; …). */
function decode(s: string): string {
  return (s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16))
    )
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m: string, n: string) =>
      Object.prototype.hasOwnProperty.call(NAMED, n) ? NAMED[n]! : m
    )
}

const text = (s: string): string =>
  decode(strip(s).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

function meta(html: string, name: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`,
    'i'
  )
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`,
    'i'
  )
  return decode((re.exec(html)?.[1] || alt.exec(html)?.[1] || '').trim())
}

function headings(html: string, tag: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(strip(html))) !== null) {
    const t = text(m[1] || '')
    if (t && t.length < 160) out.push(t)
  }
  return Array.from(new Set(out))
}

/** Señales digitales detectadas en el HTML real. */
function signals(html: string, _url: string): SignalsResult {
  const h = html.toLowerCase()
  const found: string[] = []
  const add = (cond: boolean, label: string) => {
    if (cond) found.push(label)
  }

  add(/<form[\s>]/i.test(h), 'Formulario de contacto')
  add(
    /intercom|crisp\.chat|tawk\.to|tidio|zendesk|drift\.com|livechat|hubspot.*conversations|zoho.*salesiq/.test(
      h
    ),
    'Chat en vivo instalado'
  )
  add(/wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//.test(h), 'WhatsApp enlazado')
  add(
    /calendly|doctoralia|bookings|reservar|reserva online|pedir cita|cita previa|booking/.test(
      h
    ),
    'Reserva o cita online'
  )
  add(/href=["']tel:/.test(h), 'Teléfono clicable')
  add(/href=["']mailto:/.test(h), 'Email visible')
  add(
    /woocommerce|shopify|prestashop|magento|add-to-cart|carrito/.test(h),
    'Tienda online'
  )
  add(/gtag\(|googletagmanager|google-analytics|analytics\.js/.test(h), 'Google Analytics')
  add(/connect\.facebook\.net|fbq\(/.test(h), 'Píxel de Meta')
  add(/cookieconsent|cookiebot|onetrust|didomi|cookie-law/.test(h), 'Banner de cookies')
  add(/\/blog|\/noticias|\/actualidad/.test(h), 'Blog o noticias')
  add(/instagram\.com/.test(h), 'Instagram')
  add(/linkedin\.com/.test(h), 'LinkedIn')

  const langs = new Set<string>()
  const lang = /<html[^>]+lang=["']([a-z-]+)["']/i.exec(html)?.[1]
  if (lang) langs.add(lang.split('-')[0]!.toLowerCase())
  {
    const re = /hreflang=["']([a-z-]+)["']/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
      const l = (m[1] || '').split('-')[0]!.toLowerCase()
      if (l && l !== 'x') langs.add(l)
    }
  }

  const tech: string[] = []
  if (/wp-content|wp-includes/.test(h)) tech.push('WordPress')
  if (/shopify/.test(h)) tech.push('Shopify')
  if (/wix\.com|wixstatic/.test(h)) tech.push('Wix')
  if (/squarespace/.test(h)) tech.push('Squarespace')
  if (/_next\/static/.test(h)) tech.push('Next.js')
  if (/webflow/.test(h)) tech.push('Webflow')

  return { found, langs: Array.from(langs), tech }
}

/** Enlaces internos interesantes (quiénes somos, servicios, contacto). Máx. 3. */
function interestingLinks(html: string, base: string): string[] {
  const out = new Map<string, string>()
  const want =
    /(quienes-somos|quiénes|sobre-nosotros|nosotros|about|empresa|servicios|services|que-hacemos|productos|contacto|contact|precios|tarifas|planes)/i
  const re = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const href = m[1] || ''
    const label = text(m[2] || '')
    if (!want.test(href) && !want.test(label)) continue
    let abs: string
    try {
      abs = new URL(href, base).toString()
    } catch {
      continue
    }
    try {
      if (new URL(abs).host !== new URL(base).host) continue
      if (isBlockedHost(new URL(abs).hostname)) continue
    } catch {
      continue
    }
    if (!out.has(abs) && out.size < 3) out.set(abs, label || href)
  }
  return Array.from(out.keys())
}

function cleanCompanyName(html: string, host: string): string {
  const og = text(meta(html, 'og:site_name'))
  if (og) return og
  const t = text(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '')
  // "Home | Marca", "Marca — Claim" o "Home \ Marca": trozo más largo sin relleno.
  const trozos = t
    .split(/[|·—–\\/]+/)
    .map((x) => x.trim())
    .filter(Boolean)
  const util = trozos.filter((x) => !/^(home|inicio|bienvenidos?|start)$/i.test(x))
  const elegido = (util.length ? util : trozos).sort((a, b) => b.length - a.length)[0]
  return elegido || host
}

/* ── Ganchos por reglas (sin LLM) ─────────────────────────────── */
function rulesHooks(d: {
  senales: string[]
  idiomas: string[]
  servicios: string[]
}): string[] {
  const s = new Set(d.senales)
  const h: string[] = []
  if (s.has('Reserva o cita online') && s.has('Teléfono clicable')) {
    h.push('Tenéis cita online y teléfono a la vez: ¿qué porcentaje entra por cada vía?')
  }
  if (!s.has('Chat en vivo instalado')) {
    h.push('No veo chat en la web. ¿Ha sido una decisión consciente o no ha habido ocasión?')
  } else {
    h.push('Tenéis chat instalado: ¿quién lo atiende y en qué horario?')
  }
  if (s.has('WhatsApp enlazado')) {
    h.push('El WhatsApp de la web, ¿es un número personal, de empresa o la API oficial?')
  }
  if (s.has('Tienda online')) {
    h.push('¿Qué porcentaje de las consultas son sobre el estado de un pedido?')
  }
  if (d.idiomas.length > 1) {
    h.push(`La web está en ${d.idiomas.join(', ')}: ¿la atención también es multiidioma?`)
  }
  if (s.has('Blog o noticias')) {
    h.push('Tenéis blog: ¿os llega negocio por ahí o es solo posicionamiento?')
  }
  if (d.servicios.length > 3) {
    h.push(`Ofrecéis ${d.servicios.length} servicios distintos: ¿por cuál os preguntan más?`)
  }
  h.push('¿Qué pregunta os repiten hasta el aburrimiento?')
  return h.slice(0, 5)
}

function isLlmPayload(
  v: unknown
): v is { sector?: unknown; hace?: unknown; ganchos: unknown[] } {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return Array.isArray(o.ganchos)
}

async function llmEnrich(d: ResearchDraft): Promise<LlmEnrichResult | null> {
  if (!process.env.OPENROUTER_API_KEY) return null

  const model = resolveModel('heavy')
  const system = `Eres analista comercial de Buffalo AI.
Recibes datos REALES scrapeados de la web de un cliente potencial.
Devuelve SOLO JSON:
{ "sector": "...", "hace": "2-3 frases claras: quiénes son y qué hacen, sin marketing", "ganchos": ["...","...","..."] }
- "hace": resumen humano y concreto (quiénes son + actividad). Sin claim vacíos.
- "ganchos": 3 preguntas de reunión ancladas a lo visto (se usan en el copiloto, no en la ficha).
- No inventes datos que no estén.`
  const user = JSON.stringify(d, null, 1).slice(0, 12000)

  try {
    const raw = await openRouterChatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      {
        model,
        temperature: 0.3,
        maxTokens: 900,
        json: true,
      }
    )
    const parsed: unknown = parseJsonFromModelOutput(raw)
    if (!isLlmPayload(parsed)) return null
    const ganchos = parsed.ganchos.filter((g): g is string => typeof g === 'string')
    if (ganchos.length === 0) return null
    return {
      sector: typeof parsed.sector === 'string' ? parsed.sector : undefined,
      hace: typeof parsed.hace === 'string' ? parsed.hace : undefined,
      ganchos,
      modelo: model,
    }
  } catch {
    return null
  }
}

function toScrapedResearch(d: ResearchDraft): ScrapedResearch {
  return {
    url: d.url,
    host: d.host,
    nombre: d.nombre || d.host,
    sector: d.sector || d.tecnologia.join(' · ') || 'Sin clasificar',
    hace: d.hace || d.descripcion || '(sin descripción en su web)',
    servicios: d.servicios.length
      ? d.servicios
      : ['(no he encontrado secciones claras)'],
    senales: [
      ...d.senales,
      ...(d.idiomas.length ? [`Idiomas: ${d.idiomas.join(', ')}`] : []),
      ...(d.tecnologia.length ? [`Tecnología: ${d.tecnologia.join(', ')}`] : []),
    ],
    ganchos: d.ganchos,
    fuentes: d.fuentes,
    origen: d.origen,
    at: d.scrapeadoEn,
  }
}

/**
 * Descarga la web del cliente, extrae señales y (opcionalmente) enriquece con LLM.
 * Devuelve ficha lista para insertar en la nota, o un error legible.
 */
export async function researchUrl(
  input: string
): Promise<ScrapedResearch | ResearchError> {
  let target = String(input || '').trim()
  if (!target) return { error: 'Falta la URL' }
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target

  const initial = assertSafeUrl(target)
  if (!initial.ok) return { error: initial.error }

  let base = initial.url
  const paginas: Array<{ url: string; chars: number }> = []
  let home = await getPage(base.toString())

  if (!home.ok) {
    // Reintento en http:// por si el sitio no tiene TLS
    if (base.protocol === 'https:') {
      const httpTarget = new URL(base.toString())
      httpTarget.protocol = 'http:'
      const httpSafe = assertSafeUrl(httpTarget.toString())
      if (httpSafe.ok) {
        base = httpSafe.url
        const alt = await getPage(base.toString())
        if (alt.ok) home = alt
        else if (!home.reason && alt.reason) home = alt
      }
    }
  }

  if (!home.ok) {
    return {
      error: `No he podido leer ${base.host}: ${home.reason || 'HTTP ' + home.status}`,
      detalle:
        'Puede que bloqueen bots, que el dominio no exista o que tarde demasiado.',
    }
  }

  paginas.push({ url: home.url, chars: home.html.length })

  let todo = home.html
  const servicios = new Set<string>()
  for (const h of headings(home.html, 'h2')) servicios.add(h)
  for (const h of headings(home.html, 'h3')) servicios.add(h)

  for (const link of interestingLinks(home.html, home.url)) {
    const sub = await getPage(link)
    if (!sub.ok) continue
    paginas.push({ url: sub.url, chars: sub.html.length })
    todo += '\n' + sub.html
    for (const h of headings(sub.html, 'h1')) servicios.add(h)
    for (const h of headings(sub.html, 'h2')) servicios.add(h)
  }

  const sig = signals(todo, home.url)
  const cuerpo = text(home.html).slice(0, 2500)
  const host = new URL(home.url).host.replace(/^www\./, '')

  const d: ResearchDraft = {
    url: home.url,
    host,
    nombre: cleanCompanyName(home.html, host),
    titulo: text(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(home.html)?.[1] || ''),
    descripcion: meta(home.html, 'description') || meta(home.html, 'og:description'),
    h1: headings(home.html, 'h1').slice(0, 4),
    servicios: Array.from(servicios).filter((s) => s.length > 3).slice(0, 10),
    senales: sig.found,
    idiomas: sig.langs,
    tecnologia: sig.tech,
    extracto: cuerpo.slice(0, 700),
    fuentes: paginas.map((p) => p.url),
    scrapeadoEn: new Date().toISOString(),
    ganchos: [],
    sector: '',
    hace: '',
    origen: 'scraping real',
  }

  d.ganchos = rulesHooks(d)
  d.hace = d.descripcion || d.extracto.slice(0, 180)
  d.origen = 'scraping real'

  const ia = await llmEnrich(d)
  if (ia) {
    d.sector = ia.sector || d.sector
    d.hace = ia.hace || d.hace
    d.ganchos = ia.ganchos.slice(0, 5)
    d.origen = 'scraping real + IA (' + ia.modelo + ')'
  }

  return toScrapedResearch(d)
}

/** Formato visual limpio del bloque ┌ │ └ para insertar en la nota. */
export function researchToNoteText(data: ScrapedResearch): string {
  const li = (s: string) => `│ ${s}`
  const blank = () => `│`
  const bullets = (items: string[], empty = '—') =>
    items.length ? items.map((s) => li(`· ${s}`)) : [li(`· ${empty}`)]

  return [
    `${RES_ABRE}  ${data.nombre}`,
    li(data.host + (data.sector ? `  ·  ${data.sector}` : '')),
    blank(),
    li('QUIÉNES SON'),
    li(data.hace || 'Sin descripción clara en la web.'),
    blank(),
    li('QUÉ OFRECEN'),
    ...bullets(data.servicios || [], 'Sin servicios claros'),
    blank(),
    li('EN LA WEB SE VE'),
    ...bullets((data.senales || []).slice(0, 6), 'Pocas señales digitales'),
    blank(),
    `${RES_CIERRA}  Ficha web`,
  ].join('\n')
}
