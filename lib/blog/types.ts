/**
 * Módulo Blog (motor de contenidos de buffaloia.com).
 *
 * Es un módulo aislado: sus datos viven en su propia tabla (blog_docs)
 * y no lee ni escribe en ninguna tabla de otros módulos del CRM.
 */

/** Código de categoría: A-G, S y N son las de serie; las creadas desde el panel usan c-xxxx. */
export type ThemeCode = string

export type PostStatus =
  | 'idea'        // tema asignado, sin investigar
  | 'brief'       // investigación hecha: palabra clave, competencia, estructura
  | 'borrador'    // texto escrito, aún no pasa los controles
  | 'revision'    // pasa los controles automáticos, espera a una persona
  | 'aprobado'    // listo, se publica en su hueco del calendario
  | 'publicado'
  | 'rechazado'

export type PostKind = 'pilar' | 'articulo' | 'sector' | 'estudio' | 'actualidad'

export interface Theme {
  code: ThemeCode
  name: string
  question: string
  salesPage: string // ruta interna o URL completa
  /** Solo en las categorías creadas desde el panel */
  color?: string
}

/** Página de la web que se puede enlazar. */
export interface SitePage {
  path: string
  title: string
  about: string
  /** No se enlaza desde el blog (solo va en el sitemap) */
  noLink?: boolean
}

/** Tema de partida: del calendario anual, propuesto por la IA, una noticia o escrito a mano. */
export interface Topic {
  id: string
  source: 'calendario' | 'propuesta' | 'noticia' | 'manual'
  order: number // posición en la cola; el calendario de Sergi trae 1-90
  title: string
  keyword: string
  theme: ThemeCode
  kind: PostKind
  destination: string
  ownMaterial: string
  oldUrl?: string
  notes?: string
  /** sugerido = propuesta de la IA que aún no habéis aceptado; pendiente = en la cola */
  status: 'sugerido' | 'pendiente' | 'usado' | 'descartado'
  /** Datos de la investigación cuando el tema viene de una propuesta o noticia. */
  evidence?: {
    searches?: string[]
    whyNow?: string
    intent?: string
    demand?: 'alta' | 'media' | 'baja'
    links?: string[]
    sources?: { title: string; url: string }[]
  }
  createdAt: string
}

export interface KeywordResearch {
  keyword: string
  intent: 'informativa' | 'comercial' | 'transaccional' | 'navegacional'
  demand: 'alta' | 'media' | 'baja'
  /** Búsquedas reales que aparecen en el autocompletado de Google, Bing y DuckDuckGo. */
  suggestions: string[]
  questions: string[]
  secondary: string[]
  alternatives: { keyword: string; why: string }[]
  competitors: { title: string; url: string; covers: string }[]
  gaps: string[]
}

export interface Brief {
  research: KeywordResearch
  h1: string
  slug: string
  metaDescription: string
  angle: string
  outline: { h2: string; h3?: string[]; notes?: string }[]
  faq: string[]
  internalLinks: { url: string; anchorType: 'h2' | 'frase' | 'palabra'; reason: string }[]
  externalLinks: { url: string; title: string; reason: string }[]
  ownMaterial: string
  cta: string
  imagePrompts: { featured: string; infographic: string }
}

export interface SeoCheck {
  id: string
  label: string
  ok: boolean
  detail: string
  severity: 'error' | 'aviso'
}

export interface PostImage {
  slot: 'destacada' | 'imagen1' | 'imagen2'
  prompt: string
  alt: string
  /** data URL (base64) mientras no se publica */
  dataUrl?: string
  file?: string
}

export interface Post {
  id: string
  topicId?: string
  status: PostStatus
  kind: PostKind
  theme: ThemeCode
  title: string
  h1: string
  slug: string
  metaDescription: string
  keyword: string
  secondary: string[]
  excerpt: string
  /** HTML del cuerpo. Lleva (imagen1) e (imagen2) donde van las imágenes. */
  body: string
  faq: { q: string; a: string }[]
  internalLinks: string[]
  externalLinks: string[]
  images: PostImage[]
  imagePrompts?: { featured: string; infographic: string }
  brief?: Brief
  checks?: SeoCheck[]
  score?: number
  author: string
  reviewer?: string
  scheduledAt?: string
  publishedAt?: string
  updatedAt: string
  createdAt: string
  history: { at: string; event: string; by?: string; detail?: string }[]
  cost?: { usd: number }
  rejectReason?: string
  /** Escrito por una persona en «Escribir yo»: el motor no reescribe el texto */
  manual?: boolean
  /** Último error del motor con este artículo, para enseñarlo en el panel */
  lastError?: { at: string; step: string; message: string }
  /** Cuándo se subió a la web por última vez */
  uploadedAt?: string
}

/** Hueco del calendario aleatorio. */
export interface Slot {
  id: string
  at: string // ISO con hora
  week: string // 2026-W45
  kind: 'normal' | 'actualidad'
  postId?: string
  locked?: boolean
}

export interface ScheduleWindow {
  from: string // "08:30"
  to: string // "13:30"
}

export interface BlogSettings {
  enabled: boolean
  publishing: {
    mode: 'revision' | 'automatico' | 'revision_con_plazo'
    autoPublishAfterHours: number
  }
  schedule: {
    minPerWeek: number
    maxPerWeek: number
    weekdays: number[] // 1 = lunes ... 7 = domingo
    windows: ScheduleWindow[]
    timezone: string
    minGapHours: number
    planAheadWeeks: number
    newsEvery: number // 1 de cada N es de actualidad
    pauses: { from: string; to: string; label: string }[]
    startDate: string
  }
  leadTimes: { briefDaysBefore: number; draftDaysBefore: number }
  topics: {
    source: 'calendario' | 'propuestas' | 'mixto'
    proposalsPerSearch: number
  }
  models: {
    /** economico | equilibrado | maximo | personalizado */
    preset: string
    research: string
    writing: string
    webSearchResults: number
  }
  images: {
    provider: 'openai' | 'openrouter' | 'ninguno'
    openaiModel: string
    openrouterModel: string
    size: string
  }
  seo: {
    keywordMaxWords: number
    keywordMinCount: number
    secondaryCount: number
    secondaryMinCount: number
    h1Max: number
    metaMax: number
    slugMax: number
    paragraphMaxLines: number
    charsPerLine: number
    internalLinks: number
    externalLinks: number
    wordsArticle: [number, number]
    wordsPillar: [number, number]
    maxRewrites: number
  }
  site: {
    domain: string
    blogPath: string
    authorName: string
    authorRole: string
  }
  publish: {
    /** ftp = se sube solo a CDMON al publicar; paquete = se descarga un ZIP y se sube a mano */
    method: 'ftp' | 'paquete'
    remoteDir: string
    secure: boolean
  }
  /** monthlyUsd: tope del mes; perArticleUsd: tope de un artículo (si lo pasa, se para) */
  budget: { monthlyUsd: number; perArticleUsd: number }
  /** Categorías añadidas desde el panel, además de las de serie */
  customThemes: Theme[]
}

export interface BlogRules {
  voice: string
  structure: string
  seo: string
  bannedPhrases: string[]
  neverSay: string[]
  ownMaterial: string
  trustedSources: string[]
  imageStyle: string
}

export interface RunLog {
  id: string
  at: string
  kind: string
  ok: boolean
  message: string
  postId?: string
  usd?: number
}
