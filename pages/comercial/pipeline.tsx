import { GetServerSideProps } from 'next'
import { requireAuth } from '@/lib/auth'
import { getColdCallPipelineId } from '@/lib/pipelines/cold-calling'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin' && user.role !== 'comercial') {
      return { notFound: true }
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }

  const pipelineId = await getColdCallPipelineId()
  if (!pipelineId) return { notFound: true }

  return {
    redirect: {
      destination: `/pipelines/${pipelineId}`,
      permanent: false,
    },
  }
}

export default function ComercialPipelineRedirect() {
  return null
}
