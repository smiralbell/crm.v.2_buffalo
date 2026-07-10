import { GetServerSideProps } from 'next'
import Layout from '@/components/Layout'
import { getColdCallPageProps } from '@/lib/coldcall/page-auth'
import { useRouter } from 'next/router'
import CampaignCallStation from '@/components/coldcall/CampaignCallStation'

export const getServerSideProps: GetServerSideProps = getColdCallPageProps

export default function CampaignLlamadasPage() {
  const router = useRouter()
  const id = router.query.id as string | undefined

  if (!id) return null

  return (
    <Layout>
      <CampaignCallStation campaignId={id} />
    </Layout>
  )
}
