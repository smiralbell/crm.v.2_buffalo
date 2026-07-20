import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import WebCalBookingsPanel from '@/components/WebCalBookingsPanel'
import { ArrowLeft } from 'lucide-react'

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

export default function MarketingWebCalendarioPage({ period }: { period: string }) {
  return (
    <Layout>
      <div className="w-full space-y-5">
        <Link
          href="/marketing?tab=web"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a Web
        </Link>
        <WebCalBookingsPanel period={period} />
      </div>
    </Layout>
  )
}
