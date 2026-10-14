import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import WebFormSubmissionsPanel from '@/components/WebFormSubmissionsPanel'
import { ArrowLeft, Link2 } from 'lucide-react'

function currentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }

  const period =
    typeof context.query.period === 'string' && /^\d{4}-\d{2}$/.test(context.query.period)
      ? context.query.period
      : currentPeriod()

  return { props: { period } }
}

export default function MarketingWebFormulariosPage({ period }: { period: string }) {
  const [webhookOpen, setWebhookOpen] = useState(false)

  return (
    <Layout>
      <div className="w-full space-y-5">
        <div className="relative flex items-center justify-center border-b border-gray-200">
          <Link
            href="/marketing?tab=web"
            className="absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Web
          </Link>
          <h1 className="px-4 py-2.5 text-sm font-medium text-gray-900">Formularios</h1>
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={() => setWebhookOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <Link2 className="h-4 w-4" />
              Webhook
            </button>
          </div>
        </div>
        <WebFormSubmissionsPanel
          period={period}
          webhookOpen={webhookOpen}
          onWebhookOpenChange={setWebhookOpen}
        />
      </div>
    </Layout>
  )
}
