import { getMetaAdsConfig, type MetaAdsTokenSource } from '@/lib/integrations/meta/config'
import { graphGetMe, graphGetPermissions, graphListAdAccounts } from '@/lib/integrations/meta/ads-graph'

export type MetaAdsAccessReport = {
  ready: boolean
  token_present: boolean
  token_source: MetaAdsTokenSource | null
  token_kind: 'user' | 'page' | 'unknown' | null
  ads_read: boolean | null
  ad_account_ids_configured: string[]
  ad_accounts_from_token: { id: string; name: string | null }[]
  missing: string[]
  warnings: string[]
}

function isPageTokenSource(source: MetaAdsTokenSource | null): boolean {
  return source === 'META_PAGE_ACCESS_TOKEN' || source === 'META_PAGE_TOKENS'
}

let inspectCache: { at: number; report: MetaAdsAccessReport } | null = null

export async function inspectMetaAdsAccess(force = false): Promise<MetaAdsAccessReport> {
  if (!force && inspectCache && Date.now() - inspectCache.at < 5 * 60_000) {
    return inspectCache.report
  }
  const report = await inspectMetaAdsAccessUncached()
  inspectCache = { at: Date.now(), report }
  return report
}

async function inspectMetaAdsAccessUncached(): Promise<MetaAdsAccessReport> {
  const cfg = getMetaAdsConfig()
  const missing: string[] = []
  const warnings: string[] = []

  if (!cfg.adsToken) {
    missing.push('META_ADS_ACCESS_TOKEN (token de servidor con ads_read y acceso a las cuentas)')
    missing.push('META_AD_ACCOUNT_IDS (IDs act_… de las cuentas publicitarias, coma-separados)')
    return {
      ready: false,
      token_present: false,
      token_source: null,
      token_kind: null,
      ads_read: null,
      ad_account_ids_configured: [],
      ad_accounts_from_token: [],
      missing,
      warnings: [
        'El token de página de Lead Ads (META_PAGE_ACCESS_TOKEN) no basta para campañas ni estadísticas. Hace falta un token de usuario del sistema o de usuario con permiso ads_read.',
      ],
    }
  }

  if (isPageTokenSource(cfg.adsTokenSource)) {
    warnings.push(
      'Estás reutilizando el token de página de Lead Ads. Suele servir para formularios, no para Marketing API (campañas e insights). Configura META_ADS_ACCESS_TOKEN con ads_read.'
    )
  }

  const [me, permissions, discovered] = await Promise.all([
    graphGetMe(cfg),
    graphGetPermissions(cfg),
    graphListAdAccounts(cfg),
  ])

  let tokenKind: 'user' | 'page' | 'unknown' = 'unknown'
  if (isPageTokenSource(cfg.adsTokenSource)) tokenKind = 'page'
  else if (me?.id) tokenKind = 'user'

  const ads_read = permissions.length ? permissions.includes('ads_read') || permissions.includes('ads_management') : null
  if (ads_read === false) {
    missing.push('Permiso ads_read en el token (Business Settings → System users → Generate token)')
  } else if (ads_read == null && isPageTokenSource(cfg.adsTokenSource)) {
    missing.push('Permiso ads_read: este token de página no declara permisos de anuncios')
  }

  const configured = cfg.adAccountIds
  if (!configured.length && !discovered.length) {
    missing.push('META_AD_ACCOUNT_IDS (ninguna cuenta publicitaria configurada ni descubierta con este token)')
  }

  if (!cfg.appId) {
    warnings.push('META_APP_ID no está definido. No es obligatorio para sincronizar, sí para depurar el token.')
  }

  const ready =
    Boolean(cfg.adsToken) &&
    ads_read !== false &&
    (configured.length > 0 || discovered.length > 0)

  return {
    ready,
    token_present: true,
    token_source: cfg.adsTokenSource,
    token_kind: tokenKind,
    ads_read,
    ad_account_ids_configured: configured,
    ad_accounts_from_token: discovered,
    missing: Array.from(new Set(missing)),
    warnings,
  }
}

export async function resolveAdAccountIds(): Promise<string[]> {
  const cfg = getMetaAdsConfig()
  if (cfg.adAccountIds.length) return cfg.adAccountIds
  const discovered = await graphListAdAccounts(cfg)
  return Array.from(new Set(discovered.map((a) => a.id)))
}
