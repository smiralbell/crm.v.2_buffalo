import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { periodBounds } from '@/lib/leads/analytics'
import {
  clearChannelCostOverrides,
  COST_CHANNEL_KEYS,
  COST_CHANNEL_META,
  deleteChannelCostLine,
  getChannelCostsDetail,
  upsertChannelCostLine,
  type CostChannelKey,
  type CostKind,
} from '@/lib/leads/channel-costs'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const period =
    typeof req.query.period === 'string' && /^\d{4}-\d{2}$/.test(req.query.period)
      ? req.query.period
      : (() => {
          const now = new Date()
          return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        })()

  const filter =
    typeof req.query.channel === 'string' &&
    COST_CHANNEL_KEYS.includes(req.query.channel as CostChannelKey)
      ? (req.query.channel as CostChannelKey)
      : null

  const { start, end, label } = periodBounds(period)

  if (req.method === 'GET') {
    try {
      const channels = await getChannelCostsDetail(period, start, end, filter)
      return res.status(200).json({
        period,
        period_label: label.charAt(0).toUpperCase() + label.slice(1),
        channels,
      })
    } catch (err) {
      console.error('[api/leads/channel-costs] GET', err)
      return res.status(500).json({ error: 'Error cargando costes' })
    }
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const body = req.body || {}
      const channel = String(body.channel || '') as CostChannelKey
      if (!COST_CHANNEL_KEYS.includes(channel)) {
        return res.status(400).json({ error: 'Canal inválido' })
      }

      if (body.clear === true) {
        await clearChannelCostOverrides(period, channel)
      } else if (body.clear_kind && body.cost_kind) {
        const cost_kind = String(body.cost_kind) as CostKind
        if (!COST_CHANNEL_META[channel].kinds.includes(cost_kind)) {
          return res.status(400).json({ error: 'Tipo de coste inválido' })
        }
        await deleteChannelCostLine(period, channel, cost_kind)
      } else {
        const cost_kind = String(body.cost_kind || 'monthly') as CostKind
        if (!COST_CHANNEL_META[channel].kinds.includes(cost_kind)) {
          return res.status(400).json({ error: 'Tipo de coste inválido' })
        }
        const spend_eur = Number(body.spend_eur)
        if (!Number.isFinite(spend_eur) || spend_eur < 0) {
          return res.status(400).json({ error: 'spend_eur inválido' })
        }
        await upsertChannelCostLine({
          period,
          channel,
          cost_kind,
          spend_eur,
          notes: body.notes != null ? String(body.notes) : null,
        })
      }

      const channels = await getChannelCostsDetail(period, start, end, filter)
      return res.status(200).json({
        period,
        period_label: label.charAt(0).toUpperCase() + label.slice(1),
        channels,
        ok: true,
      })
    } catch (err) {
      console.error('[api/leads/channel-costs] PUT', err)
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Error guardando coste',
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
