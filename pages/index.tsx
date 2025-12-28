import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
    // Si hay sesión, redirigir a dashboard
    return {
      redirect: {
        destination: '/dashboard',
        permanent: false,
      },
    }
  } catch {
    // Si no hay sesión, redirigir a login
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }
}

export default function Index() {
  return null
}

