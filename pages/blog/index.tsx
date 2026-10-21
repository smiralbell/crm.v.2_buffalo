import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin') return { redirect: { destination: '/dashboard', permanent: false } }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  const q = context.query.tab
  const view = Array.isArray(q) ? q[0] : q
  const dest = view && view !== 'resumen'
    ? `/marketing?tab=blog&view=${encodeURIComponent(view)}`
    : '/marketing?tab=blog'
  return { redirect: { destination: dest, permanent: false } }
}

export default function BlogRedirect() {
  return null
}
