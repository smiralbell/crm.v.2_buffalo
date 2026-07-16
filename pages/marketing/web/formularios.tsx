import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import WebFormSubmissionsPanel from '@/components/WebFormSubmissionsPanel'
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

export default function MarketingWebFormulariosPage({ period }: { period: string }) {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="space-y-2">
          <Link
            href="/marketing?tab=web"
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a Web
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Formulario rellenado</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Envíos del formulario web · período {period}
            </p>
          </div>
        </div>
        <WebFormSubmissionsPanel period={period} />
      </div>
    </Layout>
  )
}
