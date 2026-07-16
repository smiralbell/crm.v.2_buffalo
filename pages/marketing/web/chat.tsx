import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import AgentChatsPanel from '@/components/AgentChatsPanel'
import { ArrowLeft } from 'lucide-react'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function MarketingWebChatPage() {
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
            <h1 className="text-xl font-semibold text-gray-900">Respondieron al chat</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Conversaciones del widget IA de la web
            </p>
          </div>
        </div>
        <AgentChatsPanel embedded />
      </div>
    </Layout>
  )
}
