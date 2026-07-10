import type { GetServerSidePropsContext } from 'next'
import { requireAuth } from '@/lib/auth'
import { canAccessColdCall, defaultHomeForRole } from '@/lib/auth-rbac'

export async function getColdCallPageProps(context: GetServerSidePropsContext) {
  try {
    const user = await requireAuth(context)
    if (!canAccessColdCall(user.role)) {
      return { redirect: { destination: defaultHomeForRole(user.role), permanent: false } }
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}
