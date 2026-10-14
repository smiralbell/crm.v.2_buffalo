import {
  getMetaPageConfig,
  graphApiBase,
  pageAccessToken,
} from '@/lib/integrations/meta/config'
import { parseGraphLead, type ParsedMetaLead } from '@/lib/integrations/meta/parse'

const GRAPH_FIELDS = [
  'id',
  'created_time',
  'ad_id',
  'ad_name',
  'adset_id',
  'adset_name',
  'campaign_id',
  'campaign_name',
  'form_id',
  'field_data',
  'platform',
  'is_organic',
].join(',')

export async function fetchMetaLeadFromGraph(
  leadgenId: string,
  pageId: string,
  cfg = getMetaPageConfig()
): Promise<{ lead: ParsedMetaLead; raw: unknown }> {
  const token = pageAccessToken(pageId, cfg)
  if (!token) {
    throw new Error(`Sin token de página para page_id ${pageId}. Configura META_PAGE_ACCESS_TOKEN o META_PAGE_TOKENS.`)
  }
  const url = `${graphApiBase(cfg)}/${encodeURIComponent(leadgenId)}?fields=${GRAPH_FIELDS}&access_token=${encodeURIComponent(token)}`
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`Graph API respuesta no JSON (${res.status})`)
  }
  if (!res.ok) {
    const rec = json && typeof json === 'object' ? (json as { error?: { message?: string } }) : null
    const msg = rec?.error?.message || `Graph API ${res.status}`
    throw new Error(msg)
  }
  return { lead: parseGraphLead(leadgenId, json), raw: json }
}
