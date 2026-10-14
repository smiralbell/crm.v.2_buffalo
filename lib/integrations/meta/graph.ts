import {
  getMetaPageConfig,
  graphApiBase,
  pageAccessToken,
  type MetaPageConfig,
} from '@/lib/integrations/meta/config'
import { parseGraphLead, type ParsedMetaLead } from '@/lib/integrations/meta/parse'

const LEAD_FIELDS = [
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

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

async function graphGet(
  objectId: string,
  fields: string,
  token: string,
  cfg: MetaPageConfig
): Promise<Record<string, unknown> | null> {
  const id = objectId.trim()
  if (!id) return null
  try {
    const url = `${graphApiBase(cfg)}/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      return null
    }
    if (!res.ok) return null
    return asRecord(json)
  } catch {
    return null
  }
}

async function fillName(
  currentName: string | null,
  objectId: string | null,
  token: string,
  cfg: MetaPageConfig
): Promise<string | null> {
  if (currentName) return currentName
  if (!objectId) return null
  const rec = await graphGet(objectId, 'id,name', token, cfg)
  return str(rec?.name)
}

export async function fetchMetaLeadFromGraph(
  leadgenId: string,
  pageId: string,
  cfg = getMetaPageConfig()
): Promise<{ lead: ParsedMetaLead; raw: unknown }> {
  const token = pageAccessToken(pageId, cfg)
  if (!token) {
    throw new Error(`Sin token de página para page_id ${pageId}. Configura META_PAGE_ACCESS_TOKEN o META_PAGE_TOKENS.`)
  }
  const url = `${graphApiBase(cfg)}/${encodeURIComponent(leadgenId)}?fields=${LEAD_FIELDS}&access_token=${encodeURIComponent(token)}`
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

/**
 * Nombres de formulario, página, campaña, conjunto y anuncio.
 * Cualquier fallo se ignora: el contacto ya se puede guardar con los IDs que haya.
 */
export async function enrichMetaLeadAttribution(
  lead: ParsedMetaLead,
  pageId: string,
  cfg = getMetaPageConfig()
): Promise<ParsedMetaLead> {
  const token = pageAccessToken(pageId, cfg)
  if (!token) return lead
  try {
    const [form_name, page_name, campaign_name, adset_name, ad_name] = await Promise.all([
      fillName(lead.form_name, lead.form_id, token, cfg),
      fillName(lead.page_name, lead.page_id || pageId, token, cfg),
      fillName(lead.campaign_name, lead.campaign_id, token, cfg),
      fillName(lead.adset_name, lead.adset_id, token, cfg),
      fillName(lead.ad_name, lead.ad_id, token, cfg),
    ])
    return {
      ...lead,
      page_id: lead.page_id || pageId || null,
      form_name,
      page_name,
      campaign_name,
      adset_name,
      ad_name,
    }
  } catch {
    return { ...lead, page_id: lead.page_id || pageId || null }
  }
}
