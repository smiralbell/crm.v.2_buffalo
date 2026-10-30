import type { NextApiRequest, NextApiResponse } from 'next'
import { crmClientMetadata, publishedClientId } from '@/lib/retencion/mcp/oauth'

/**
 * Identidad publicada del CRM como cliente OAuth (Client ID Metadata Document):
 * los servidores MCP que lo admiten usan esta URL como client_id sin registro previo.
 * Es pública a propósito: no contiene secretos.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.status(200).json({ client_id: publishedClientId(), ...crmClientMetadata() })
}
