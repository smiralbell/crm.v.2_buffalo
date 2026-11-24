import type { ConfiguradorConfig } from '@/lib/engranaje5/types'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'

export function encodeConfiguradorConfig(cfg: ConfiguradorConfig): string {
  return Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64')
}

/** Une config existente con parches sin perder el resto de campos. */
export function mergeLeadConfig(
  raw: string | null | undefined,
  patch: Partial<ConfiguradorConfig>
): { cfg: ConfiguradorConfig; encoded: string } {
  const existing = parseConfiguradorConfig(raw) || ({ mode: 'custom' } as ConfiguradorConfig)
  const cfg: ConfiguradorConfig = {
    ...existing,
    ...patch,
    mode: existing.mode || patch.mode || 'custom',
  }
  return { cfg, encoded: encodeConfiguradorConfig(cfg) }
}
