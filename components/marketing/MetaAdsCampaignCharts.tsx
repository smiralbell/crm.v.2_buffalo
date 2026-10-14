'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import type { MetaAdsCampaignListRow } from '@/lib/integrations/meta/ads-list'

function dayLabel(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function ChartTooltip({
  active,
  payload,
  label,
  money,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
  money?: boolean
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg space-y-1">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name}>
          {p.name}:{' '}
          <span className="font-semibold">
            {money
              ? Number(p.value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
              : Number(p.value).toLocaleString('es-ES')}
          </span>
        </p>
      ))}
    </div>
  )
}

export default function MetaAdsCampaignCharts({ campaign }: { campaign: MetaAdsCampaignListRow }) {
  const data = campaign.days.map((d) => ({
    label: dayLabel(d.date),
    gasto: d.spend || 0,
    clics: d.link_clicks || 0,
    visitas: d.landing_page_views || 0,
    leads: d.leads_meta || 0,
    impresiones: d.impressions || 0,
  }))
  const has = data.some((d) => d.gasto || d.clics || d.visitas || d.leads)

  if (!has) {
    return (
      <Card className="border-gray-200/80">
        <CardContent className="py-12 text-center text-sm text-gray-400">
          Sin actividad diaria en este periodo.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="pt-5 pb-3">
          <p className="text-sm font-semibold text-gray-800 mb-3">Gasto diario</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={42} />
              <Tooltip content={<ChartTooltip money />} />
              <Line type="monotone" dataKey="gasto" name="Gasto" stroke="#111827" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="pt-5 pb-3">
          <p className="text-sm font-semibold text-gray-800 mb-3">Clics vs visitas a destino</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="clics" name="Clics enlace" stroke="#111827" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="visitas" name="Visitas destino" stroke="#9CA3AF" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="pt-5 pb-3">
          <p className="text-sm font-semibold text-gray-800 mb-3">Leads Meta por día</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="leads" name="Leads" fill="#111827" radius={[6, 6, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
