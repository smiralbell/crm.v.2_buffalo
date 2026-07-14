import { GetServerSideProps } from 'next'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { canAccessColdCall } from '@/lib/auth-rbac'
import ComercialReunionesPanel from '@/components/coldcall/ComercialReunionesPanel'

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

export default function ComercialReunionesPage() {
  return (
    <Layout>
      <ComercialReunionesPanel />
    </Layout>
  )
}
