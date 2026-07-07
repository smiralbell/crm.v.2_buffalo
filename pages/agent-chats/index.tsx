import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'

/** Redirige al apartado Chat IA dentro de Marketing (ENG 1) */
export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }

  return {
    redirect: {
      destination: '/marketing?tab=web&section=chat',
      permanent: false,
    },
  }
}

export default function AgentChatsRedirect() {
  return null
}
