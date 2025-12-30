import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch (error) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  try {
    const id = parseInt(context.params?.id as string)
    
    // Redirigir siempre a la página de edición
    return {
      redirect: {
        destination: `/invoices/${id}/edit`,
        permanent: false,
      },
    }
  } catch (error: any) {
    return {
      redirect: {
        destination: '/invoices',
        permanent: false,
      },
    }
  }
}

export default function InvoiceDetail() {
  return null
}

