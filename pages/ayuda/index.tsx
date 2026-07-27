import { GetServerSideProps } from 'next'
import Head from 'next/head'
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

/** Página standalone: sin Layout / sin menú lateral del CRM. */
export default function AyudaPage({ role, initialArticleId }: Props) {
  return (
    <>
      <Head>
        <title>Documentación · Buffalo CRM</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>
      <HelpCenter role={role} initialArticleId={initialArticleId} />
    </>
  )
}
