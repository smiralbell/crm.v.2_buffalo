'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChannelCostsForm } from '@/components/leads/ChannelCostsEditor'
import type { CostChannelKey } from '@/lib/leads/channel-costs'

export default function MarketingChannelCostsCard({
  period,
  channel,
  title,
}: {
  period: string
  channel: CostChannelKey
  title?: string
}) {
  return (
    <Card className="shadow-sm border-gray-200/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-800">
          {title || 'Costes de captación'}
        </CardTitle>
        <p className="text-xs text-gray-500 font-normal">
          Setup / mensualidad (o comisión). Se sincroniza con dashboard y finanzas.
        </p>
      </CardHeader>
      <CardContent>
        <ChannelCostsForm period={period} filterChannel={channel} compact />
      </CardContent>
    </Card>
  )
}
