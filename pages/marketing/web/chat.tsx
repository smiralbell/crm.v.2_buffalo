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
      <div className="w-full space-y-5">
        <Link
          href="/marketing?tab=web"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a Web
        </Link>
        <AgentChatsPanel embedded />
      </div>
    </Layout>
  )
}
