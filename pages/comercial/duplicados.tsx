import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { canAccessColdCall } from '@/lib/auth-rbac'
import CampaignDuplicatesPanel from '@/components/coldcall/CampaignDuplicatesPanel'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (!canAccessColdCall(user.role)) {
      return { redirect: { destination: '/login', permanent: false } }
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function ComercialDuplicadosPage() {
  const router = useRouter()
  const campaignParam = router.query.campaign as string | undefined
  const campaignId = campaignParam ? parseInt(campaignParam, 10) : undefined

  return (
    <Layout>
      <CampaignDuplicatesPanel
        campaignId={Number.isFinite(campaignId) ? campaignId : undefined}
      />
    </Layout>
  )
}
