import { GetServerSideProps } from 'next'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import FirefliesInboxPanel from '@/components/fireflies/FirefliesInboxPanel'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function FirefliesPage() {
  return (
    <Layout>
      <FirefliesInboxPanel />
    </Layout>
  )
}
