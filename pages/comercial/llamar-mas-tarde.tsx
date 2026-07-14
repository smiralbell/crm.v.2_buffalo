import { GetServerSideProps } from 'next'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { canAccessColdCall } from '@/lib/auth-rbac'
import ComercialCallbacksPanel from '@/components/coldcall/ComercialCallbacksPanel'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (!canAccessColdCall(user.role)) {
      return { redirect: { destination: '/login', permanent: false } }
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function ComercialCallbacksPage() {
  return (
    <Layout>
      <ComercialCallbacksPanel />
    </Layout>
  )
}
