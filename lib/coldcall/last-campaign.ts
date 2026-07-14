const STORAGE_KEY = 'buffalo_coldcall_last_campaign'

export function saveLastCampaignId(campaignId: number): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, String(campaignId))
  } catch {
    /* ignore */
  }
}

export function getLastCampaignId(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const id = parseInt(raw, 10)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

export function lastCampaignCallHref(campaignId: number | null): string {
  if (campaignId) return `/coldcalling/campanas/${campaignId}/llamadas`
  return '/comercial/campanas'
}
