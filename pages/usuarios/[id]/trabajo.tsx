import { GetServerSideProps } from 'next'
import Layout from '@/components/Layout'
import WorkLogWorkspace from '@/components/trabajo/WorkLogWorkspace'
import { requireAuth } from '@/lib/auth'

interface Props {
  userId: number
}

/** Solo admin: el trabajo diario de una persona (se abre desde Usuarios). */
export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin') return { redirect: { destination: '/trabajo', permanent: false } }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  const userId = parseInt(String(context.params?.id ?? ''), 10)
  if (!Number.isFinite(userId) || userId <= 0) return { notFound: true }
  return { props: { userId } }
}

export default function UsuarioTrabajoPage({ userId }: Props) {
  return (
    <Layout>
      <div className="w-full pb-8">
        <WorkLogWorkspace scopeUserId={userId} storageKey={`trabajo:user:${userId}`} />
      </div>
    </Layout>
  )
}
