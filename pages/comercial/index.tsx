import { GetServerSideProps } from 'next'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { canAccessColdCall } from '@/lib/auth-rbac'
import ColdCallingDashboard from '@/components/coldcall/ColdCallingDashboard'
import ComercialHomeCockpit from '@/components/coldcall/ComercialHomeCockpit'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (!canAccessColdCall(user.role)) {
      return { redirect: { destination: '/login', permanent: false } }
    }
    return { props: { role: user.role } }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
}

export default function ComercialDashboardPage({
  role,
}: {
  role: 'admin' | 'comercial' | 'developer'
}) {
  return (
    <Layout>
      {role === 'comercial' ? <ComercialHomeCockpit /> : <ColdCallingDashboard />}
    </Layout>
  )
}
