'use client'

import { useCallback, useEffect, useState } from 'react'
import type { MetaAdsLeadRow } from '@/lib/integrations/meta/list'
import MetaAdsLeadsTable from '@/components/marketing/MetaAdsLeadsTable'

export default function MetaAdsLeadsPanel({ period }: { period: string }) {
  const [rows, setRows] = useState<MetaAdsLeadRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = period ? `?period=${encodeURIComponent(period)}` : ''
      const res = await fetch(`/api/marketing/meta-leads${qs}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) setRows(data.leads || [])
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  return <MetaAdsLeadsTable rows={rows} loading={loading} />
}
