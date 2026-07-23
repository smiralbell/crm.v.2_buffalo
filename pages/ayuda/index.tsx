import { GetServerSideProps } from 'next'
import Layout from '@/components/Layout'
import HelpCenter from '@/components/help/HelpCenter'
import { requireAuth, type CrmRole } from '@/lib/auth'

type Props = {
  role: CrmRole
  initialArticleId: string | null
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  try {
    const user = await requireAuth(context)
    const q = context.query.a
    const initialArticleId = typeof q === 'string' ? q : null
    return {
      props: {
        role: user.role,
        initialArticleId,
      },
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
}

export default function AyudaPage({ role, initialArticleId }: Props) {
  return (
    <Layout>
      <div className="w-full pb-10">
        <HelpCenter role={role} initialArticleId={initialArticleId} />
      </div>
    </Layout>
  )
}
