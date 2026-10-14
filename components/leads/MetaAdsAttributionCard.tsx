import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMetaRef } from '@/lib/integrations/meta/parse'
import { Megaphone } from 'lucide-react'

export type MetaAdsAttributionView = {
  leadgen_id: string
  page_id: string | null
  page_name: string | null
  platform: string | null
  is_organic: boolean | null
  form_id: string | null
  form_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  adset_id: string | null
  adset_name: string | null
  ad_id: string | null
  ad_name: string | null
  answers: { name: string; values: string[] }[]
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-gray-50 last:border-0 gap-3">
      <span className="text-sm text-gray-500 shrink-0 w-32">{label}</span>
      <span className="text-sm text-gray-900 text-right break-all">{value}</span>
    </div>
  )
}

export default function MetaAdsAttributionCard({ data }: { data: MetaAdsAttributionView }) {
  return (
    <Card className="shadow-sm border-gray-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Megaphone className="h-4 w-4" />
          Meta Ads
          {data.is_organic ? (
            <Badge variant="outline" className="text-[10px] font-normal">
              Orgánico
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Row label="Campaña" value={formatMetaRef(data.campaign_name, data.campaign_id)} />
        <Row label="Conjunto" value={formatMetaRef(data.adset_name, data.adset_id)} />
        <Row label="Anuncio" value={formatMetaRef(data.ad_name, data.ad_id)} />
        <Row label="Formulario" value={formatMetaRef(data.form_name, data.form_id)} />
        <Row label="Página" value={formatMetaRef(data.page_name, data.page_id)} />
        <Row label="Plataforma" value={data.platform} />
        <Row label="Leadgen" value={data.leadgen_id} />
        {data.answers.length > 0 && (
          <div className="pt-3 grid gap-3 sm:grid-cols-2">
            {data.answers.map((a) => (
              <div key={a.name}>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{a.name}</p>
                <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">{a.values.join(', ')}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
