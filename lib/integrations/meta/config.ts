export const DEFAULT_META_GRAPH_VERSION = 'v21.0'
export const META_LEAD_ORIGEN = 'meta_ads'

export type MetaPageConfig = {
  graphVersion: string
  verifyToken: string | null
  appSecret: string | null
  allowedPageIds: string[]
  pageTokens: Record<string, string>
  defaultPageToken: string | null
  pagePipelines: Record<string, string>
  pageOrigen: Record<string, string>
}

function csvList(raw: string | undefined): string[] {
  return (raw || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parsePairs(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  const trimmed = (raw || '').trim()
  if (!trimmed) return out
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>
      for (const [k, v] of Object.entries(json)) {
        if (k && typeof v === 'string' && v.trim()) out[k.trim()] = v.trim()
      }
      return out
    } catch {
      return out
    }
  }
  for (const part of trimmed.split(/[,;\n]+/)) {
    const m = part.trim().match(/^(\d+)\s*[:=]\s*(.+)$/)
    if (!m) continue
    out[m[1]] = m[2].trim()
  }
  return out
}

export function metaGraphVersion(): string {
  const v = process.env.META_GRAPH_VERSION?.trim() || DEFAULT_META_GRAPH_VERSION
  return v.startsWith('v') ? v : `v${v}`
}

export function getMetaPageConfig(): MetaPageConfig {
  const pageTokens = parsePairs(process.env.META_PAGE_TOKENS)
  return {
    graphVersion: metaGraphVersion(),
    verifyToken: process.env.META_VERIFY_TOKEN?.trim() || null,
    appSecret: process.env.META_APP_SECRET?.trim() || null,
    allowedPageIds: csvList(process.env.META_ALLOWED_PAGE_IDS),
    pageTokens,
    defaultPageToken: process.env.META_PAGE_ACCESS_TOKEN?.trim() || null,
    pagePipelines: parsePairs(process.env.META_PAGE_PIPELINE),
    pageOrigen: parsePairs(process.env.META_PAGE_ORIGEN),
  }
}

/** Solo páginas. Cualquier formulario o campaña de una página autorizada entra. */
export function isMetaPageAllowed(pageId: string, cfg = getMetaPageConfig()): boolean {
  const id = pageId.trim()
  if (!id) return false
  if (cfg.allowedPageIds.length) return cfg.allowedPageIds.includes(id)
  const tokenPages = Object.keys(cfg.pageTokens)
  if (tokenPages.length) return tokenPages.includes(id)
  return Boolean(cfg.defaultPageToken)
}

export function pageAccessToken(pageId: string, cfg = getMetaPageConfig()): string | null {
  return cfg.pageTokens[pageId.trim()] || cfg.defaultPageToken
}

export function pagePipelineId(pageId: string, cfg = getMetaPageConfig()): string | null {
  return cfg.pagePipelines[pageId.trim()] || null
}

export function pageOrigen(pageId: string, cfg = getMetaPageConfig()): string {
  return cfg.pageOrigen[pageId.trim()] || META_LEAD_ORIGEN
}

export function graphApiBase(cfg = getMetaPageConfig()): string {
  return `https://graph.facebook.com/${cfg.graphVersion}`
}
